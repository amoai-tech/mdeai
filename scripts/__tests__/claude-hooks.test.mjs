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

  it("lint-edited-ts runs the repo's eslint on a source file, and stays quiet elsewhere", () => {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "eslint"), "#!/bin/sh\necho 'x.ts: lint problem'\nexit 1\n");
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

  it("stop-rls-gate warns when a migration changed with no RLS evidence", () => {
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(join(root, "supabase/migrations/20260102_new_table.sql"), "create table t (id int);");
    const r = run("stop-rls-gate", { extra: {} });
    assert.equal(r.code, 0, "warn-only");
    assert.match(r.stderr, /stop-rls-gate/);
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
    writeFileSync(join(root, "src/lib/a.ts"), "export const a: number = 'y';");
    assert.equal(run("stop-typecheck", { extra: { stop_hook_active: true } }).code, 0, "a second stop passes");
  });
});

describe("hook sources", () => {
  const files = readdirSync(HOOKS).filter((f) => f.endsWith(".mjs"));

  it("never hard-code a machine path or the retired mdeapp folder", () => {
    for (const f of files) {
      const text = readFileSync(join(HOOKS, f), "utf8");
      assert.doesNotMatch(text, /mdeapp/, `${f} mentions mdeapp/`);
      assert.doesNotMatch(text, /\/home\/sk\/mdeai\b/, `${f} hard-codes /home/sk/mdeai`);
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
