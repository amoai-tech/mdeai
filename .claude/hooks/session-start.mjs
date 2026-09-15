#!/usr/bin/env node
// SessionStart hook — emit only current repo/skill context.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000, ...opts });
  if (r.status !== 0) return "";
  return (r.stdout || "").trim();
}

const root = "/home/sk/mdeai";
const skillsRoot = resolve(root, ".claude/skills");
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }) || "(none)";
const head = sh("git", ["rev-parse", "--short", "HEAD"], { cwd: root }) || "(none)";
const status = sh("git", ["status", "--porcelain"], { cwd: root });
const dirty = status ? `${status.split("\n").length} changed file(s)` : "clean";
const log = sh("git", ["log", "--oneline", "-3", "--no-decorate"], { cwd: root });

const required = ["using-mde-skills", "tasks", "copilotkit", "mastra", "supabase", "gemini"];
const missing = required.filter((name) => !existsSync(resolve(skillsRoot, name, "SKILL.md")));
const broken = sh("bash", ["-lc", `find "${skillsRoot}" -maxdepth 1 -type l ! -exec test -e {} \\; -print 2>/dev/null | sed 's#^.*/##'`]);
const brokenList = broken ? broken.split("\n").filter(Boolean) : [];

const skillStatus = missing.length === 0 && brokenList.length === 0
  ? "canonical skill scan: OK"
  : `skill scan needs attention: missing=${missing.join(",") || "none"}; broken=${brokenList.join(",") || "none"}`;

const out = `# Session preamble

- Repo: /home/sk/mdeai
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
- Ambiguous/multi-system task → \`using-mde-skills\`.
- Substantial implementation → \`tasks\`.
- Failure with unknown cause → \`systematic-debugging\`.
- Existing diff/PR → \`code-review\`.
- Done/merge/production claim → \`task-verifier\`.
- \`mde-task-lifecycle\` is retired.
`;

process.stdout.write(out);
process.exit(0);
