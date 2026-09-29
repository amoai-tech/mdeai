#!/usr/bin/env node
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The shared PR-Agent workflow reads these paths inside the action container, which mounts
// the repository at /github/workspace. Validation runs on the runner host before the container
// starts, so each selected container path is mapped back to the same file in this checkout.
const CONTAINER_WORKSPACE = "/github/workspace";

const UNIVERSAL = "code-review";
const SPECIALISTS = [
  "copilotkit",
  "mastra",
  "supabase",
  "maps",
  "stripe",
  "nextjs",
];

// `src/proxy.ts` is MDE's Next.js auth proxy and delegates to `@/lib/supabase/middleware`.
const matches = {
  "supabase": (p) => /(^supabase\/|(^|\/)supabase([\/_.-]|$)|^src\/app\/auth\/|^src\/proxy\.ts$)/i.test(p),
  "mastra": (p) => /(^|\/)mastra(\/|[-_.])|requestcontext/i.test(p),
  "copilotkit": (p) => /copilotkit|ag-ui/i.test(p),
  "maps": (p) => /(^|\/)(map|maps|places?|geocod|grounding)(\/|[-_.])/i.test(p),
  "stripe": (p) => /(^|[\/_.-])stripe([\/_.-]|$)/i.test(p) || /^src\/app\/api\/tickets\/checkout\//i.test(p) || /(^|\/)(ticket-checkout|submit-ticket-checkout|checkout-wallet)([-_.\/]|$)/i.test(p),
  "nextjs": (p) => /(^src\/app\/|next\.config\.|^src\/(proxy|middleware)\.)/i.test(p),
};

function budget(skillCount) {
  if (skillCount <= 1) return 1800;
  if (skillCount === 2) return 3200;
  if (skillCount === 3) return 4500;
  return 6000;
}

export function selectSkills(files) {
  if (!Array.isArray(files)) throw new TypeError("changed files must be an array");
  const selected = new Set([UNIVERSAL]);

  for (const file of files) {
    if (file === "package.json") {
      for (const skill of SPECIALISTS) selected.add(skill);
      continue;
    }
    for (const [skill, matcher] of Object.entries(matches)) {
      if (matcher(file)) selected.add(skill);
    }
  }

  const skills = [UNIVERSAL, ...SPECIALISTS.filter((skill) => selected.has(skill))];
  const paths = ["/github/workspace/.claude/skills/code-review/SKILL.md"];
  for (const skill of skills.slice(1)) {
    if (skill === "maps") {
      paths.push("/github/workspace/.claude/skills/maps/SKILL.md");
    } else {
      paths.push(`/github/workspace/.claude/skills/${skill}/references/review.md`);
    }
  }
  return {
    skills,
    paths,
    maxTokens: budget(skills.length),
  };
}

/**
 * Map a path PR-Agent will read inside its container to the same file in this checkout.
 * The prefix is stripped rather than rebuilt from a skill name, so validation always follows
 * the exact path that was selected.
 */
export function toRepoPath(containerPath) {
  const prefix = `${CONTAINER_WORKSPACE}/`;
  if (typeof containerPath !== "string" || !containerPath.startsWith(prefix)) {
    throw new Error(`selected PR-Agent skill path must be inside ${CONTAINER_WORKSPACE}: ${containerPath}`);
  }
  return containerPath.slice(prefix.length);
}

/**
 * Fail loudly when any exact file PR-Agent is about to load is absent. A parent `SKILL.md`
 * existing is not sufficient evidence: specialist selections load `references/review.md`.
 * `exists` is injectable so a regression test can prove the check against a fixture tree.
 */
export function assertSelectedPathsExist(paths, exists = existsSync) {
  for (const containerPath of paths) {
    const repoPath = toRepoPath(containerPath);
    if (!exists(repoPath)) {
      throw new Error(`required trusted PR-Agent skill missing: ${repoPath} (selected as ${containerPath})`);
    }
  }
}

function runCli() {
  const raw = process.env.CHANGED_FILES_JSON ?? "[]";
  const files = JSON.parse(raw);
  const result = selectSkills(files);

  assertSelectedPathsExist(result.paths);

  process.stdout.write("enabled=true\n");
  process.stdout.write(`paths=${JSON.stringify(result.paths)}\n`);
  process.stdout.write(`max_tokens=${result.maxTokens}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
