#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = process.env.PROD_URL ?? "https://www.mdeai.co";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const vercelCwd = process.env.MDE_VERCEL_CWD ?? repoRoot;
let expected;
try {
  expected = process.argv[2] ?? process.env.RELEASE_SHA ?? execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch (error) {
  console.error(`✗ could not resolve the expected SHA: ${error instanceof Error ? error.message : String(error)}`);
  console.error("  Fetch origin/main or pass the SHA explicitly: npm run verify:production -- <sha>");
  process.exit(1);
}
const project = process.env.MDE_VERCEL_PROJECT_ID ?? "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB";
const org = process.env.MDE_VERCEL_ORG_ID ?? "team_OPBk3bdOXAg6fpYnL4vxnLZd";
const env = { ...process.env, VERCEL_PROJECT_ID: project, VERCEL_ORG_ID: org };
delete env.VERCEL_TEAM_ID;
delete env.VERCEL_SCOPE;
delete env.VERCEL_TOKEN;
delete env.VERCEL_USER_ID;
delete env.VERCEL_OIDC_TOKEN;
const failures = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { failures.push(m); console.log(`✗ ${m}`); };

function parseJson(out) {
  const start = out.indexOf("{");
  return JSON.parse(out.slice(start));
}

let deployment;
try {
  const out = execFileSync("vercel", ["ls", "mdeai", "--prod", "--json"], { env, cwd: vercelCwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  deployment = parseJson(out).deployments?.[0];
  if (!deployment) throw new Error("no production deployment returned");
  const sha = deployment.meta?.githubCommitSha;
  if (deployment.state === "READY" && sha === expected) ok(`latest production deployment READY at ${expected.slice(0, 10)}`);
  else bad(`latest deployment ${deployment.url} is ${deployment.state} at ${String(sha).slice(0, 10)}, expected READY ${expected.slice(0, 10)}`);
} catch (error) {
  bad(`could not read Vercel production deployments: ${error.message}`);
}

try {
  const inspected = spawnSync("vercel", ["inspect", "www.mdeai.co"], { env, cwd: vercelCwd, encoding: "utf8" });
  const out = `${inspected.stdout ?? ""}\n${inspected.stderr ?? ""}`;
  const url = out.match(/Fetched deployment "([^"]+)"/)?.[1];
  if (!url) throw new Error("no deployment URL in inspect output");
  if (deployment && url === deployment.url) ok(`www.mdeai.co serves ${url}`);
  else bad(`www.mdeai.co serves ${url}, latest is ${deployment?.url ?? "unknown"}`);
} catch (error) {
  bad(`could not inspect www.mdeai.co: ${error.message}`);
}

try {
  const app = await fetch(`${BASE}/app`, { redirect: "manual" });
  const location = app.headers.get("location") ?? "";
  if (app.status === 307 && location.includes("/login?next=%2Fapp")) ok(`/app redirects to login with exact next`);
  else bad(`/app returned ${app.status} -> ${location}`);
  const login = await fetch(`${BASE}/login`);
  if (login.status === 200) ok("/login returns 200");
  else bad(`/login returned ${login.status}`);
} catch (error) {
  bad(`domain HTTP check failed: ${error.message}`);
}

if (failures.length === 0) {
  const pw = spawnSync(
    "npx",
    ["playwright", "test", "e2e/prod-release-health.spec.ts", "--project=prod-smoke", "--reporter=list"],
    {
      env: {
        ...env,
        SMOKE_BASE_URL: BASE,
        PROD_SMOKE_BASE_URL: BASE,
        PW_SKIP_WEBSERVER: "1",
        PROD_RELEASE_HEALTH: "1",
        MDE_E2E_CHROME_PATH: process.env.MDE_E2E_CHROME_PATH ?? "/usr/bin/google-chrome",
      },
      stdio: "inherit",
      cwd: repoRoot,
    },
  );
  if (pw.status !== 0) bad("host-agent health check failed");
  else ok("host agent replied and persisted a thread");
}

if (failures.length > 0) {
  console.error(`\nProduction release verification FAILED (${failures.length}):`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`\nProduction release verification PASSED for ${expected.slice(0, 10)} at ${BASE}`);
