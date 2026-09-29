import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";

/**
 * SAN-1301 · MDE-CK-UPGRADE-001 · step 0
 *
 * `scripts/check-mastra.mjs` used to assert `const COPILOTKIT_PIN = "1.55.2"` against every
 * `@copilotkit/*` dependency. Because `check:mastra` runs inside `floor`, that literal made
 * the gate unpassable for any certified CopilotKit upgrade.
 *
 * It now asserts an invariant instead: every `@copilotkit/*` package must be present where
 * required, exactly pinned, and mutually aligned — with the target version living only in
 * `package.json`.
 *
 * `check-mastra.mjs` resolves its root from its own location, so each case copies it into a
 * throwaway root scaffolded with the minimum files the other checks read. That keeps the
 * repository worktree untouched and makes each failure attributable to the CopilotKit case.
 */

const CHECKER_REL = "scripts/check-mastra.mjs";
const CHECKER_SRC = path.resolve(CHECKER_REL);

const ALIGNED = {
  "@copilotkit/react-core": "1.55.2",
  "@copilotkit/runtime": "1.55.2",
};

const roots = [];

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

/**
 * Minimum scaffold so the non-CopilotKit checks read real files/dirs instead of throwing:
 * checkAgentNames reads src/mastra/index.ts; checkGeminiModels/checkCatalogToolsRls walk
 * their dirs; checkCopilotRoute reads the route; checkStorage reads storage.ts.
 */
function fixture(dependencies) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mde-ck-align-"));
  roots.push(root);

  const files = {
    "package.json": `${JSON.stringify({ name: "fixture", dependencies }, null, 2)}\n`,
    "src/mastra/index.ts": "export const mastra = {};\n",
    "src/mastra/agents/.keep": "",
    "src/mastra/tools/.keep": "",
    "src/mastra/lib/storage.ts": "export const storage = { url: 'file:local.db' };\n",
    "src/app/.keep": "",
    "src/components/.keep": "",
    "src/app/api/copilotkit/[[...path]]/route.ts":
      "import { getLocalAgentsWithLogging } from \"@/mastra/copilotkit/local-agents\";\nexport const runtime = getLocalAgentsWithLogging;\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }

  const checker = path.join(root, CHECKER_REL);
  fs.mkdirSync(path.dirname(checker), { recursive: true });
  fs.copyFileSync(CHECKER_SRC, checker);

  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [path.join(root, CHECKER_REL)], {
    cwd: root,
    encoding: "utf8",
  });
}

function output(result) {
  return `${result.stdout}${result.stderr}`;
}

test("the checker no longer hard-codes a CopilotKit target version", () => {
  const source = fs.readFileSync(CHECKER_SRC, "utf8");
  assert.doesNotMatch(
    source,
    /const\s+COPILOTKIT_PIN\s*=/,
    "check-mastra.mjs must not reintroduce a hard-coded CopilotKit pin constant",
  );
});

test("passes when @copilotkit/* is present, aligned and exactly pinned", () => {
  const result = runChecker(fixture({ ...ALIGNED }));
  assert.equal(result.status, 0, `aligned exact versions must pass:\n${output(result)}`);
});

test("accepts an exactly pinned prerelease (still exact, not a range)", () => {
  const result = runChecker(
    fixture({ "@copilotkit/react-core": "1.76.0-beta.1", "@copilotkit/runtime": "1.76.0-beta.1" }),
  );
  assert.equal(result.status, 0, `an exact prerelease is not a range:\n${output(result)}`);
});

test("rejects misaligned react-core / runtime", () => {
  const result = runChecker(
    fixture({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.55.2" }),
  );
  assert.notEqual(result.status, 0, "misaligned versions must fail");
  assert.match(output(result), /must stay version-aligned/);
});

test("does NOT require an unrelated @copilotkit/* package to share the pair's version", () => {
  // Pair-only rule: the contract is react-core === runtime. A third package may version
  // independently, and this gate must not become a future blocker for that.
  const result = runChecker(
    fixture({
      ...ALIGNED,
      "@copilotkit/some-future-package": "9.9.9",
      "@copilotkit/react-ui": "^2.0.0",
    }),
  );
  assert.equal(
    result.status,
    0,
    `a third @copilotkit/* package must not be forced to match the pair:\n${output(result)}`,
  );
});

test("rejects a range instead of an exact pin", () => {
  const result = runChecker(
    fixture({ "@copilotkit/react-core": "^1.75.0", "@copilotkit/runtime": "^1.75.0" }),
  );
  assert.notEqual(result.status, 0, "a caret range must fail");
  assert.match(output(result), /must be an exact version, not a range/);
});

test("rejects malformed SemVer, not just ranges", () => {
  // Raised in review: the first pattern accepted these. None is a publishable exact
  // version, so accepting one would let a non-version string through the gate.
  const malformed = [
    "01.2.3", // leading zero in a core component
    "1.02.3",
    "1.2.03",
    "1.2.3-01", // leading zero in a numeric prerelease identifier
    "1.2.3-a..b", // empty dot-separated identifier
    "1.2.3-a.",
    "1.2.3-.a",
    "1.2.3-", // empty prerelease
    "1.2.3+", // empty build metadata
    "1.2.3.4", // too many core components
    "v1.2.3", // leading "v"
    "1.2.3 ", // trailing whitespace
  ];
  for (const version of malformed) {
    const result = runChecker(
      fixture({ "@copilotkit/react-core": version, "@copilotkit/runtime": version }),
    );
    assert.notEqual(result.status, 0, `${JSON.stringify(version)} must be rejected`);
    assert.match(output(result), /must be an exact version, not a range/);
  }
});

test("accepts well-formed SemVer including prerelease and build metadata", () => {
  const valid = [
    "1.55.2",
    "0.0.59",
    "0.0.0",
    "0.2.1-beta.2",
    "1.76.0-beta.1",
    "1.0.0-0",
    "1.0.0+build.1",
    "1.0.0-alpha.1+build.2",
  ];
  for (const version of valid) {
    const result = runChecker(
      fixture({ "@copilotkit/react-core": version, "@copilotkit/runtime": version }),
    );
    assert.equal(
      result.status,
      0,
      `${JSON.stringify(version)} is an exact pin and must pass:\n${output(result)}`,
    );
  }
});

test("rejects a dist-tag instead of an exact pin", () => {
  const result = runChecker(
    fixture({ "@copilotkit/react-core": "latest", "@copilotkit/runtime": "latest" }),
  );
  assert.notEqual(result.status, 0, "a dist-tag must fail");
  assert.match(output(result), /must be an exact version, not a range/);
});

test("rejects a missing required package", () => {
  const result = runChecker(fixture({ "@copilotkit/react-core": "1.55.2" }));
  assert.notEqual(result.status, 0, "a missing @copilotkit/runtime must fail");
  assert.match(output(result), /@copilotkit\/runtime is missing from dependencies/);
});

test("still rejects a bare v1 @copilotkit/react-core import (existing /v2 rule preserved)", () => {
  const root = fixture({ ...ALIGNED });
  fs.writeFileSync(
    path.join(root, "src/components/legacy.tsx"),
    'import { useCopilotChat } from "@copilotkit/react-core";\nexport const x = useCopilotChat;\n',
  );
  const result = runChecker(root);
  assert.notEqual(result.status, 0, "a bare v1 import must fail");
  assert.match(output(result), /use the \/v2 subpath/);
});

test("does not flag the /v2 subpath import", () => {
  const root = fixture({ ...ALIGNED });
  fs.writeFileSync(
    path.join(root, "src/components/ok.tsx"),
    'import { useCopilotChat } from "@copilotkit/react-core/v2";\nexport const x = useCopilotChat;\n',
  );
  const result = runChecker(root);
  assert.equal(result.status, 0, `/v2 is the approved boundary:\n${output(result)}`);
});

test("passes against the real repository (read-only positive control)", () => {
  const result = spawnSync(process.execPath, [CHECKER_SRC], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `current repository must satisfy check:mastra:\n${output(result)}`,
  );
  assert.match(result.stdout, /all Mastra gate checks passed/);
});
