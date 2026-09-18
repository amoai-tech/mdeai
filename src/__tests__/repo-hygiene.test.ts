import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

/**
 * Repository hygiene — tracked generated artifacts.
 *
 * With `output: "standalone"` in next.config.ts, `next build` file-traces
 * dependencies and copies them to `<project>/<checkout-name>/node_modules/...`
 * whenever the checkout's own node_modules resolves outside the project
 * directory — which is what happens in a linked worktree, where node_modules is
 * a symlink back to the main checkout.
 *
 * `.gitignore` previously used the root-anchored `/node_modules`, so those 27
 * byte-identical traced copies were not ignored and a `git add -A` committed
 * them. `.gitignore` now ignores `node_modules` at any depth; this test fails if
 * a generated path becomes tracked again, rather than relying on review to catch
 * it.
 *
 * Skipped when `git` is unavailable so it never blocks a run outside a checkout.
 */
const FORBIDDEN =
  /(^|\/)(node_modules|\.next|\.vercel|coverage|test-results|playwright-report)(\/|$)/;

function trackedPaths(): string[] | null {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.split("\0").filter(Boolean);
}

const paths = trackedPaths();
const suite = paths === null ? describe.skip : describe;

suite("repository hygiene — tracked artifacts", () => {
  it("tracks no generated dependency or build-output paths", () => {
    expect(paths).not.toBeNull();
    expect((paths ?? []).filter((path) => FORBIDDEN.test(path))).toEqual([]);
  });
});
