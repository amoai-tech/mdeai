import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { after, test } from "node:test";

/**
 * SAN-1357 · Stage A — the CopilotKit version-pin guard must actually fire.
 *
 * The previous hook hard-coded a parent directory and a literal release, so in a
 * `.worktrees/<name>` checkout it matched nothing and allowed every write. These cases pin the
 * properties that matter:
 *
 * 1. the guard resolves the repository root dynamically;
 * 2. the policy is release-agnostic — no version literal is baked in, so an authorized upgrade
 *    never becomes a false failure;
 * 3. the *committed* certified pins cannot be moved without the documented bypass, so a
 *    full-file write that changes both packages together is not a way around the matrix.
 */

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(here, "../copilotkit-version-pin.mjs");

const created = [];
after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(pins) {
  const dir = mkdtempSync(resolve(tmpdir(), "mde-ck-pin-"));
  created.push(dir);
  mkdirSync(resolve(dir, ".claude"), { recursive: true });
  writeFileSync(
    resolve(dir, "package.json"),
    JSON.stringify(pins ? { dependencies: pins } : {}, null, 2),
  );
  return dir;
}

/** The main fixture: a repository root with no CopilotKit pins committed yet. */
const root = makeRoot(null);
for (const dir of [".worktrees/wt-feature/.claude", ".claude/worktrees/wt-old/.claude"]) {
  mkdirSync(resolve(root, dir), { recursive: true });
}

function run(filePath, edit, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { file_path: filePath, ...edit } }),
    env: { ...process.env, MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE: "", ...env },
  });
}

const pkg = (deps) => JSON.stringify({ dependencies: deps }, null, 2);
const CERTIFIED = { "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.75.0" };

// ---------- package.json: repository-root resolution ----------
// Every case below fails the policy, so a non-block proves the guard never reached the policy.
// That was exactly the bug: the old hook matched no path in a `.worktrees/` checkout.

test("blocks a non-exact pin at the repository root", () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/react-core": "^1.75.0" }) });
  assert.equal(r.status, 2, `expected block, got ${r.status}\n${r.stderr}`);
});

test("blocks a non-exact pin from a .worktrees checkout (the bug this fixes)", () => {
  const r = run(resolve(root, ".worktrees/wt-feature/package.json"), {
    content: pkg({ "@copilotkit/react-core": "^1.75.0" }),
  });
  assert.equal(r.status, 2, `guard must resolve a .worktrees root, got ${r.status}\n${r.stderr}`);
});

test("blocks a misaligned pair from a .claude/worktrees checkout", () => {
  const r = run(resolve(root, ".claude/worktrees/wt-old/package.json"), {
    content: pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.74.0" }),
  });
  assert.equal(r.status, 2, `guard must resolve a .claude/worktrees root, got ${r.status}\n${r.stderr}`);
});

// ---------- package.json: pinned-value policy ----------

test("accepts the certified pair unchanged", () => {
  const dir = makeRoot(CERTIFIED);
  const r = run(resolve(dir, "package.json"), { content: pkg(CERTIFIED) });
  assert.equal(r.status, 0, `the certified matrix must pass:\n${r.stderr}`);
});

test("bakes no release literal: an arbitrary committed pair is accepted as-is", () => {
  // If a release number were hard-coded, this future/exotic pair would be a false failure.
  const dir = makeRoot({ "@copilotkit/react-core": "2.4.1", "@copilotkit/runtime": "2.4.1" });
  const r = run(resolve(dir, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "2.4.1", "@copilotkit/runtime": "2.4.1" }),
  });
  assert.equal(r.status, 0, `no release may be special-cased:\n${r.stderr}`);
});

test("blocks moving both certified pins together without the bypass", () => {
  // The gap this closes: a full-file write used to leave the certified matrix silently,
  // because only the shape of the pair was checked.
  const dir = makeRoot(CERTIFIED);
  const r = run(resolve(dir, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "2.4.1", "@copilotkit/runtime": "2.4.1" }),
  });
  assert.equal(r.status, 2, `an uncertified matrix move must be blocked:\n${r.stderr}`);
});

test("allows moving both certified pins with the bypass", () => {
  const dir = makeRoot(CERTIFIED);
  const r = run(
    resolve(dir, "package.json"),
    { content: pkg({ "@copilotkit/react-core": "2.4.1", "@copilotkit/runtime": "2.4.1" }) },
    { MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE: "1" },
  );
  assert.equal(r.status, 0, `the documented bypass must permit a deliberate upgrade:\n${r.stderr}`);
});

test("blocks a single-package edit that creates drift", () => {
  // A realistic Edit touches only one declaration. The guard must compare against the
  // counterpart already committed at the target path, or the drift slips through.
  const dir = makeRoot(CERTIFIED);
  const r = run(resolve(dir, "package.json"), { new_string: '"@copilotkit/runtime": "1.74.0"' });
  assert.equal(r.status, 2, `single-package drift must be blocked:\n${r.stderr}`);
});

test("allows a single-package edit that does not change the version", () => {
  const dir = makeRoot(CERTIFIED);
  const r = run(resolve(dir, "package.json"), { new_string: '"@copilotkit/runtime": "1.75.0"' });
  assert.equal(r.status, 0, `a no-op pin edit must pass:\n${r.stderr}`);
});

test("allows an unrelated dependency edit that leaves the pins untouched", () => {
  // The guard must not obstruct normal dependency work.
  const dir = makeRoot({ ...CERTIFIED, react: "19.2.6" });
  const r = run(resolve(dir, "package.json"), { new_string: '"react": "19.3.0"' });
  assert.equal(r.status, 0, `unrelated dependency edits must pass:\n${r.stderr}`);
});

test("allows repairing a non-exact committed pin without the bypass", () => {
  // A pre-existing range is already a violation; the write must be able to fix it.
  const dir = makeRoot({ "@copilotkit/react-core": "^1.75.0", "@copilotkit/runtime": "^1.75.0" });
  const r = run(resolve(dir, "package.json"), { content: pkg(CERTIFIED) });
  assert.equal(r.status, 0, `remediation must pass:\n${r.stderr}`);
});

test("blocks a caret range", () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/react-core": "^1.75.0" }) });
  assert.equal(r.status, 2, `ranges make the matrix unreproducible:\n${r.stderr}`);
});

test('blocks "latest"', () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/runtime": "latest" }) });
  assert.equal(r.status, 2, `latest must be rejected:\n${r.stderr}`);
});

test("blocks a misaligned pair on a fresh file", () => {
  const r = run(resolve(root, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.74.0" }),
  });
  assert.equal(r.status, 2, `alignment must be enforced:\n${r.stderr}`);
});

test("blocks the v2 full-rewrite package line", () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/react": "1.75.0" }) });
  assert.equal(r.status, 2, `full-rewrite line must be rejected:\n${r.stderr}`);
});

test("honours the explicit upgrade bypass", () => {
  const dir = makeRoot(CERTIFIED);
  const edit = { content: pkg({ "@copilotkit/react-core": "9.9.9", "@copilotkit/runtime": "9.9.9" }) };
  assert.equal(run(resolve(dir, "package.json"), edit).status, 2, "without bypass it must block");
  assert.equal(
    run(resolve(dir, "package.json"), edit, { MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE: "1" }).status,
    0,
    "with bypass it must pass",
  );
});

// ---------- source files ----------

test("blocks a bare @copilotkit/react-core import", () => {
  const r = run(resolve(root, "src/app/page.tsx"), {
    new_string: 'import { useCopilotChat } from "@copilotkit/react-core";',
  });
  assert.equal(r.status, 2, `bare v1 import must be blocked:\n${r.stderr}`);
});

test("allows the approved /v2 subpath", () => {
  const r = run(resolve(root, "src/app/page.tsx"), {
    new_string: 'import { CopilotChatView } from "@copilotkit/react-core/v2";',
  });
  assert.equal(r.status, 0, `/v2 is the approved boundary:\n${r.stderr}`);
});

test("checks supabase/functions sources too", () => {
  const r = run(resolve(root, "supabase/functions/chat/index.ts"), {
    new_string: 'import { BuiltInAgent } from "@copilotkit/react-core/v2";',
  });
  assert.equal(r.status, 2, `full-rewrite agent API must be blocked:\n${r.stderr}`);
});

test("ignores unrelated files", () => {
  const r = run(resolve(root, "docs/notes.md"), { content: "@copilotkit/react-core 1.55.2" });
  assert.equal(r.status, 0, "non-package, non-source files are out of scope");
});
