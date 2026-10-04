#!/usr/bin/env node
/**
 * SAN-1314 — deterministic environment-contract validator.
 *
 * Prevents the "Vercel deployment READY but the application is broken" class of
 * incident. A client-required `NEXT_PUBLIC_*` value that is absent from the
 * BUILD environment is silently inlined as `undefined`, so the page ships and
 * renders a degraded fallback while every other signal stays green.
 *
 * Real example (SAN-1322): production was READY, `/`, `/events` and
 * `/api/copilotkit/info` were all healthy, but `/chat` rendered
 * `data-testid="map-env-error"` because `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` never
 * reached the Next.js build.
 *
 * Usage
 * -----
 *   node scripts/check-env-contract.mjs --mode=build     # build-time client contract
 *   node scripts/check-env-contract.mjs --mode=runtime   # deployed runtime contract
 *   node scripts/check-env-contract.mjs --mode=build --strict   # force failure in CI too
 *
 * Strictness
 * ----------
 * - `--mode=build` fails when `VERCEL_ENV=production` (the production build is the
 *   only place a missing `NEXT_PUBLIC_*` can silently poison the client bundle).
 *   Everywhere else it reports and warns, so local/CI builds keep working.
 * - `--mode=runtime` always fails when a runtime-required variable is missing.
 *
 * Env files (SAN-1388)
 * --------------------
 * The checker loads `.env.local` / `.env` through Next.js's own `loadEnvConfig`
 * (same files, same order, same precedence), so a direct run sees what
 * `next build` / `next start` see. An explicit process / CI / Vercel variable
 * always wins over a file. Only the NAMES of the files read are printed.
 *
 * Gemini (SAN-1388)
 * -----------------
 * `GOOGLE_GENERATIVE_AI_API_KEY` is required by `--mode=runtime`: every Mastra
 * agent calls Gemini through `src/mastra/lib/models.ts`, so a runtime without
 * the key is not healthy. Build modes (including `--strict`, used by the floor)
 * stay secret-free: building does not call Gemini.
 *
 * Only variables required by the production feature contract are enforced.
 * Optional integrations are listed as optional and never block a deploy.
 * Variable VALUES are never printed.
 */
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const args = new Set(process.argv.slice(2));
const mode = [...args].find((a) => a.startsWith("--mode="))?.slice("--mode=".length) ?? "build";
const forceStrict = args.has("--strict");

// Same loader Next uses. `false` = not the dev server, i.e. the `next build` /
// `next start` file set. Silent logger: its "Loaded env from …" lines are
// replaced by one line below that names the files and nothing else.
const { loadedEnvFiles } = loadEnvConfig(process.cwd(), false, {
  info: () => {},
  error: (...message) => console.error(...message),
});

/** Build-time client configuration: compiled into the browser bundle. */
const BUILD_CLIENT = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", why: "proxy/session gate + browser Supabase client" },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    oneOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    why: "public Supabase key (publishable preferred, legacy anon accepted)",
  },
  { name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", why: "Maps JS key — /chat map + concierge canvas" },
  {
    name: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
    why: "AdvancedMarker map id",
    productionOnly: true, // provisioned in Vercel Production/Preview, not in CI Floor
  },
  {
    // SAN-1330 — CopilotKit's public license key, passed to <CopilotKitProvider> as
    // `publicLicenseKey` (src/lib/copilotkit-client-props.ts). NEXT_PUBLIC_* is compiled
    // into the bundle, so a production build without it silently ships without a license.
    name: "NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY",
    why: "CopilotKit public license key (browser provider)",
    productionOnly: true, // provisioned in Vercel Production/Preview, not in CI Floor
  },
];

/** Runtime server configuration: required by a deployed production runtime. */
const RUNTIME = [
  { name: "DATABASE_URL", why: "Mastra Postgres storage — production fails closed without it" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", why: "privileged server reads/writes (ai_runs, durability)" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", why: "SSR/proxy session refresh" },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    oneOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    why: "public Supabase key",
  },
  {
    // SAN-1388 — every Mastra agent calls Gemini through src/mastra/lib/models.ts.
    // No alternative key name: the app reads exactly this one (@ai-sdk/google).
    name: "GOOGLE_GENERATIVE_AI_API_KEY",
    why: "Gemini API key — Mastra agents call Gemini (src/mastra/lib/models.ts)",
  },
];

/** Optional feature configuration: degrade gracefully, never block. */
const OPTIONAL = [
  // SAN-1330 — MDE's OWN service-to-service bearer for /api/copilotkit (src/lib/copilotkit-auth.ts).
  // Not a CopilotKit credential. Optional because nothing in the repo presents it; when unset the
  // service path is CLOSED (401), never open.
  "MDE_COPILOTKIT_SERVICE_BEARER",
  // SAN-1330 — CopilotKit Intelligence credential (server-only; never NEXT_PUBLIC_*). Keep it
  // provisioned, but do not gate a release on it: CopilotKit reads it only through
  // `new CopilotKitIntelligence({ apiKey })`, which MDE does not construct today (same-origin
  // runtime on purpose: UX-001, D17). When MDE enables Intelligence (Rich Threads, User Memory,
  // Learning, Analytics, Channels) this moves to RUNTIME, with a real thread create/reopen proof
  // rather than a presence check, because Intelligence would then be a live dependency.
  "CPK_INTELLIGENCE_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_MAPS_SERVER_API_KEY",
  "ADK_GROUNDING_URL",
  "ADK_INTERNAL_TOKEN",
  "ENABLE_SEARCH_GROUNDING",
  "SEARCH_GROUNDING_DAILY_CAP",
  "NEXT_PUBLIC_SITE_URL",
];

const present = (name) => Boolean((process.env[name] ?? "").trim());

function satisfied(spec) {
  if (present(spec.name)) return spec.name;
  for (const alt of spec.oneOf ?? []) {
    if (present(alt)) return alt;
  }
  return null;
}

const vcelEnv = process.env.VERCEL_ENV ?? "";
const isProductionBuild = mode === "build" && vcelEnv === "production";
const strict = mode === "runtime" || isProductionBuild || forceStrict;

const required = mode === "build" ? BUILD_CLIENT : RUNTIME;
// The tier this invocation does not enforce, reported for operator context.
const otherTier = mode === "build" ? RUNTIME : BUILD_CLIENT;

const failures = [];
const warnings = [];

console.log(`env-contract: mode=${mode} strict=${strict}${vcelEnv ? ` VERCEL_ENV=${vcelEnv}` : ""}`);
console.log(
  `env files: ${loadedEnvFiles.length ? loadedEnvFiles.map((file) => file.path).join(", ") : "none found"}`,
);
console.log("");

console.log(`required (${mode === "build" ? "build-time client" : "runtime server"}):`);
for (const spec of required) {
  const via = satisfied(spec);
  if (via) {
    console.log(`  ok      ${spec.name}${via === spec.name ? "" : ` (via ${via})`}`);
  } else if (spec.productionOnly && !isProductionBuild) {
    // Provisioned in Vercel Production/Preview only; CI Floor legitimately lacks it.
    console.log(`  n/a     ${spec.name} — production-only, not required here`);
    warnings.push(`${spec.name} absent (production-only, not required for this build)`);
  } else if (strict) {
    console.log(`  MISSING ${spec.name} — ${spec.why}`);
    failures.push(spec);
  } else {
    // Non-production build (local dev / non-strict CI): report, never block.
    console.log(`  missing ${spec.name} — ${spec.why}`);
    warnings.push(`${spec.name} absent (informational: not a production build)`);
  }
}

console.log("");
console.log(
  `not enforced in this mode (${mode === "build" ? "runtime server" : "build-time client"} tier):`,
);
for (const spec of otherTier) {
  const note = mode === "build" ? "checked at deploy/ops time" : "already compiled into the build";
  console.log(`  ${present(spec.name) ? "set " : "unset"}   ${spec.name} — ${note}`);
}

console.log("");
console.log("optional (never blocks a deploy):");
for (const name of OPTIONAL) console.log(`  ${present(name) ? "set " : "unset"}   ${name}`);

if (warnings.length) {
  console.log("");
  for (const w of warnings) console.log(`warn: ${w}`);
}

if (failures.length) {
  console.log("");
  console.error(
    `env-contract: FAIL — ${failures.length} required variable(s) missing: ${failures
      .map((f) => f.name)
      .join(", ")}`,
  );
  if (mode === "build") {
    console.error(
      "A required NEXT_PUBLIC_* value missing from the build is silently inlined as undefined," +
        " so the deployment would be READY while the feature is broken.",
    );
    console.error(
      "Fix the environment (Vercel Project → Settings → Environment Variables) and redeploy." +
        " NEXT_PUBLIC_* is compiled in, so a redeploy is mandatory. Values are never printed here.",
    );
  } else {
    console.error(
      "A required runtime variable is missing, so the deployed runtime cannot satisfy the" +
        " production feature contract (storage/auth fail closed on purpose).",
    );
    console.error(
      "Fix the environment (Vercel Project → Settings → Environment Variables) and redeploy." +
        " Values are never printed here.",
    );
  }
  process.exitCode = 1;
} else {
  console.log("");
  console.log("env-contract: OK");
}
