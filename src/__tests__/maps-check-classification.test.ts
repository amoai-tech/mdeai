import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  MAPS_CHECK_CLASSES,
  MAPS_CHECK_MODES,
  classifyFetchError,
  classifyHttpStatus,
  reportCheckSummary,
  resolveCheckMode,
  resolveExitCode,
  tallyClassifications,
} from "../../.claude/skills/maps/scripts/check-classification.mjs";

const { OK, DRIFT, BROKEN_REFERENCE, EXTERNAL_UNAVAILABLE } = MAPS_CHECK_CLASSES;

describe("Maps live-check classification", () => {
  it("classifies HTTP statuses into the four required outcomes", () => {
    expect(classifyHttpStatus(200)).toBe(OK);
    expect(classifyHttpStatus(204)).toBe(OK);

    // Definitive: the reference is gone.
    expect(classifyHttpStatus(404)).toBe(BROKEN_REFERENCE);
    expect(classifyHttpStatus(410)).toBe(BROKEN_REFERENCE);
    expect(classifyHttpStatus(401)).toBe(BROKEN_REFERENCE);

    // Transport/rate limiting: we could not obtain evidence.
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyHttpStatus(status), String(status)).toBe(EXTERNAL_UNAVAILABLE);
    }
  });

  it("classifies transport failures as external unavailability", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyFetchError(abort)).toBe(EXTERNAL_UNAVAILABLE);

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(classifyFetchError(timeout)).toBe(EXTERNAL_UNAVAILABLE);

    // Undici emits prefixed codes, so the family must match — not just the bare
    // "UND_ERR" literal. This previously passed only via the catch-all default.
    for (const code of [
      "EAI_AGAIN",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EPIPE",
      "UND_ERR",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_CONNECT_TIMEOUT",
    ]) {
      const error = Object.assign(new Error(code), { code });
      expect(classifyFetchError(error), code).toBe(EXTERNAL_UNAVAILABLE);
    }
  });

  it("fails closed on unrecognised errors so a script bug cannot pass as an outage", () => {
    expect(classifyFetchError(new Error("anything else"))).toBe(BROKEN_REFERENCE);
    expect(classifyFetchError(undefined)).toBe(BROKEN_REFERENCE);
    expect(classifyFetchError(new TypeError("x is not a function"))).toBe(BROKEN_REFERENCE);
    expect(classifyFetchError(new ReferenceError("boom"))).toBe(BROKEN_REFERENCE);
    // ENOENT means a missing/unreadable local file — a broken local contract.
    expect(classifyFetchError(Object.assign(new Error("no such file"), { code: "ENOENT" }))).toBe(
      BROKEN_REFERENCE,
    );
  });

  it("defaults to strict so a misconfiguration cannot weaken drift detection", () => {
    expect(resolveCheckMode(undefined)).toBe(MAPS_CHECK_MODES.STRICT);
    expect(resolveCheckMode("")).toBe(MAPS_CHECK_MODES.STRICT);
    expect(resolveCheckMode("STRICT")).toBe(MAPS_CHECK_MODES.STRICT);
    expect(resolveCheckMode("nonsense")).toBe(MAPS_CHECK_MODES.STRICT);
    expect(resolveCheckMode(" advisory ")).toBe(MAPS_CHECK_MODES.ADVISORY);
  });

  it("fails strict mode on any non-OK result", () => {
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [OK])).toBe(0);
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [])).toBe(0);
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [DRIFT])).toBe(2);
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [BROKEN_REFERENCE])).toBe(2);
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [EXTERNAL_UNAVAILABLE])).toBe(2);
    expect(resolveExitCode(MAPS_CHECK_MODES.STRICT, [OK, EXTERNAL_UNAVAILABLE, OK])).toBe(2);
  });

  it("tolerates only external unavailability in advisory mode", () => {
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [OK])).toBe(0);
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [EXTERNAL_UNAVAILABLE])).toBe(0);
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [OK, EXTERNAL_UNAVAILABLE])).toBe(0);

    // Confirmed drift is never downgraded, in either mode.
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [DRIFT])).toBe(2);
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [BROKEN_REFERENCE])).toBe(2);
    expect(resolveExitCode(MAPS_CHECK_MODES.ADVISORY, [EXTERNAL_UNAVAILABLE, BROKEN_REFERENCE])).toBe(2);
  });

  it("tallies and reports every classification in the summary line", () => {
    const tally = tallyClassifications([OK, OK, DRIFT, BROKEN_REFERENCE, EXTERNAL_UNAVAILABLE]);
    expect(tally).toEqual({ OK: 2, DRIFT: 1, BROKEN_REFERENCE: 1, EXTERNAL_UNAVAILABLE: 1 });

    const { line, exitCode } = reportCheckSummary("sample", MAPS_CHECK_MODES.STRICT, [OK, DRIFT]);
    expect(line).toContain("MAPS_CHECK_SUMMARY");
    expect(line).toContain("check=sample");
    expect(line).toContain("mode=strict");
    expect(line).toContain("OK=1");
    expect(line).toContain("DRIFT=1");
    expect(line).toContain("BROKEN_REFERENCE=0");
    expect(line).toContain("EXTERNAL_UNAVAILABLE=0");
    expect(line).toContain("result=FAIL");
    expect(exitCode).toBe(2);

    expect(reportCheckSummary("sample", MAPS_CHECK_MODES.STRICT, [OK]).line).toContain("result=PASS");
  });
});

describe("Maps live-check mode is wired end to end", () => {
  const script = ".claude/skills/maps/scripts/check-google-maps-upstream.mjs";
  const pinned = "6606930272e554171b42d69312674cbe40aa819c";
  const drifted = "1111111111111111111111111111111111111111";

  it("reports UP_TO_DATE and passes in strict mode", () => {
    const out = execFileSync("node", [script, "--current", pinned], {
      encoding: "utf8",
      env: { ...process.env, MAPS_CHECK_MODE: "strict" },
    });
    expect(out).toContain("UP_TO_DATE");
    expect(out).toContain("MAPS_CHECK_SUMMARY");
    expect(out).toContain("mode=strict");
    expect(out).toContain("result=PASS");
  });

  it("fails confirmed drift even in advisory mode", () => {
    let stderr = "";
    let status: number | undefined;
    try {
      execFileSync("node", [script, "--current", drifted], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, MAPS_CHECK_MODE: "advisory" },
      });
      throw new Error("expected advisory mode to fail confirmed drift");
    } catch (error) {
      const e = error as { status?: number; stderr?: Buffer | string };
      status = e.status;
      stderr = String(e.stderr ?? "");
    }
    expect(status).toBe(2);
    expect(stderr).toContain("DRIFT");
  });
});
