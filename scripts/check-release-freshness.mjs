#!/usr/bin/env node
/**
 * Release-freshness preflight: stop status reports from recommending work already shipped.
 *
 * WHY THIS EXISTS
 * Three times this month a progress report described a state that was two merges old, and once it
 * recommended rebuilding a feature that was already deployed. The check that catches all of it is
 * five seconds long: compare remote main with what production actually serves.
 *
 * WHAT IT DOES NOT CLAIM
 * A newer commit on main is NOT a broken production. MDE deliberately stages, certifies and then
 * promotes, so `DEPLOYMENT_PENDING` is a normal state and does not fail by default. Only a claim
 * that production serves a commit it does not serve, or an unverifiable state, exits nonzero.
 *
 * USAGE
 *   node scripts/check-release-freshness.mjs                 # human summary
 *   node scripts/check-release-freshness.mjs --json          # machine readable
 *   node scripts/check-release-freshness.mjs --claimed <sha> # verify a report's deployed SHA
 *   node scripts/check-release-freshness.mjs --strict        # require main == production
 */

const FULL_SHA = /^[0-9a-f]{40}$/;

/** A commit identity, or null. Full 40-char SHA only; anything else is not a commit. */
export function normalizeSha(value) {
  if (typeof value !== "string") return null;
  const sha = value.trim().toLowerCase();
  return FULL_SHA.test(sha) ? sha : null;
}

export function shortSha(sha) {
  return sha ? sha.slice(0, 9) : "unknown";
}

/**
 * Does a claimed SHA match the served one?
 *
 * Full SHAs must be equal. A short claim is accepted only as a prefix of the served SHA, so two
 * unrelated commits that happen to share a prefix are never treated as the same release.
 */
export function claimMatches(claimed, served) {
  const full = normalizeSha(claimed);
  if (full) return full === served;
  const short = String(claimed ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{7,39}$/.test(short)) return false;
  return served.startsWith(short);
}

/**
 * CURRENT            main and production agree
 * DEPLOYMENT_PENDING production is behind a newer main (normal during staging)
 * STALE_CLAIM        a report claims a SHA production does not serve
 * UNKNOWN            GitHub, the network or the payload could not be verified
 */
export function classify({ main, production, claimed, productionIsAncestor = false }) {
  const mainSha = normalizeSha(main);
  const prodSha = normalizeSha(production);

  // A verified production SHA is enough to disprove a claim, even if GitHub
  // main could not be fetched or the two commit histories are unrelated.
  if (!prodSha) return "UNKNOWN";
  if (claimed !== undefined && claimed !== null && !claimMatches(claimed, prodSha)) return "STALE_CLAIM";
  if (!mainSha) return "UNKNOWN";
  if (mainSha === prodSha) return "CURRENT";
  return productionIsAncestor ? "DEPLOYMENT_PENDING" : "UNKNOWN";
}

/** Throws unless the payload carries a usable commit SHA. Invalid JSON is a failure, not a pass. */
export function readProductionSha(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("version endpoint did not return JSON");
  }
  const sha = normalizeSha(payload && payload.sha);
  if (!sha) throw new Error("version endpoint returned no commit sha");
  return sha;
}

export function exitCodeFor(status, { strict = false } = {}) {
  if (status === "CURRENT") return 0;
  if (status === "DEPLOYMENT_PENDING") return strict ? 1 : 0;
  return 1;
}

/** Validate a claim before performing any Git or production network I/O. */
export function parseArgs(argv) {
  const asJson = argv.includes("--json");
  const strict = argv.includes("--strict");
  const claimedIndex = argv.indexOf("--claimed");
  const claimed = claimedIndex < 0 ? undefined : argv[claimedIndex + 1];
  if (claimedIndex >= 0 && (typeof claimed !== "string" || !/^[0-9a-f]{7,40}$/i.test(claimed))) {
    throw new Error("--claimed requires a valid 7–40 character hexadecimal commit SHA");
  }
  return { asJson, strict, claimed };
}

async function resolveRemoteMain(run) {
  run("git", ["fetch", "origin", "--quiet"]);
  return run("git", ["rev-parse", "origin/main"]).trim();
}

async function main(argv) {
  const { execFileSync } = await import("node:child_process");
  const { asJson, strict, claimed } = parseArgs(argv);
  const run = (file, args) => execFileSync(file, args, { encoding: "utf8", timeout: 10_000 });
  const baseUrl = process.env.MDE_PRODUCTION_URL ?? "https://www.mdeai.co";

  let main_ = null;
  let production = null;
  let problem = null;

  try {
    main_ = await resolveRemoteMain(run);
  } catch {
    problem = "could not resolve origin/main";
  }

  try {
    const response = await fetch(baseUrl + "/api/version", {
      signal: AbortSignal.timeout(10_000),
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    production = readProductionSha(await response.text());
  } catch (error) {
    problem = (problem ? problem + "; " : "") + "production: " + (error?.message ?? String(error));
  }

  // A wrong claim is conclusive whenever production's SHA is verified. Do not
  // hide it behind a separate Git history failure or unnecessary ancestry lookup.
  const staleClaim = normalizeSha(production) !== null &&
    claimed !== undefined && !claimMatches(claimed, production);
  let productionIsAncestor = false;
  if (!problem && !staleClaim && normalizeSha(main_) !== normalizeSha(production)) {
    try {
      // Only a verified ancestor relationship establishes ordinary deployment lag.
      run("git", ["merge-base", "--is-ancestor", production, main_]);
      productionIsAncestor = true;
    } catch (error) {
      problem = error?.status === 1
        ? "production is not an ancestor of origin/main"
        : "could not verify production commit ancestry";
    }
  }

  const status = classify({ main: main_, production, claimed, productionIsAncestor });

  if (asJson) {
    console.log(
      JSON.stringify(
        { status, main: main_, production, claimed: claimed ?? null, problem },
        null,
        2,
      ),
    );
  } else {
    console.log("release freshness: " + status);
    console.log("  main        " + (main_ ? shortSha(main_) : "unknown"));
    console.log("  production  " + (production ? shortSha(production) : "unknown"));
    if (claimed) console.log("  claimed     " + claimed);
    if (problem) console.log("  problem     " + problem);
    if (status === "DEPLOYMENT_PENDING") {
      console.log("  note        main is newer than production — normal while a release is staged");
    }
  }

  process.exitCode = exitCodeFor(status, { strict });
}

if (process.argv[1] && process.argv[1].endsWith("check-release-freshness.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("release freshness: " + (error?.message ?? String(error)));
    process.exitCode = 1;
  });
}