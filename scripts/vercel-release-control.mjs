#!/usr/bin/env node
/**
 * SAN-1330 — release-control checks against the Vercel API.
 *
 * A production candidate may only reach www.mdeai.co after it has been proven to
 * be the exact deployment we tested. These checks are the proof points the
 * certification workflow runs, in order:
 *
 *   credential        the token sees the CURRENT team and project (not a stale one)
 *   env-names         the Production target defines every required variable NAME
 *   assert-staged     the candidate is READY, from main, owns no production domain yet, and the
 *                     certified URL belongs to this exact deployment id
 *   assert-promoted   www.mdeai.co now serves the exact tested deployment id and commit
 *
 * Names and IDs only. The env check reads variable NAMES and TARGETS and never
 * touches a value; error messages never echo an API response body.
 *
 * Usage: node scripts/vercel-release-control.mjs <credential|env-names|assert-staged|assert-promoted>
 * Env:   VERCEL_TOKEN (all), VERCEL_DEPLOYMENT_ID + VERCEL_DEPLOYMENT_SHA (assert-*)
 */
import { pathToFileURL } from "node:url";

export const PROJECT_ID = "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB";
export const PROJECT_NAME = "mdeai";
export const TEAM_ID = "team_OPBk3bdOXAg6fpYnL4vxnLZd";
export const PRODUCTION_BRANCH = "main";
export const PRODUCTION_DOMAINS = ["www.mdeai.co", "mdeai.co"];
const PRIMARY_DOMAIN = "www.mdeai.co";
// A hung Vercel API must not hold the certification job (and queue the next deployment) for the
// whole 25-minute job limit. Each request gets its own short deadline.
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The names scripts/check-env-contract.mjs requires of a healthy production
 * (runtime tier + the production build's client tier). Kept in step with that
 * checker by a test, so there is one contract.
 */
export const REQUIRED_PRODUCTION_ENV = [
  { name: "DATABASE_URL" },
  { name: "SUPABASE_SERVICE_ROLE_KEY" },
  { name: "NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY" },
  { name: "NEXT_PUBLIC_SUPABASE_URL" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", oneOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
  { name: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" },
  { name: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID" },
];

function fail(message) {
  throw new Error(`vercel-release: ${message}`);
}

export function checkCredential(project) {
  if (!project || typeof project !== "object" || project.error) {
    fail("the Vercel token could not read the project (wrong team/project, or an invalid token)");
  }
  if (project.id !== PROJECT_ID) fail("token reached a different Vercel project");
  if (project.name !== PROJECT_NAME) fail("token reached a project with an unexpected name");
  if (project.accountId !== TEAM_ID) fail("token reached a different Vercel team");
  if (project.link?.productionBranch !== PRODUCTION_BRANCH) {
    fail(`the project's production branch is not ${PRODUCTION_BRANCH}`);
  }
}

const targetsOf = (entry) => (Array.isArray(entry.target) ? entry.target : [entry.target]).filter(Boolean);

/** Names + targets only. Values are never read. */
export function checkEnvNames(body) {
  if (body?.pagination?.next) {
    fail("the env list has more than one page; refusing to guess which names exist");
  }
  const forProduction = new Set(
    (body?.envs ?? []).filter((entry) => targetsOf(entry).includes("production")).map((entry) => entry.key),
  );
  const present = [];
  const missing = [];
  for (const spec of REQUIRED_PRODUCTION_ENV) {
    const found = [spec.name, ...(spec.oneOf ?? [])].find((name) => forProduction.has(name));
    if (found) present.push(found);
    else missing.push(spec.name);
  }
  if (missing.length) fail(`Production is missing required variable(s): ${missing.join(", ")}`);
  return { present, missing };
}

function checkIdentity(deployment, expected) {
  if (!deployment || typeof deployment !== "object" || deployment.error) {
    fail("the deployment could not be read from Vercel");
  }
  if (deployment.id !== expected.id) fail("deployment id is not the exact deployment that was certified");
  if (deployment.projectId !== PROJECT_ID) fail("deployment belongs to a different project");
  if (deployment.target !== "production") fail("deployment is not a production deployment");
  if (deployment.readyState !== "READY") fail(`deployment is not READY (${String(deployment.readyState)})`);
  if (String(deployment.meta?.githubCommitSha ?? "").toLowerCase() !== expected.sha.toLowerCase()) {
    fail("deployment commit sha is not the sha that was certified");
  }
  if (deployment.meta?.githubCommitRef !== PRODUCTION_BRANCH) {
    fail(`deployment was not built from ${PRODUCTION_BRANCH}`);
  }
}

/** Before certification: a candidate must not already own a production domain. */
export function checkStaged(deployment, expected) {
  checkIdentity(deployment, expected);
  // The workflow tests the URL from the dispatch event but promotes the deployment id. Bind them:
  // otherwise a forged event could pair a healthy URL with another build's id, so the build that
  // was certified would not be the build that is released.
  if (!expected.host) fail("the certified candidate URL host is required");
  if (String(deployment.url ?? "").toLowerCase() !== expected.host.toLowerCase()) {
    fail("the certified candidate URL does not belong to this deployment id");
  }
  const owned = (deployment.alias ?? []).filter((alias) => PRODUCTION_DOMAINS.includes(alias));
  if (owned.length) {
    fail(
      `candidate already owns production domain(s) ${owned.join(", ")} — either automatic production domain ` +
        "assignment is still on, or an earlier run of this workflow already promoted it and only verification " +
        "is left (check what www.mdeai.co serves; do not re-run certification for an already-promoted deployment)",
    );
  }
}

/** After promotion: the production domain serves exactly what was tested. */
export function checkPromoted(deployment, expected) {
  checkIdentity(deployment, expected);
  if (!(deployment.alias ?? []).includes(PRIMARY_DOMAIN)) {
    fail(`${PRIMARY_DOMAIN} does not point at the certified deployment`);
  }
}

export async function vercelGet(
  pathAndQuery,
  { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, token = process.env.VERCEL_TOKEN } = {},
) {
  const bearer = (token ?? "").trim();
  if (!bearer) fail("VERCEL_TOKEN is required");
  const label = pathAndQuery.split("?")[0];
  let response;
  try {
    response = await fetchImpl(`https://api.vercel.com${pathAndQuery}`, {
      headers: { authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      fail(`Vercel API timed out after ${Math.round(timeoutMs / 1000)}s for ${label}`);
    }
    const rawCode = error?.cause?.code ?? error?.code;
    const safeCode = typeof rawCode === "string" && /^[A-Z0-9_]{2,32}$/.test(rawCode) ? rawCode : null;
    fail(`Vercel API request failed for ${label}${safeCode ? ` (${safeCode})` : ""}`);
  }
  // Never echo the body: it can carry account detail. Status + the request label is enough.
  if (!response.ok) fail(`Vercel API answered ${response.status} for ${label}`);
  return response.json();
}

const required = (name) => {
  const value = (process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(command) {
  if (command === "credential") {
    checkCredential(await vercelGet(`/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`));
    console.log(`vercel-release: credential OK — ${PROJECT_NAME} on the current team`);
  } else if (command === "env-names") {
    const { present } = checkEnvNames(await vercelGet(`/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&limit=100`));
    console.log(`vercel-release: Production defines all ${present.length} required variable names`);
  } else if (command === "assert-staged") {
    const expected = {
      id: required("VERCEL_DEPLOYMENT_ID"),
      sha: required("VERCEL_DEPLOYMENT_SHA"),
      host: new URL(required("VERCEL_DEPLOYMENT_URL")).host,
    };
    checkStaged(await vercelGet(`/v13/deployments/${expected.id}?teamId=${TEAM_ID}`), expected);
    console.log(`vercel-release: ${expected.id} is staged (READY, main, no production domain)`);
  } else if (command === "assert-promoted") {
    const expected = { id: required("VERCEL_DEPLOYMENT_ID"), sha: required("VERCEL_DEPLOYMENT_SHA") };
    let lastError;
    // `vercel promote` waits for completion; a short retry only absorbs alias read-after-write lag.
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        checkPromoted(await vercelGet(`/v13/deployments/${PRIMARY_DOMAIN}?teamId=${TEAM_ID}`), expected);
        console.log(`vercel-release: ${PRIMARY_DOMAIN} serves the certified ${expected.id} @ ${expected.sha.slice(0, 12)}`);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 6) await wait(10_000);
      }
    }
    throw lastError;
  } else {
    fail("usage: vercel-release-control.mjs <credential|env-names|assert-staged|assert-promoted>");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
