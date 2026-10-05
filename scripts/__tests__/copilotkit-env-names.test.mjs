import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * SAN-1330 — the CopilotKit variable names.
 *
 * The retired service-bearer name collided with CopilotKit's own credentials, so MDE's custom bearer
 * now has its own name (`MDE_COPILOTKIT_SERVICE_BEARER`) and the CopilotKit variables are exactly
 * `CPK_INTELLIGENCE_API_KEY` and `NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY`. This guard fails if
 * production code, the env contract, the release gate, the workflows or `.env.example` ever read
 * a retired name again. Test files are excluded: they name it on purpose, as the negative case.
 */
// Two retired names: the service-bearer name, and the MDE-specific browser license name that
// CopilotKit's own `NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY` replaced. Built from parts so this file
// never contains either literally.
const RETIRED_NAMES = [`${"COPILOTKIT"}_API_KEY`, `NEXT_PUBLIC_COPILOTKIT_${"PUBLIC"}_LICENSE_KEY`];
const RETIRED = new RegExp(`(?<![A-Z0-9_])(?:${RETIRED_NAMES.join("|")})(?![A-Z0-9_])`);
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__snapshots__"]);

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

const isTestFile = (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const SCAN = ["src", "scripts", ".github/workflows", "e2e"];
const SINGLE = [".env.example", "package.json", "next.config.ts", "vercel.json"];

test("no production code, contract, gate, workflow or example env reads the retired CopilotKit name", () => {
  const offenders = [];
  const check = (file) => {
    if (isTestFile(file) || !fs.existsSync(file)) return;
    if (RETIRED.test(fs.readFileSync(file, "utf8"))) offenders.push(file);
  };
  for (const dir of SCAN) if (fs.existsSync(dir)) for (const file of files(dir)) check(file);
  for (const file of SINGLE) check(file);
  assert.deepEqual(offenders, [], "these files still use the retired variable name");
});

test("the service bearer reads only its own, correctly named variable", () => {
  const auth = fs.readFileSync("src/lib/copilotkit-auth.ts", "utf8");
  assert.match(auth, /process\.env\.MDE_COPILOTKIT_SERVICE_BEARER/);
  assert.doesNotMatch(auth, /process\.env\.(CPK_INTELLIGENCE_API_KEY|NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY)/, "the bearer must never be a CopilotKit credential");
});

test("the browser license key reaches the provider only through the shared prop builder", () => {
  const props = fs.readFileSync("src/lib/copilotkit-client-props.ts", "utf8");
  assert.match(props, /process\.env\.NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY/);
  assert.match(props, /publicLicenseKey/);
  assert.doesNotMatch(props, /publicApiKey:/, "never pass the legacy Cloud key alias (UX-001)");
});

test("the CopilotKit Intelligence key is server-only: never referenced from client code", () => {
  const offenders = [];
  for (const file of files("src")) {
    if (isTestFile(file) || !/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const isClient = /^\s*["']use client["']/m.test(text);
    if (isClient && /CPK_INTELLIGENCE_API_KEY/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
