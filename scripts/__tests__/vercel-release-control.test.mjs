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
} from "../vercel-release-control.mjs";

/**
 * SAN-1330 — the release-control checks that decide whether a candidate may be
 * promoted to www.mdeai.co. They are pure functions over Vercel API response
 * shapes (fixtures below mirror real GET /v9 project, /v10 env and /v13
 * deployment responses), so every rule is proven without network or secrets.
 */
const SHA = "ef427a31f52837ccd9d8e73b5ca7720839ee16d9";
const ID = "dpl_AhQPocB7UYbzTgRHioYxN6sZH7p3";
const expected = { id: ID, sha: SHA };

const stagedDeployment = (over = {}) => ({
  id: ID,
  projectId: PROJECT_ID,
  target: "production",
  readyState: "READY",
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
  const secret = "supersecret-value-that-must-never-appear";
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

test("the release env contract intentionally differs from the application runtime auth contract", () => {
  const source = fs.readFileSync(path.resolve("scripts/check-env-contract.mjs"), "utf8");
  const block = (start) => {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `${start} must exist in the env checker`);
    return source.slice(from, source.indexOf("\n];", from));
  };
  const names = (text) => [...text.matchAll(/\bname:\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]);
  const appContract = new Set([...names(block("const BUILD_CLIENT = [")), ...names(block("const RUNTIME = ["))]);
  const releaseContract = new Set(REQUIRED_PRODUCTION_ENV.map((spec) => spec.name));

  // COPILOTKIT_API_KEY remains the custom internal service bearer used by the app.
  // It must not be mistaken for either CopilotKit Cloud/Intelligence credential.
  assert.equal(appContract.has("COPILOTKIT_API_KEY"), true);
  assert.equal(releaseContract.has("COPILOTKIT_API_KEY"), false);
  assert.equal(releaseContract.has("CPK_INTELLIGENCE_API_KEY"), true);
  assert.equal(releaseContract.has("NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY"), true);

  for (const name of appContract) {
    if (name !== "COPILOTKIT_API_KEY") assert.equal(releaseContract.has(name), true, `${name} must stay release-gated`);
  }
});
