import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-agui-pin.mjs");

// Kept in sync with the checker. Rejects ranges, wildcards, dist-tags, and partial versions.
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Run the checker against a synthetic package.json and return its combined output. */
function runCheck(dependencies) {
  const dir = mkdtempSync(join(tmpdir(), "agui-pin-"));
  const script = join(dir, "check-agui-pin.mjs");
  writeFileSync(
    script,
    readFileSync(SCRIPT, "utf8").replace(
      'path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")',
      "process.cwd()",
    ),
    "utf8",
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies }, null, 2), "utf8");
  try {
    const stdout = execFileSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    return { status: 0, output: stdout };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

const VALID = { "@ag-ui/client": "0.0.52", "@ag-ui/mastra": "0.2.1-beta.2" };

describe("AGUI-001 exact AG-UI pins", () => {
  it("accepts the exact pins this repository ships", () => {
    const result = runCheck(VALID);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /ok \(2 exact pins\)/);
  });

  it("accepts an exact prerelease pin", () => {
    assert.equal(runCheck({ ...VALID, "@ag-ui/client": "0.1.0-beta.2" }).status, 0);
  });

  it("rejects range operators", () => {
    for (const spec of ["^0.0.52", "~0.0.52", ">=0.0.52"]) {
      const result = runCheck({ ...VALID, "@ag-ui/client": spec });
      assert.equal(result.status, 1, `${spec} should be rejected`);
      assert.match(result.output, /must be pinned to an exact version/);
    }
  });

  it("rejects wildcards and dist-tags", () => {
    for (const spec of ["0.0.x", "*", "latest", "next"]) {
      assert.equal(runCheck({ ...VALID, "@ag-ui/mastra": spec }).status, 1, `${spec} should be rejected`);
    }
  });

  it("rejects a partial version", () => {
    assert.equal(runCheck({ ...VALID, "@ag-ui/client": "0.0" }).status, 1);
  });

  it("rejects a package that is not declared", () => {
    const result = runCheck({ "@ag-ui/client": "0.0.52" });
    assert.equal(result.status, 1);
    assert.match(result.output, /@ag-ui\/mastra is not declared/);
  });

  it("matches the shared pattern used by the checker", () => {
    for (const spec of Object.values(VALID)) {
      assert.equal(EXACT_VERSION.test(spec), true, `${spec} should be accepted`);
    }
    for (const spec of ["^0.0.52", "0.0.x", "*", "latest", "0.0"]) {
      assert.equal(EXACT_VERSION.test(spec), false, `${spec} should be rejected`);
    }
  });
});
