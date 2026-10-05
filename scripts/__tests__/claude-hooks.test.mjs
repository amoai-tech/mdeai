import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The Claude Code hooks are the edit-time guardrails (service-role keys in browser code, wrong AI
 * provider, unmasked Places calls, secrets, protected paths, RLS evidence, type errors).
 *
 * They silently stopped working twice: once when the repo lost its `mdeapp/` folder, and again in
 * every checkout not literally named `mdeai`. A hook that matches nothing exits 0, so nothing
 * failed and nobody noticed. This runs each hook against a deliberately bad edit inside a
 * throwaway repo with an unrelated name, and expects it to block.
 */

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "hooks");
let root; // throwaway repo, named like a worktree rather than "mdeai"

// Built at run time so this file never contains a literal that the secret scanner would flag.
const STRIPE_LIVE = ["sk", "live", "a".repeat(24)].join("_");

before(() => {
  root = mkdtempSync(join(tmpdir(), "mdeai-wt-hooktest-"));
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, "tsconfig.json"), "{}");
  mkdirSync(join(root, ".claude"), { recursive: true });
  for (const dir of ["src/components", "src/lib/supabase", "src/mastra", "supabase/functions", "supabase/migrations", "docs"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
});

after(() => rmSync(root, { recursive: true, force: true }));

function run(hook, { file, content, command, env = {}, extra = {}, cwd } = {}) {
  const tool_input = {};
  if (file) tool_input.file_path = join(root, file);
  if (content !== undefined) {
    tool_input.content = content;
    tool_input.new_string = content;
  }
  if (command) tool_input.command = command;
  const r = spawnSync("node", [join(HOOKS, `${hook}.mjs`)], {
    input: JSON.stringify({ tool_input, ...extra }),
    encoding: "utf8",
    cwd: cwd ?? root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, MDEAI_ALLOW_ENV_EDIT: "", MDEAI_ALLOW_MIGRATION_EDIT: "", ...env },
  });
  return { code: r.status, stderr: r.stderr };
}

/** Run a hook from a directory that is not inside any repository. */
function runOutsideRepo(hook, outside, env = {}, toolInput = {}) {
  const r = spawnSync("node", [join(HOOKS, `${hook}.mjs`)], {
    input: JSON.stringify({ tool_input: toolInput }),
    encoding: "utf8",
    cwd: outside,
    env: { ...process.env, CLAUDE_PROJECT_DIR: outside, DIST_LEAK_SCAN_ROOTS: "", ...env },
  });
  return { code: r.status, stderr: r.stderr };
}

describe("edit-time hooks block a bad edit at the real layout", () => {
  it("no-service-role-in-src blocks a service-role reference in browser code", () => {
    const bad = run("no-service-role-in-src", {
      file: "src/components/x.tsx",
      content: "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    });
    assert.equal(bad.code, 2, bad.stderr);
  });

  it("no-service-role-in-src still allows its documented carve-outs", () => {
    const content = "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;";
    for (const file of ["src/lib/supabase/service.ts", "src/components/x.test.tsx", "supabase/functions/x.ts"]) {
      assert.equal(run("no-service-role-in-src", { file, content }).code, 0, file);
    }
  });

  it("gemini-model-pin blocks a non-Gemini provider and allows Gemini", () => {
    const bad = run("gemini-model-pin", {
      file: "src/mastra/x.ts",
      content: "import { openai } from '@ai-sdk/openai'; const m = openai('gpt-4o');",
    });
    assert.equal(bad.code, 2, bad.stderr);
    assert.equal(run("gemini-model-pin", { file: "src/mastra/x.ts", content: "const ok = 1;" }).code, 0);
  });

  it("places-api-field-mask blocks a Places call without a field mask", () => {
    const call = "fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST' })";
    assert.equal(run("places-api-field-mask", { file: "src/lib/p.ts", content: call }).code, 2);
    const masked = `${call}; const h = { 'X-Goog-FieldMask': 'places.id' };`;
    assert.equal(run("places-api-field-mask", { file: "src/lib/p.ts", content: masked }).code, 0);
  });

  it("advanced-marker-needs-mapid blocks a marker on a map with no mapId", () => {
    const bad = "<Map zoom={3}><AdvancedMarker position={p} /></Map>";
    assert.equal(run("advanced-marker-needs-mapid", { file: "src/components/m.tsx", content: bad }).code, 2);
    const good = "<Map zoom={3} mapId={id}><AdvancedMarker position={p} /></Map>";
    assert.equal(run("advanced-marker-needs-mapid", { file: "src/components/m.tsx", content: good }).code, 0);
  });

  it("scan-secrets blocks a secret literal anywhere", () => {
    const bad = run("scan-secrets", { file: "src/lib/k.ts", content: `const k = "${STRIPE_LIVE}";` });
    assert.equal(bad.code, 2, bad.stderr);
  });

  it("guard-sensitive-paths blocks env files and migrations, and allows .env.example", () => {
    assert.equal(run("guard-sensitive-paths", { file: ".env.local", content: "X=1" }).code, 2);
    assert.equal(run("guard-sensitive-paths", { file: "supabase/migrations/20260101_x.sql", content: "select 1;" }).code, 2);
    assert.equal(run("guard-sensitive-paths", { file: ".env.example", content: "X=" }).code, 0);
    assert.equal(
      run("guard-sensitive-paths", {
        file: "supabase/migrations/20260101_x.sql",
        content: "select 1;",
        env: { MDEAI_ALLOW_MIGRATION_EDIT: "1" },
      }).code,
      0,
    );
  });

  it("lint-edited-ts reports warnings (zero-warnings standard) on a source file, and stays quiet elsewhere", () => {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    // Like real ESLint, a warning exits 0 unless --max-warnings 0 is passed.
    writeFileSync(
      join(bin, "eslint"),
      "#!/bin/sh\ncase \"$*\" in *\"--max-warnings 0\"*) echo 'x.ts: lint warning'; exit 1;; esac\nexit 0\n",
    );
    chmodSync(join(bin, "eslint"), 0o755);
    const inSrc = run("lint-edited-ts", { file: "src/components/x.ts" });
    assert.equal(inSrc.code, 0, "warn-only");
    assert.match(inSrc.stderr, /\[lint warn\]/);
    assert.equal(run("lint-edited-ts", { file: "docs/x.ts" }).stderr, "");
  });

  it("dist-leak-scan blocks a deploy command when the bundle holds a secret", () => {
    const dist = join(root, ".next");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "app.js"), `var k="${STRIPE_LIVE}";`);
    const r = run("dist-leak-scan", { command: "git push origin main", env: { DIST_LEAK_SCAN_ROOTS: dist } });
    assert.equal(r.code, 2, r.stderr);
    assert.equal(run("dist-leak-scan", { command: "ls", env: { DIST_LEAK_SCAN_ROOTS: dist } }).code, 0);
  });
});

describe("Stop hooks see the right repository", () => {
  function git(...args) {
    return spawnSync("git", args, { cwd: root, encoding: "utf8" });
  }

  it("stop-rls-gate blocks once when a migration changed with no RLS evidence", () => {
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(join(root, "supabase/migrations/20260102_new_table.sql"), "create table t (id int);");

    const blocked = run("stop-rls-gate");
    assert.equal(blocked.code, 2, blocked.stderr);
    assert.match(blocked.stderr, /MDEAI_SKIP_RLS_GATE/);

    assert.equal(run("stop-rls-gate", { extra: { stop_hook_active: true } }).code, 0, "a second stop passes");
    assert.equal(run("stop-rls-gate", { env: { MDEAI_SKIP_RLS_GATE: "1" } }).code, 0, "explicit bypass");

    const transcript = join(root, "transcript.jsonl");
    writeFileSync(
      transcript,
      JSON.stringify({
        message: { role: "assistant", content: [{ type: "text", text: "Checked pg_policies: RLS enabled, 2 policies." }] },
      }) + "\n",
    );
    assert.equal(run("stop-rls-gate", { extra: { transcript_path: transcript } }).code, 0, "evidence in the reply");
  });

  it("stop-rls-gate blocks when it cannot find the repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "no-repo-"));
    try {
      const r = runOutsideRepo("stop-rls-gate", outside);
      assert.equal(r.code, 2, r.stderr);
      assert.match(r.stderr, /NOT checked/);
      assert.equal(runOutsideRepo("stop-rls-gate", outside, { MDEAI_SKIP_RLS_GATE: "1" }).code, 0, "bypass");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("stop-typecheck reports errors in changed files once, then lets the stop through", () => {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "tsc"), "#!/bin/sh\necho \"src/lib/a.ts(1,1): error TS2322: bad\"\nexit 2\n");
    chmodSync(join(bin, "tsc"), 0o755);
    writeFileSync(join(root, "src/lib/a.ts"), "export const a: number = 'x';");

    const first = run("stop-typecheck");
    assert.equal(first.code, 2, first.stderr);
    assert.match(first.stderr, /src\/lib\/a\.ts/);

    assert.equal(run("stop-typecheck").code, 0, "the same edits are not re-checked");

    // A new (untracked) file edited again must be re-checked: its content changed.
    writeFileSync(join(root, "src/lib/a.ts"), "export const a: number = 'y';");
    const again = run("stop-typecheck");
    assert.equal(again.code, 2, "changed content is checked again");
    assert.match(again.stderr, /src\/lib\/a\.ts/);

    writeFileSync(join(root, "src/lib/a.ts"), "export const a: number = 'z';");
    assert.equal(run("stop-typecheck", { extra: { stop_hook_active: true } }).code, 0, "a second stop passes");
  });

  it("stop-typecheck says so when tsc times out instead of passing silently", () => {
    writeFileSync(join(root, "node_modules", ".bin", "tsc"), "#!/bin/sh\nsleep 5\n");
    writeFileSync(join(root, "src/lib/a.ts"), "export const a: number = 'timeout';");
    const r = run("stop-typecheck", { env: { MDEAI_STOP_TYPECHECK_TIMEOUT_MS: "300" } });
    assert.equal(r.code, 2, r.stderr);
    assert.match(r.stderr, /NOT checked/);
    assert.equal(
      run("stop-typecheck", { env: { MDEAI_STOP_TYPECHECK_TIMEOUT_MS: "300", MDEAI_SKIP_STOP_TYPECHECK: "1" } }).code,
      0,
      "explicit bypass",
    );
  });

  it("stop-typecheck blocks when dependencies are not installed", () => {
    const bare = mkdtempSync(join(tmpdir(), "mdeai-wt-bare-"));
    try {
      writeFileSync(join(bare, "package.json"), "{}");
      writeFileSync(join(bare, "tsconfig.json"), "{}");
      mkdirSync(join(bare, ".claude"));
      mkdirSync(join(bare, "src"));
      spawnSync("git", ["init", "-q"], { cwd: bare });
      writeFileSync(join(bare, "src/a.ts"), "export const a = 1;");
      const r = spawnSync("node", [join(HOOKS, "stop-typecheck.mjs")], {
        input: "{}",
        encoding: "utf8",
        cwd: bare,
        env: { ...process.env, CLAUDE_PROJECT_DIR: bare },
      });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /NOT checked/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("stop hooks say so when no repository can be found", () => {
    const outside = mkdtempSync(join(tmpdir(), "no-repo-"));
    try {
      const r = spawnSync("node", [join(HOOKS, "stop-typecheck.mjs")], {
        input: "{}",
        encoding: "utf8",
        cwd: outside,
        env: { ...process.env, CLAUDE_PROJECT_DIR: outside },
      });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /NOT checked/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("dist-leak-scan blocks a deploy when it cannot find the repository, and only then", () => {
    const outside = mkdtempSync(join(tmpdir(), "no-repo-"));
    try {
      const deploy = runOutsideRepo("dist-leak-scan", outside, {}, { command: "git push origin main" });
      assert.equal(deploy.code, 2, deploy.stderr);
      assert.match(deploy.stderr, /MDEAI_SKIP_DIST_LEAK_SCAN/);
      assert.equal(
        runOutsideRepo("dist-leak-scan", outside, { MDEAI_SKIP_DIST_LEAK_SCAN: "1" }, { command: "git push origin main" }).code,
        0,
        "explicit bypass",
      );
      assert.equal(runOutsideRepo("dist-leak-scan", outside, {}, { command: "ls" }).code, 0, "not a deploy command");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("repo-path helper", async () => {
  const { findRepoRoot, toRepoRelative, projectRoot } = await import(join(HOOKS, "lib", "repo-path.mjs"));

  it("finds the root from any depth, whatever the checkout is called", () => {
    assert.equal(findRepoRoot(join(root, "src/components")), root);
    assert.equal(findRepoRoot(root), root);
  });

  it("returns paths relative to that root, and leaves relative paths alone", () => {
    assert.equal(toRepoRelative(join(root, "src/lib/a.ts")), "src/lib/a.ts");
    assert.equal(toRepoRelative("./src/lib/a.ts"), "src/lib/a.ts");
  });

  it("falls back to the file name for a path outside any repository", () => {
    assert.equal(toRepoRelative("/nonexistent-dir/deep/file.ts"), "file.ts");
  });

  it("projectRoot honours CLAUDE_PROJECT_DIR only when it is a repo, and is null otherwise", () => {
    const keep = process.env.CLAUDE_PROJECT_DIR;
    try {
      process.env.CLAUDE_PROJECT_DIR = root;
      assert.equal(projectRoot(), root);
      const outside = mkdtempSync(join(tmpdir(), "no-repo-"));
      process.env.CLAUDE_PROJECT_DIR = outside;
      const cwd = process.cwd();
      process.chdir(outside);
      try {
        assert.equal(projectRoot(), null);
      } finally {
        process.chdir(cwd);
        rmSync(outside, { recursive: true, force: true });
      }
    } finally {
      if (keep === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = keep;
    }
  });
});

describe("hook sources", () => {
  // Deferred hooks are not registered today, but whoever promotes one inherits its paths, so they
  // must pass the same static check now.
  const files = [
    ...readdirSync(HOOKS).filter((f) => f.endsWith(".mjs")),
    ...readdirSync(join(HOOKS, "_deferred")).filter((f) => f.endsWith(".mjs")).map((f) => `_deferred/${f}`),
  ];

  it("never hard-code a machine path or the retired mdeapp folder", () => {
    // Exception path: a line that genuinely needs a fixed path carries `hook-path-allow: <reason>`.
    // The reason is reviewed in the PR; this test only lets the marked line through.
    for (const f of files) {
      const lines = readFileSync(join(HOOKS, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/hook-path-allow:/.test(line)) return;
        assert.doesNotMatch(line, /mdeapp/, `${f}:${i + 1} mentions mdeapp/`);
        assert.doesNotMatch(line, /\/home\/sk\/mdeai\b/, `${f}:${i + 1} hard-codes /home/sk/mdeai`);
      });
    }
  });

  it("every hook registered in settings.json exists", () => {
    const settings = JSON.parse(readFileSync(join(HOOKS, "..", "settings.json"), "utf8"));
    const registered = Object.values(settings.hooks)
      .flat()
      .flatMap((group) => group.hooks.map((h) => h.command.match(/hooks\/([\w-]+\.mjs)/)?.[1]))
      .filter(Boolean);
    assert.ok(registered.length >= 10, "expected the full hook set to be registered");
    for (const f of registered) assert.ok(files.includes(f), `${f} is registered but missing`);
  });
});

/**
 * The app lives at the repository root; there is no `mdeapp/` directory. Path-shaped references to
 * it send Claude (and developers) to a folder that does not exist, and a probe or hook that
 * checks it fails or passes for the wrong reason. This bans those shapes, not the word:
 * `mdeapp` as a package name, Supabase project id, script name or product name is legitimate.
 *
 * Scanned: everything under `.claude/` (hooks including `_deferred/`, agents, commands, rules,
 * skills and their scripts) plus the operator scripts in `scripts/`.
 * Exception: add `layout-path-allow: <reason>` to the line. `check-docs.mjs` is skipped as a whole
 * because it lists these exact strings as things the docs must NOT contain.
 */
describe("no stale mdeapp/ layout paths in Claude tooling or operator scripts", () => {
  const REPO = join(HOOKS, "..", "..");
  const STALE = [
    /\bmdeapp\/(src|supabase|scripts|node_modules|package\.json|\.env|\.mcp|tmp|workspace|commerce|e2e|graphify-out)/,
    /\/home\/sk\/mdeai\/mdeapp/,
    /\bcd\s+mdeapp\b/,
    /projectPath[^\n]*\bmdeapp\b/,
  ];
  const SKIP = new Set(["scripts/check-docs.mjs"]);
  const TEXT = /\.(mjs|js|ts|sh|md|json|ya?ml)$/;

  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && TEXT.test(e.name))
      .map((e) => join(e.parentPath ?? e.path, e.name));

  const files = [
    ...walk(join(REPO, ".claude")),
    ...walk(join(REPO, "scripts")).filter((f) => !f.includes("/scripts/__tests__/") && !f.includes("/scripts/pr-agent/evals/fixtures/")),
  ].filter((f) => !SKIP.has(f.slice(REPO.length + 1)));

  it("scans the places that matter", () => {
    const rel = files.map((f) => f.slice(REPO.length + 1));
    for (const must of [
      ".claude/hooks/_deferred/post-migration-typegen.mjs",
      ".claude/agents/security-reviewer.md",
      ".claude/commands/verify-floor.md",
      ".claude/skills/task-verifier/scripts/probe-disk.sh",
    ]) assert.ok(rel.includes(must), `${must} is not being scanned`);
  });

  it("recognises the stale shapes and leaves legitimate identifiers alone", () => {
    const hit = (s) => STALE.some((re) => re.test(s));
    for (const bad of ["cd mdeapp && npm run dev", "mdeapp/src/lib/x.ts", "/home/sk/mdeai/mdeapp", "mdeapp/node_modules/x", "projectPath: mdeapp"]) {
      assert.ok(hit(bad), `should flag: ${bad}`);
    }
    for (const ok of ['"name": "mdeapp"', 'project_id = "mdeapp"', "verify:commerce-mdeapp-env", "gh repo view amo-tech-ai/mdeapp", "the old mdeapp/ folder is gone"]) {
      assert.ok(!hit(ok), `should allow: ${ok}`);
    }
  });

  it("no file points at a removed mdeapp/ directory", () => {
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/layout-path-allow:/.test(line)) return;
        for (const re of STALE) {
          assert.doesNotMatch(line, re, `${f.slice(REPO.length + 1)}:${i + 1} assumes an mdeapp/ directory`);
        }
      });
    }
  });
});
