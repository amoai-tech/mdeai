#!/usr/bin/env node
/**
 * SAN-1330 — prove the CI Vercel credential reaches the right team and project.
 *
 * Why this exists
 * ---------------
 * "Secret added" is not the same as "secret works". A token can be present,
 * valid, and still belong to a different team. This repository has already been
 * bitten by exactly that: there is a lookalike project *also named* `mdeai` in
 * another account, so resolving by name succeeds and returns something plausible
 * but wrong (framework `vite`, different domains, stale deployments).
 *
 * So this asserts identity by ID, in order:
 *   1. a credential is present;
 *   2. the `amo1000` team is visible and is the expected team id;
 *   3. the `mdeai` project is visible, is the expected project id, is Next.js,
 *      and owns the expected custom domain;
 *   4. the current Production deployment is READY (and not ERROR);
 *   5. when `--expect-sha` is given, that deployment's git SHA matches.
 *
 * Prints identifiers and metadata only — never the token, never an env value.
 *
 * Usage:
 *   VERCEL_TOKEN=… node scripts/check-vercel-access.mjs
 *   VERCEL_TOKEN=… node scripts/check-vercel-access.mjs --expect-sha <sha>
 */
const EXPECTED_TEAM_ID = "team_ZDZyovkHiBVULVkZLSQ7rEUU";
const TEAM_SLUG = "amo1000";
const EXPECTED_PROJECT_ID = "prj_FRWMRzXWMSzyB0NPR9nbyoz15UUz";
const PROJECT_NAME = "mdeai";
const EXPECTED_FRAMEWORK = "nextjs";
const EXPECTED_DOMAIN = "www.mdeai.co";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const expectSha = flag("--expect-sha")?.trim() || undefined;

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error(
    "vercel-access-check: VERCEL_TOKEN is required (repository secret VERCEL_TOKEN).",
  );
  process.exit(1);
}

/** Reads a path and returns parsed JSON; throws with the HTTP status on failure. */
async function apiGet(path) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel API ${path} returned HTTP ${res.status}`);
  }
  return res.json();
}

const failures = [];
function must(condition, message) {
  if (!condition) failures.push(message);
  return condition;
}

try {
  const teams = (await apiGet("/v2/teams")).teams ?? [];
  const team = teams.find((t) => t.slug === TEAM_SLUG);

  console.log("vercel-access-check");
  console.log(`  teams visible to this credential : ${teams.length}`);

  if (!must(team, `team '${TEAM_SLUG}' is not visible to this credential`)) {
    // Nothing further is meaningful without the team.
    console.log("");
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }

  console.log(`  team '${TEAM_SLUG}' id              : ${team.id}`);
  must(
    team.id === EXPECTED_TEAM_ID,
    `team '${TEAM_SLUG}' is ${team.id}, expected ${EXPECTED_TEAM_ID}`,
  );

  const projects = (await apiGet(`/v9/projects?limit=100&teamId=${team.id}`)).projects ?? [];
  const project = projects.find((p) => p.id === EXPECTED_PROJECT_ID);
  console.log(`  projects in team                 : ${projects.length}`);

  if (!must(project, `project ${EXPECTED_PROJECT_ID} is not visible in team '${TEAM_SLUG}'`)) {
    console.log("");
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }

  console.log(`  project id                       : ${project.id}`);
  console.log(`  project name                     : ${project.name}`);
  console.log(`  framework                        : ${project.framework}`);
  must(
    project.name === PROJECT_NAME,
    `project name is '${project.name}', expected '${PROJECT_NAME}'`,
  );
  must(
    project.framework === EXPECTED_FRAMEWORK,
    `framework is '${project.framework}', expected '${EXPECTED_FRAMEWORK}' (a 'vite' project named mdeai exists in another account)`,
  );

  // Domains prove this is the project that actually serves production.
  const detail = await apiGet(`/v9/projects/${project.id}/domains?teamId=${team.id}`);
  const domains = (detail.domains ?? []).map((d) => d.name);
  console.log(`  domains                          : ${domains.join(", ") || "(none)"}`);
  must(
    domains.includes(EXPECTED_DOMAIN),
    `project does not own '${EXPECTED_DOMAIN}'`,
  );

  const { deployments } = await apiGet(
    `/v6/deployments?projectId=${project.id}&teamId=${team.id}&target=production&limit=1`,
  );
  const current = (deployments ?? [])[0];
  if (!must(current, "no Production deployment found for this project")) {
    console.log("");
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }

  const sha = current.meta?.githubCommitSha ?? "(none)";
  console.log("");
  console.log("  current Production deployment");
  console.log(`    id                             : ${current.uid}`);
  console.log(`    state                          : ${current.state}`);
  console.log(`    url                            : ${current.url}`);
  console.log(`    git sha                        : ${sha}`);
  console.log(`    git ref                        : ${current.meta?.githubCommitRef ?? "(none)"}`);
  console.log(`    created                        : ${new Date(current.created).toISOString()}`);

  must(current.state === "READY", `current Production deployment is ${current.state}, not READY`);

  if (expectSha) {
    console.log(`    expected sha                   : ${expectSha}`);
    must(
      sha === expectSha,
      `Production is serving ${sha}, expected ${expectSha} — refusing to certify a stale deployment`,
    );
  }
} catch (error) {
  console.error(
    `vercel-access-check: FAILED — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

console.log("");
if (failures.length) {
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error("");
  console.error(`vercel-access-check: FAIL — ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("vercel-access-check: OK — credential reaches the correct team and project");
