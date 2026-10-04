import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  PRODUCTION_DOMAINS,
  PROJECT_ID,
  REQUIRED_PRODUCTION_ENV,
  TEAM_ID,
  checkCredential,
  checkEnvNames,
  checkPromoted,
  checkStaged,
  vercelGet,
} from "../vercel-release-control.mjs";

/**
 * SAN-1330 — the release-control checks that decide whether a candidate may be
 * promoted to www.mdeai.co. They are pure functions over Vercel API response
 * shapes (fixtures below mirror real GET /v9 project, /v10 env and /v13
 * deployment responses), so every rule is proven without network or secrets.
 */
const SHA = "ef427a31f52837ccd9d8e73b5ca7720839ee16d9";
const ID = "dpl_AhQPocB7UYbzTgRHioYxN6sZH7p3";
const HOST = "mdeai-abc123-amoco.vercel.app";
const expected = { id: ID, sha: SHA, host: HOST };

const stagedDeployment = (over = {}) => ({
  id: ID,
  projectId: PROJECT_ID,
  target: "production",
  readyState: "READY",
  url: HOST,
  meta: { githubCommitSha: SHA, githubCommitRef: "main" },
  alias: [],
  ...over,
});
const promotedDeployment = (over = {}) =>
  stagedDeployment({ alias: ["www.mdeai.co", "mdeai.co", "mdeai-amoco.vercel.app"], ...over });

const project = (over = {}) => ({
  id: PROJECT_ID,
  name: "mdeai",
  accountId: TEAM_ID,
  link: { productionBranch: "main" },
  ...over,
});

const env = (key, target = ["production"], extra = {}) => ({ key, target, type: "sensitive", value: "", ...extra });
const allRequired = () => REQUIRED_PRODUCTION_ENV.map((spec) => env(spec.name));

test("credential: the token sees the current team and project", () => {
  assert.doesNotThrow(() => checkCredential(project()));
});

for (const [name, over] of [
  ["a different project id", { id: "prj_old" }],
  ["a different project name", { name: "other" }],
  ["a different team (the stale PR #85 setup)", { accountId: "team_ZDZyovkHiBVULVkZLSQ7rEUU" }],
  ["a production branch that is not main", { link: { productionBranch: "develop" } }],
]) {
  test(`credential: rejects ${name}`, () => {
    assert.throws(() => checkCredential(project(over)), /vercel-release/);
  });
}

test("credential: an API error body is rejected, not treated as a project", () => {
  assert.throws(() => checkCredential({ error: { code: "forbidden", message: "Not authorized" } }), /vercel-release/);
});

test("env names: passes when every required name is defined for production", () => {
  const result = checkEnvNames({ envs: allRequired() });
  assert.deepEqual(result.missing, []);
});

test("env names: a name defined only for preview does not count", () => {
  const envs = allRequired().map((e) => (e.key === "GOOGLE_GENERATIVE_AI_API_KEY" ? { ...e, target: ["preview"] } : e));
  assert.throws(() => checkEnvNames({ envs }), /GOOGLE_GENERATIVE_AI_API_KEY/);
});

test("env names: reports a missing Gemini key by name", () => {
  const envs = allRequired().filter((e) => e.key !== "GOOGLE_GENERATIVE_AI_API_KEY");
  assert.throws(() => checkEnvNames({ envs }), /GOOGLE_GENERATIVE_AI_API_KEY/);
});

test("env names: missing CPK Intelligence key blocks release", () => {
  const envs = allRequired().filter((e) => e.key !== "CPK_INTELLIGENCE_API_KEY");
  assert.throws(() => checkEnvNames({ envs }), /CPK_INTELLIGENCE_API_KEY/);
});

test("env names: missing public CopilotKit license key blocks release", () => {
  const envs = allRequired().filter((e) => e.key !== "NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY");
  assert.throws(() => checkEnvNames({ envs }), /NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY/);
});

test("env names: legacy COPILOTKIT_API_KEY alone cannot satisfy the release contract", () => {
  const envs = allRequired()
    .filter((e) => !["CPK_INTELLIGENCE_API_KEY", "NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY"].includes(e.key))
    .concat(env("COPILOTKIT_API_KEY"));
  assert.throws(
    () => checkEnvNames({ envs }),
    /CPK_INTELLIGENCE_API_KEY.*NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY/,
  );
});

test("env names: accepts the legacy anon key in place of the publishable key", () => {
  const envs = allRequired()
    .filter((e) => e.key !== "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    .concat(env("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  assert.doesNotThrow(() => checkEnvNames({ envs }));
});

test("env names: a target given as a plain string still counts", () => {
  const envs = allRequired().map((e) => ({ ...e, target: "production" }));
  assert.doesNotThrow(() => checkEnvNames({ envs }));
});

test("env names: refuses to guess when the API says there are more pages", () => {
  assert.throws(() => checkEnvNames({ envs: allRequired(), pagination: { next: 123 } }), /more than one page/i);
});

test("env names: never touches or returns env values", () => {
  const secret = "sentinel-env-value-that-must-never-appear";
  const envs = allRequired().map((e) => ({ ...e, value: secret }));
  const result = checkEnvNames({ envs });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  const failing = envs.filter((e) => e.key !== "DATABASE_URL");
  assert.throws(
    () => checkEnvNames({ envs: failing }),
    (error) => !String(error.message).includes(secret),
  );
});

test("staged: a READY, main, unaliased candidate for the exact id and sha passes", () => {
  assert.doesNotThrow(() => checkStaged(stagedDeployment(), expected));
});

for (const domain of PRODUCTION_DOMAINS) {
  test(`staged: a candidate that already owns ${domain} is not staged`, () => {
    assert.throws(() => checkStaged(stagedDeployment({ alias: [domain] }), expected), /already|production domain/i);
  });
}

test("staged: other (non-production) aliases are fine", () => {
  assert.doesNotThrow(() => checkStaged(stagedDeployment({ alias: ["mdeai-amoco.vercel.app"] }), expected));
});

for (const [name, over, pattern] of [
  ["a different deployment id", { id: "dpl_SomeOtherDeployment1234567" }, /id/i],
  ["a different project", { projectId: "prj_old" }, /project/i],
  ["a preview target", { target: "preview" }, /production/i],
  ["a build that is not READY", { readyState: "BUILDING" }, /READY/],
  ["a different commit", { meta: { githubCommitSha: "0".repeat(40), githubCommitRef: "main" } }, /sha|commit/i],
  ["a non-main branch", { meta: { githubCommitSha: SHA, githubCommitRef: "feature/x" } }, /main/i],
]) {
  test(`staged: rejects ${name}`, () => {
    assert.throws(() => checkStaged(stagedDeployment(over), expected), pattern);
  });
}

test("promoted: www.mdeai.co serving the exact tested id and sha passes", () => {
  assert.doesNotThrow(() => checkPromoted(promotedDeployment(), expected));
});

test("promoted: the previous deployment still serving the domain fails", () => {
  assert.throws(
    () => checkPromoted(promotedDeployment({ id: "dpl_PreviousDeployment123456" }), expected),
    /id/i,
  );
});

test("promoted: the right id but a different commit fails", () => {
  assert.throws(
    () => checkPromoted(promotedDeployment({ meta: { githubCommitSha: "1".repeat(40), githubCommitRef: "main" } }), expected),
    /sha|commit/i,
  );
});

test("promoted: a deployment that does not hold www.mdeai.co fails", () => {
  assert.throws(() => checkPromoted(promotedDeployment({ alias: ["mdeai-amoco.vercel.app"] }), expected), /www\.mdeai\.co/);
});

test("staged: the certified URL must belong to the deployment id that gets promoted", () => {
  // The workflow tests the URL from the event but promotes the id. A forged event pairing a healthy
  // URL with another build's id would otherwise certify one build and release a different one.
  assert.throws(
    () => checkStaged(stagedDeployment({ url: "mdeai-someone-else-amoco.vercel.app" }), expected),
    /url|host/i,
  );
});

test("staged: the URL host comparison ignores letter case", () => {
  assert.doesNotThrow(() => checkStaged(stagedDeployment({ url: HOST.toUpperCase() }), expected));
});

test("staged: a candidate URL is required, not optional", () => {
  assert.throws(() => checkStaged(stagedDeployment(), { id: ID, sha: SHA }), /url|host/i);
});

test("vercelGet: a hung Vercel API fails fast instead of holding the job", async () => {
  const hanging = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  // AbortSignal.timeout's timer is unref'd; a real hung request holds a socket open, so keep the
  // event loop alive here the way that socket would.
  const keepAlive = setInterval(() => {}, 10);
  const started = Date.now();
  try {
    await assert.rejects(
      () => vercelGet("/v9/projects/x?teamId=y", { fetchImpl: hanging, timeoutMs: 40, token: "t" }),
      /timed out/i,
    );
  } finally {
    clearInterval(keepAlive);
  }
  assert.ok(Date.now() - started < 2_000, "must not wait for the 25-minute job limit");
});

test("vercelGet: an HTTP error reports status and path only, never the body or token", async () => {
  const forbidden = async () => new Response(JSON.stringify({ error: { message: "account-detail-secret" } }), { status: 403 });
  await assert.rejects(
    () => vercelGet("/v9/projects/x?teamId=y", { fetchImpl: forbidden, token: "sentinel-token-value" }),
    (error) =>
      /403/.test(error.message) &&
      !error.message.includes("account-detail-secret") &&
      !error.message.includes("sentinel-token-value"),
  );
});

test("vercelGet: sends the bearer token and returns parsed JSON", async () => {
  let seen;
  const ok = async (url, init) => {
    seen = { url, auth: init.headers.authorization };
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  };
  const body = await vercelGet("/v9/projects/x?teamId=y", { fetchImpl: ok, token: "tok" });
  assert.deepEqual(body, { id: "x" });
  assert.equal(seen.auth, "Bearer tok");
  assert.match(seen.url, /^https:\/\/api\.vercel\.com\/v9\/projects\/x/);
});

test("vercelGet: a missing token fails before any request is made", async () => {
  let called = false;
  await assert.rejects(
    () => vercelGet("/v9/projects/x", { fetchImpl: async () => { called = true; return new Response("{}"); }, token: "  " }),
    /VERCEL_TOKEN is required/,
  );
  assert.equal(called, false);
});

test("the release env contract is exactly the application's required env contract", () => {
  // One contract, two readers: the runtime checker defines what a healthy production needs; this
  // gate asks Vercel for exactly those names. (SAN-1330: it must check what the app consumes.)
  const source = fs.readFileSync(path.resolve("scripts/check-env-contract.mjs"), "utf8");
  const block = (start) => {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `${start} must exist in the env checker`);
    return source.slice(from, source.indexOf("\n];", from));
  };
  const names = (text) => [...text.matchAll(/\bname:\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]);
  const appContract = new Set([...names(block("const BUILD_CLIENT = [")), ...names(block("const RUNTIME = ["))]);
  const releaseContract = new Set(REQUIRED_PRODUCTION_ENV.map((spec) => spec.name));
  assert.deepEqual([...releaseContract].sort(), [...appContract].sort());

  assert.equal(releaseContract.has("CPK_INTELLIGENCE_API_KEY"), true);
  assert.equal(releaseContract.has("NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY"), true);
  // The retired name must not come back in either contract.
  assert.equal(releaseContract.has("COPILOTKIT" + "_API_KEY"), false);
  assert.equal(appContract.has("COPILOTKIT" + "_API_KEY"), false);
});
