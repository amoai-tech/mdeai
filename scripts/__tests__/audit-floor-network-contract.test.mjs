import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { scripts } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("audit remains a mandatory critical-vulnerability gate", () => {
  const audit = scripts["audit:floor"];
  assert.match(audit, /^npm audit --audit-level=critical(?: |$)/);
  for (const forbidden of [/--no-audit/, /--offline/, /--audit-level=(?:high|moderate|low|none)/, /\|\|\s*true/, /;\s*exit\s+0/, /--force/]) {
    assert.doesNotMatch(audit, forbidden);
  }
});

test("npm audit bounds its registry wait without disabling failure", () => {
  const audit = scripts["audit:floor"];
  const timeout = Number(audit.match(/--fetch-timeout=(\d+)/)?.[1]);
  const retries = Number(audit.match(/--fetch-retries=(\d+)/)?.[1]);
  assert.ok(timeout > 0 && timeout <= 30000, "advisory request must not wait the default five minutes");
  assert.ok(Number.isInteger(retries) && retries >= 0 && retries <= 2, "retry budget must be explicit and bounded");
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
