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
 * two properties that matter: the guard resolves the repository root dynamically, and its policy
 * is release-agnostic (exact + aligned), so an intentional certified upgrade is not blocked by a
 * stale string while accidental drift still is.
 */

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(here, "../copilotkit-version-pin.mjs");

const root = mkdtempSync(resolve(tmpdir(), "mde-ck-pin-"));
after(() => rmSync(root, { recursive: true, force: true }));

for (const dir of [".claude", ".worktrees/wt-feature/.claude", ".claude/worktrees/wt-old/.claude"]) {
  mkdirSync(resolve(root, dir), { recursive: true });
}
writeFileSync(resolve(root, "package.json"), "{}\n");

function run(filePath, edit, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { file_path: filePath, ...edit } }),
    env: { ...process.env, MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE: "", ...env },
  });
}

const pkg = (deps) =>
  JSON.stringify({ dependencies: deps }, null, 2);

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

// ---------- package.json: policy ----------

test("allows any exact, aligned matrix (no release is special-cased)", () => {
  const r = run(resolve(root, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.75.0" }),
  });
  assert.equal(r.status, 0, `certified pins must pass:\n${r.stderr}`);
});

test("allows a future exact, aligned matrix too", () => {
  // Deliberate ceiling: this hook owns exactness + alignment, NOT the certified release number.
  // Baking a literal here is what previously made every intentional upgrade a false failure.
  // The recorded matrix is owned by SAN-1301 (Linear) and `scripts/check-mastra.mjs` mirrors the
  // same generic invariant, so a specific version is never duplicated into a guard.
  const r = run(resolve(root, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "2.4.1", "@copilotkit/runtime": "2.4.1" }),
  });
  assert.equal(r.status, 0, `a newer aligned pin must not be blocked by a stale literal:\n${r.stderr}`);
});

test("blocks a caret range", () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/react-core": "^1.75.0" }) });
  assert.equal(r.status, 2, `ranges make the matrix unreproducible:\n${r.stderr}`);
});

test('blocks "latest"', () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/runtime": "latest" }) });
  assert.equal(r.status, 2, `latest must be rejected:\n${r.stderr}`);
});

test("blocks misaligned react-core and runtime", () => {
  const r = run(resolve(root, "package.json"), {
    content: pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.74.0" }),
  });
  assert.equal(r.status, 2, `alignment must be enforced:\n${r.stderr}`);
});

test("blocks the v2 full-rewrite package line", () => {
  const r = run(resolve(root, "package.json"), { content: pkg({ "@copilotkit/react": "1.75.0" }) });
  assert.equal(r.status, 2, `full-rewrite line must be rejected:\n${r.stderr}`);
});

test("blocks a single-package edit that creates drift", () => {
  // A realistic Edit touches only one declaration. The guard must compare against the
  // counterpart already committed at the target path, or the drift slips through.
  const target = resolve(root, "package.json");
  writeFileSync(target, pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.75.0" }));
  const r = run(target, { new_string: '"@copilotkit/runtime": "1.74.0"' });
  assert.equal(r.status, 2, `single-package drift must be blocked:\n${r.stderr}`);
});

test("allows a single-package edit that keeps the pair aligned", () => {
  const target = resolve(root, "package.json");
  writeFileSync(target, pkg({ "@copilotkit/react-core": "1.75.0", "@copilotkit/runtime": "1.76.0" }));
  const r = run(target, { new_string: '"@copilotkit/runtime": "1.75.0"' });
  assert.equal(r.status, 0, `re-aligning one package must pass:\n${r.stderr}`);
  writeFileSync(target, "{}\n");
});

test("honours the explicit upgrade bypass", () => {
  const r = run(
    resolve(root, "package.json"),
    { content: pkg({ "@copilotkit/react-core": "9.9.9" }) },
    { MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE: "1" },
  );
  assert.equal(r.status, 0, `bypass must allow a deliberate upgrade:\n${r.stderr}`);
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
