import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { scripts } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("audit uses exactly the fail-closed critical threshold and bounded npm fetch settings", () => {
  assert.equal(
    scripts["audit:floor"],
    "npm audit --audit-level=critical --fetch-timeout=20000 --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=3000",
  );
});

test("security audit runs before expensive floor checks exactly once", () => {
  for (const key of ["floor", "floor:fast"]) {
    const command = scripts[key];
    assert.ok(command.startsWith("npm run audit:floor && "), key + " must audit first");
    assert.equal(command.match(/npm run audit:floor/g)?.length, 1, key + " must not rerun audit after tests");
    assert.doesNotMatch(command, /\|\|\s*true|continue-on-error/);
  }
  assert.match(scripts.floor, /(?:^|&& )npm test(?: &&|$)/, "Vitest npm test remains mandatory");
  for (const gate of ["check:skills", "check:db-url-guard", "check:release-gates", "audit:copilotkit-v2", "lint", "typecheck", "check:env:ci", "build", "check:mastra"]) {
    assert.ok(scripts.floor.split(" && ").includes("npm run " + gate), "missing required gate: " + gate);
  }
});
