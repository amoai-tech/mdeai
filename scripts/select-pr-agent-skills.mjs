#!/usr/bin/env node
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const UNIVERSAL = "code-review";
const SPECIALISTS = [
  "copilotkit-review",
  "mastra-review",
  "supabase-review",
  "maps-review",
  "stripe-review",
  "nextjs",
];

// `src/proxy.ts` is MDE's Next.js auth proxy and delegates to `@/lib/supabase/middleware`.
const matches = {
  "supabase-review": (p) => /(^supabase\/|(^|\/)supabase([\/_.-]|$)|^src\/app\/auth\/|^src\/proxy\.ts$)/i.test(p),
  "mastra-review": (p) => /(^|\/)mastra(\/|[-_.])|requestcontext/i.test(p),
  "copilotkit-review": (p) => /copilotkit|ag-ui/i.test(p),
  "maps-review": (p) => /(^|\/)(map|maps|places?|geocod|grounding)(\/|[-_.])/i.test(p),
  "stripe-review": (p) => /stripe/i.test(p) || /^src\/app\/api\/tickets\/checkout\//i.test(p) || /(^|\/)(ticket-checkout|submit-ticket-checkout|checkout-wallet)([-_.\/]|$)/i.test(p),
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
  const paths = skills.map((skill) => `/github/workspace/.claude/skills/${skill}`);
  if (selected.has("nextjs")) {
    paths.push("/github/workspace/.claude/skills/nextjs/references/review.md");
  }
  return {
    skills,
    paths,
    maxTokens: budget(skills.length),
  };
}

function runCli() {
  const raw = process.env.CHANGED_FILES_JSON ?? "[]";
  const files = JSON.parse(raw);
  const result = selectSkills(files);

  for (const skill of result.skills) {
    const file = `.claude/skills/${skill}/SKILL.md`;
    if (!existsSync(file)) throw new Error(`required trusted PR-Agent skill missing: ${file}`);
  }

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
