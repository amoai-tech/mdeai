#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const EXPECTED_PROJECT_ID = "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB";
const EXPECTED_PROJECT_NAME = "mdeai";
const EXPECTED_ENVIRONMENT = "production";
// SAN-1330: only `main` may be certified and promoted. Vercel's dispatch payload sends the plain
// branch name (`git.ref: "main"`), not `refs/heads/main`.
const EXPECTED_REF = "main";
// The deployment ID is the value `vercel promote` receives, so it must be a real Vercel ID and
// nothing a shell could read as anything else.
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,}$/;
const EXPECTED_HOST = /^mdeai-[a-z0-9-]+-amoco\.vercel\.app$/i;
const SHA40 = /^[0-9a-f]{40}$/i;

function required(name) {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function fail(message) {
  console.error(`vercel-candidate: FAIL — ${message}`);
  process.exit(1);
}

try {
  const deploymentId = required("VERCEL_DEPLOYMENT_ID");
  const deploymentRef = required("VERCEL_DEPLOYMENT_REF");
  const rawUrl = required("VERCEL_DEPLOYMENT_URL");
  const deploymentSha = required("VERCEL_DEPLOYMENT_SHA");
  const projectId = required("VERCEL_PROJECT_ID");
  const projectName = required("VERCEL_PROJECT_NAME");
  const environment = required("VERCEL_ENVIRONMENT");

  if (!DEPLOYMENT_ID.test(deploymentId)) throw new Error("deployment id is not a valid Vercel deployment id");
  if (deploymentRef !== EXPECTED_REF) throw new Error("candidate is not from the main branch");
  if (projectId !== EXPECTED_PROJECT_ID) throw new Error("unexpected Vercel project id");
  if (projectName !== EXPECTED_PROJECT_NAME) throw new Error("unexpected Vercel project name");
  if (environment !== EXPECTED_ENVIRONMENT) throw new Error("candidate is not production environment");
  if (!SHA40.test(deploymentSha)) throw new Error("deployment SHA must be exactly 40 hexadecimal characters");

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("deployment URL is invalid");
  }

  if (url.protocol !== "https:") throw new Error("deployment URL must use https");
  if (url.username || url.password) throw new Error("deployment URL must not contain credentials");
  if (url.port) throw new Error("deployment URL must not contain an explicit port");
  if (!EXPECTED_HOST.test(url.hostname)) throw new Error("deployment URL is not an MDE Vercel deployment host");
  if (url.pathname !== "/") throw new Error("deployment URL must not contain a path");
  if (url.search) throw new Error("deployment URL must not contain a query string");
  if (url.hash) throw new Error("deployment URL must not contain a fragment");

  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (deploymentSha.toLowerCase() !== head.toLowerCase()) {
    throw new Error("deployment SHA does not match checked-out HEAD");
  }

  console.log(`vercel-candidate: OK — ${deploymentId} ${url.hostname} @ ${deploymentSha.slice(0, 12)} (${deploymentRef})`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
