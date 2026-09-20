import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const sourceHook = resolve(here, "../session-start.mjs");
const required = ["tasks", "task-verifier", "systematic-debugging", "testing", "research", "code-review", "writing-skills", "wireframe", "mermaid-diagrams", "copilotkit", "mastra", "supabase", "gemini", "maps", "stripe", "nextjs", "cloudinary"];

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo() {
  const root = mkdtempSync(resolve(tmpdir(), "mde-session-hook-"));
  run("git", ["init", "-b", "main"], root);
  run("git", ["config", "user.email", "test@example.com"], root);
  run("git", ["config", "user.name", "Test User"], root);
  mkdirSync(resolve(root, ".claude/hooks"), { recursive: true });
  mkdirSync(resolve(root, ".claude/skills"), { recursive: true });
  cpSync(sourceHook, resolve(root, ".claude/hooks/session-start.mjs"));
  for (const name of required) {
    mkdirSync(resolve(root, ".claude/skills", name), { recursive: true });
    writeFileSync(resolve(root, ".claude/skills", name, "SKILL.md"), `# ${name}\n`);
  }
  writeFileSync(resolve(root, "README.md"), "one\n");
  run("git", ["add", "."], root);
  run("git", ["commit", "-m", "commit one"], root);
  for (let i = 2; i <= 4; i++) {
    writeFileSync(resolve(root, "README.md"), `${i}\n`);
    run("git", ["add", "README.md"], root);
    run("git", ["commit", "-m", `commit ${i}`], root);
  }
  return root;
}

function hook(root) {
  const r = spawnSync("node", [resolve(root, ".claude/hooks/session-start.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const repos = [];
try {
  const clean = makeRepo(); repos.push(clean);
  const cleanOut = hook(clean);
  assert.ok(cleanOut.includes(`- Repo: ${clean}`));
  assert.match(cleanOut, /- Branch: main/);
  assert.match(cleanOut, /canonical skill scan: OK/);
  assert.match(cleanOut, /Task lifecycle.*`tasks`/);
  assert.match(cleanOut, /Independent Done\/merge\/production proof.*`task-verifier`/);
  assert.match(cleanOut, /lean-dev-flow.*mde-worktree-pr-flow.*mde-task-lifecycle.*retired/);
  assert.doesNotMatch(cleanOut, /SAN-1273 will add the lightweight router later/);
  const commitLines = cleanOut.split("## Recent commits\n\n```\n")[1].split("\n```", 1)[0].trim().split("\n");
  assert.equal(commitLines.length, 3);
  assert.match(commitLines[0], /commit 4/);
  assert.match(commitLines[2], /commit 2/);

  rmSync(resolve(clean, ".claude/skills/gemini/SKILL.md"));
  const missingOut = hook(clean);
  assert.match(missingOut, /missing=gemini/);

  const broken = makeRepo(); repos.push(broken);
  rmSync(resolve(broken, ".claude/skills/mastra/SKILL.md"));
  rmSync(resolve(broken, ".claude/skills/mastra"), { recursive: true, force: true });
  symlinkSync("does-not-exist", resolve(broken, ".claude/skills/mastra"));
  const brokenOut = hook(broken);
  assert.match(brokenOut, /missing=mastra|broken=mastra/);

  const second = makeRepo(); repos.push(second);
  run("git", ["checkout", "-b", "feature/worktree-proof"], second);
  const secondOut = hook(second);
  assert.match(secondOut, /- Branch: feature\/worktree-proof/);
  assert.doesNotMatch(secondOut, /\/home\/sk\/mdeai/);

  console.log("session-start tests: PASS");
} finally {
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
}
