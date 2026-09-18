#!/usr/bin/env node
/**
 * SAN-1330 — preflight the Vercel environment *contract* for public variables.
 *
 * Why this exists
 * ---------------
 * `NEXT_PUBLIC_*` values are compiled into the browser bundle, so Vercel must
 * store them as **Config** (`encrypted` / `plain`). Vercel's own guidance is that
 * Config is for "non-sensitive configuration such as public prefixes", and a
 * Secret is write-only and not usable for that purpose.
 *
 * On 2026-09-18 production had `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
 * `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` configured as **Secrets**. `vercel env ls`
 * looked healthy, the deployment was `READY`, and `/chat` rendered
 * `data-testid="map-env-error"` because neither value reached the build.
 *
 * `scripts/check-env-contract.mjs` catches that at build time, by which point the
 * production deployment has already been attempted. This catches it *before*,
 * from the project's environment metadata.
 *
 * Usage
 * -----
 *   node scripts/check-vercel-env-contract.mjs --project mdeai --scope amo1000
 *   node scripts/check-vercel-env-contract.mjs --input env.json      # offline
 *   node scripts/check-vercel-env-contract.mjs ... --warn-only       # advisory
 *
 * Credentials: `VERCEL_TOKEN`, or the Vercel CLI's stored auth
 * (`~/.local/share/com.vercel.cli/auth.json`). Variable VALUES are never read
 * from the API and never printed — only names, types and targets.
 */
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);

const projectName = flag("--project") ?? "mdeai";
const scopeSlug = flag("--scope") ?? "amo1000";
const inputFile = flag("--input");
const warnOnly = has("--warn-only");

/** Public variables the production client contract requires, with fallbacks. */
const REQUIRED_PUBLIC = [
  { key: "NEXT_PUBLIC_SUPABASE_URL" },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", oneOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
  { key: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" },
  { key: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID" },
];

/** Vercel types that cannot satisfy a public, build-time-inlined variable. */
const SECRET_TYPES = new Set(["secret", "sensitive"]);

/**
 * Every name the required contract mentions — primary or fallback. The required
 * loop already governs these, so the generic sweep below ignores them and only
 * reports `NEXT_PUBLIC_*` names outside the contract.
 */
const REQUIRED_PUBLIC_KEYS = new Set(
  REQUIRED_PUBLIC.flatMap((spec) => [spec.key, ...(spec.oneOf ?? [])]),
);

function readToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const candidates = [
    path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json"),
    path.join(os.homedir(), ".vercel/auth.json"),
  ];
  for (const file of candidates) {
    try {
      const auth = JSON.parse(fs.readFileSync(file, "utf8"));
      const token = auth.token ?? auth.accessToken;
      if (token) return token;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

function apiGet(token, reqPath) {
  return new Promise((resolve, reject) => {
    https
      .get({ hostname: "api.vercel.com", path: reqPath, headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, json: {} });
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * Generic form of the SAN-1322 outage.
 *
 * Every `NEXT_PUBLIC_*` name is compiled into the browser bundle at build time,
 * and Vercel can only inline a Config (`encrypted`/`plain`) value. A Secret or
 * Sensitive value is never inlined, so the client silently receives `undefined`
 * and the feature breaks while the deployment still reports READY.
 *
 * `REQUIRED_PUBLIC` only covers the names the app is known to need today. This
 * catches the rest, because production also stored `NEXT_PUBLIC_SITE_URL`,
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY`
 * as Sensitive — each one silently unavailable to the client.
 */
function publicSecretFindings(envs) {
  return envs
    .filter((e) => (e.target ?? []).includes("production"))
    .filter((e) => String(e.key).startsWith("NEXT_PUBLIC_"))
    .filter((e) => SECRET_TYPES.has(e.type))
    .map((e) => ({
      key: e.key,
      type: e.type,
      kind: "public-secret",
      detail: `type=${e.type} — NEXT_PUBLIC_* is inlined at build time, so a secret type compiles it to undefined in the client bundle`,
    }));
}

/** envs: [{ key, type, target: [] }] — no values. */
function evaluate(envs) {
  const targetsProduction = (e) => (e.target ?? []).includes("production");
  const find = (key) => envs.find((e) => e.key === key && targetsProduction(e));

  const findings = [];
  for (const spec of REQUIRED_PUBLIC) {
    const match = find(spec.key) ?? (spec.oneOf ?? []).map(find).find(Boolean);
    if (!match) {
      findings.push({ key: spec.key, kind: "missing", detail: "not set for Production" });
      continue;
    }
    if (SECRET_TYPES.has(match.type)) {
      findings.push({
        key: match.key,
        type: match.type,
        kind: "secret",
        detail: `type=${match.type} — a public variable must be Config (encrypted/plain) or it will not reach the client build`,
      });
    }
  }

  // Anything the required contract mentions is already governed above; only
  // names outside it need the generic sweep, so nothing is reported twice.
  const seen = new Set(findings.map((f) => f.key));
  for (const finding of publicSecretFindings(envs)) {
    if (!REQUIRED_PUBLIC_KEYS.has(finding.key) && !seen.has(finding.key)) {
      findings.push(finding);
    }
  }

  return findings;
}

async function loadEnvs() {
  if (inputFile) {
    // `--input -` reads metadata from stdin, so callers and tests can pipe JSON
    // instead of writing a temporary file.
    const fromStdin = inputFile === "-";
    const parsed = JSON.parse(fromStdin ? fs.readFileSync(0, "utf8") : fs.readFileSync(inputFile, "utf8"));
    const list = Array.isArray(parsed) ? parsed : (parsed.envs ?? []);
    return { source: fromStdin ? "stdin" : `file:${inputFile}`, envs: list };
  }

  const token = readToken();
  if (!token) {
    throw new Error(
      "no Vercel credentials: set VERCEL_TOKEN, or authenticate the Vercel CLI, or pass --input <file>",
    );
  }

  const teams = (await apiGet(token, "/v2/teams")).json.teams ?? [];
  const team = teams.find((t) => t.slug === scopeSlug);
  if (!team) throw new Error(`team '${scopeSlug}' not found for these credentials`);

  const projects = (await apiGet(token, `/v9/projects?limit=50&teamId=${team.id}`)).json.projects ?? [];
  const project = projects.find((p) => p.name === projectName);
  if (!project) throw new Error(`project '${projectName}' not found in team '${scopeSlug}'`);

  // No decrypt: we only need key/type/target metadata, never values.
  const envs = (await apiGet(token, `/v9/projects/${project.id}/env?teamId=${team.id}`)).json.envs ?? [];
  return { source: `${scopeSlug}/${projectName}`, envs };
}

const { source, envs } = await loadEnvs();
const findings = evaluate(envs);

console.log(`vercel-env-contract: ${source}`);
for (const spec of REQUIRED_PUBLIC) {
  const match = envs.find(
    (e) => (e.key === spec.key || (spec.oneOf ?? []).includes(e.key)) && (e.target ?? []).includes("production"),
  );
  if (!match) console.log(`  MISSING ${spec.key}`);
  else if (SECRET_TYPES.has(match.type)) console.log(`  SECRET  ${match.key} (type=${match.type})`);
  else console.log(`  ok      ${match.key} (type=${match.type})`);
}

// Every other NEXT_PUBLIC_* stored as Secret is silently undefined in the browser.
const otherPublicSecrets = publicSecretFindings(envs).filter(
  (f) => !REQUIRED_PUBLIC_KEYS.has(f.key),
);
if (otherPublicSecrets.length) {
  console.log("");
  console.log("  other NEXT_PUBLIC_* stored as Secret (never inlined into the client build):");
  for (const finding of otherPublicSecrets) {
    console.log(`  SECRET  ${finding.key} (type=${finding.type})`);
  }
}

if (findings.length === 0) {
  console.log("");
  console.log("vercel-env-contract: OK");
} else {
  console.log("");
  for (const f of findings) console.error(`  ${f.kind.toUpperCase()}: ${f.key} — ${f.detail}`);
  console.error("");
  console.error(
    "Public variables compiled into the client bundle must be Config, not Secret." +
      " Delete the Secret and re-create it as Config, then redeploy — NEXT_PUBLIC_* is compiled in.",
  );
  if (warnOnly) {
    console.log("vercel-env-contract: WARN (advisory mode)");
  } else {
    console.error(`vercel-env-contract: FAIL — ${findings.length} problem(s)`);
    process.exitCode = 1;
  }
}
