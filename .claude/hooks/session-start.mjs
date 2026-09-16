#!/usr/bin/env node
// SessionStart hook — emit only current repo/skill context.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000, ...opts });
  if (r.status !== 0) return "";
  return (r.stdout || "").trim();
}

const hookDir = dirname(fileURLToPath(import.meta.url));
const fallbackRoot = resolve(hookDir, "../..");
const root = sh("git", ["rev-parse", "--show-toplevel"], { cwd: fallbackRoot }) || fallbackRoot;
const skillsRoot = resolve(root, ".claude/skills");
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }) || "(none)";
const head = sh("git", ["rev-parse", "--short", "HEAD"], { cwd: root }) || "(none)";
const status = sh("git", ["status", "--porcelain"], { cwd: root });
const dirty = status ? `${status.split("\n").length} changed file(s)` : "clean";
const log = sh("git", ["log", "--oneline", "-3", "--no-decorate"], { cwd: root });

const required = ["tasks", "copilotkit", "mastra", "supabase", "gemini"];
const missing = required.filter((name) => !existsSync(resolve(skillsRoot, name, "SKILL.md")));
const requiredPaths = required.map((name) => resolve(skillsRoot, name));
const brokenList = requiredPaths
  .filter((skillPath) => existsSync(skillPath) && !existsSync(resolve(skillPath, "SKILL.md")))
  .map((skillPath) => skillPath.split("/").pop());

const skillStatus = missing.length === 0 && brokenList.length === 0
  ? "canonical skill scan: OK"
  : `skill scan needs attention: missing=${missing.join(",") || "none"}; broken=${brokenList.join(",") || "none"}`;

const out = `# Session preamble

- Repo: ${root}
- Branch: ${branch}
- HEAD: ${head}
- Working tree: ${dirty}
- ${skillStatus}

## Recent commits

\`\`\`
${log || "(no commits)"}
\`\`\`

## Skill flow

- Simple task → use the directly relevant skill.
- Ambiguous/multi-system task → \`tasks\`; SAN-1273 will add the lightweight router later.
- Substantial implementation → \`tasks\`.
- Failure with unknown cause → \`systematic-debugging\`.
- Existing diff/PR → \`code-review\`.
- Done/merge/production claim → \`task-verifier\`.
- \`mde-task-lifecycle\` is retired.
`;

process.stdout.write(out);
process.exit(0);
