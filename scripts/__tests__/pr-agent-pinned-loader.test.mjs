import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// This file is matched by check:release-gates (scripts/__tests__/*.test.mjs).
// It must fail, not skip, when the pinned PR-Agent runtime cannot be exercised.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IMAGE = "pragent/pr-agent@sha256:65e5b196e38cecd7df8a71fe29942052e081a0c6645132c2ac874df60b1760c7";
const SCRIPT = "/github/workspace/scripts/__tests__/pr-agent-pinned-loader.py";

test("pinned PR-Agent loader inlines every specialist's canonical guidance", { timeout: 240_000 }, () => {
  const result = spawnSync("docker", [
    "run", "--rm",
    "--read-only", "--tmpfs", "/tmp:rw,size=100m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--user", "65534:65534",
    "-e", "PYTHONDONTWRITEBYTECODE=1",
    "-v", ROOT + ":/github/workspace:ro",
    "--entrypoint", "python", IMAGE, SCRIPT,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 225_000,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  assert.equal(result.status, 0, "pinned loader failed:\n" + (result.stdout ?? "") + "\n" + (result.stderr ?? ""));
  assert.match(result.stdout, /^PINNED_SKILLS_LOADER_PASS skills=7 domains=6$/m);
});
