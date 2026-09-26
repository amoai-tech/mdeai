import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = ".claude/skills/maps/scripts/check-google-maps-upstream.mjs";

describe("Maps upstream drift checker", () => {
  it("passes when the current upstream commit matches the pinned commit", () => {
    const out = execFileSync("node", [script, "--current", "6606930272e554171b42d69312674cbe40aa819c"], { encoding: "utf8" });
    expect(out).toContain("UP_TO_DATE");
  });

  it("reports drift without modifying files", () => {
    let stderr = "";
    try {
      execFileSync("node", [script, "--current", "1111111111111111111111111111111111111111"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      throw new Error("expected drift checker to fail");
    } catch (error) {
      const e = error as { status?: number; stderr?: Buffer | string };
      expect(e.status).toBe(2);
      stderr = String(e.stderr ?? "");
    }
    expect(stderr).toContain("DRIFT");
  });
});
