#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

// The shared PR-Agent workflow reads these paths inside the action container, which mounts
// the repository at /github/workspace. Validation runs on the runner host before the container
// starts, so each selected container path is mapped back to the same file in this checkout.
const CONTAINER_WORKSPACE = "/github/workspace";

const UNIVERSAL = "code-review";
// The pinned loader ignores bare review.md paths; these focused entrypoints
// bundle symlinks to the canonical domain reviews without copying their text.
const REVIEW_SKILLS_ROOT = CONTAINER_WORKSPACE + "/scripts/pr-agent/skills";
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
  // SQL outside supabase/ can still modify authorization, schema or privileges.
  "supabase": (p) => /\.sql$/i.test(p) || /(^supabase\/|(^|\/)supabase([\/_.-]|$)|^src\/app\/auth\/|^src\/proxy\.ts$)/i.test(p),
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
    paths.push(REVIEW_SKILLS_ROOT + "/" + skill + "/SKILL.md");
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
 * Fail loudly if an entrypoint or its canonical review resource is absent.
 * Upstream only discovers direct file paths named SKILL.md; bare review.md
 * previously passed existence checks without providing specialist guidance.
 * `exists` is injectable for fixture-based tests.
 */
export function assertSelectedPathsExist(paths, exists = existsSync, repositoryRoot = process.cwd()) {
  const root = realpathSync(repositoryRoot);
  for (const containerPath of paths) {
    const repoPath = toRepoPath(containerPath);
    const skillPath = join(root, repoPath);
    const location = relative(root, skillPath);
    if (location === ".." || location.startsWith("../") || location.startsWith("..\\") || location.startsWith("/")) {
      throw new Error("selected PR-Agent skill escapes checkout: " + repoPath);
    }
    if (!repoPath.endsWith("/SKILL.md")) {
      throw new Error("PR-Agent cannot discover an individual skill not named SKILL.md: " + repoPath);
    }
    if (!exists(repoPath)) {
      throw new Error("required trusted PR-Agent skill missing: " + repoPath + " (selected as " + containerPath + ")");
    }
    // The upstream loader inlines sibling markdown, following symlinks.
    // Validate resolved targets before any provider credentials are available.
    if (realpathSync(skillPath) !== skillPath) {
      throw new Error("untrusted PR-Agent SKILL.md target: " + repoPath);
    }
    if (repoPath.startsWith("scripts/pr-agent/skills/")) {
      const domain = repoPath.slice("scripts/pr-agent/skills/".length, -"/SKILL.md".length);
      if (!SPECIALISTS.includes(domain) || repoPath !== "scripts/pr-agent/skills/" + domain + "/SKILL.md") {
        throw new Error("unexpected PR-Agent specialist path: " + repoPath);
      }
      const reviewPath = "scripts/pr-agent/skills/" + domain + "/review.md";
      if (!exists(reviewPath)) {
        throw new Error("required trusted PR-Agent review resource missing: " + reviewPath);
      }
      const expectedCanonical = join(root, ".claude/skills", domain, "references/review.md");
      const actual = realpathSync(join(root, reviewPath));
      // Require the exact canonical file, not merely any path inside the checkout.
      // An escaped canonical symlink must fail too.
      if (actual !== expectedCanonical || realpathSync(expectedCanonical) !== expectedCanonical) {
        throw new Error("untrusted PR-Agent review resource target: " + reviewPath);
      }
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
