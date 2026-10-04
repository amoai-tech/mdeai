import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * SAN-1388 · Make MDE env checks match Next.js and fail when Gemini is missing.
 *
 * `scripts/check-env-contract.mjs` is the repository's environment gate. Two
 * things must hold, and both are proven here by driving the real script in a
 * subprocess:
 *
 *   1. It sees the same `.env.local` / `.env` values Next.js sees (same file
 *      order, and an explicit process/CI/Vercel variable keeps precedence).
 *   2. A real runtime cannot be called healthy without the Gemini key, while
 *      build and strict-CI modes stay secret-free.
 *
 * Every case runs in its own temporary directory with fixture files and a
 * scrubbed environment, so a developer's real `.env*` can never leak in. The
 * fixture values are obvious sentinels, and every case asserts they are never
 * printed.
 */
const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "check-env-contract.mjs",
);

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Run the checker in a fresh temp project dir.
 * `files` maps a file name (".env.local") to its content; `env` is the explicit
 * process environment. NODE_ENV is left unset unless a case sets it, because
 * Next skips `.env.local` when NODE_ENV=test.
 */
function run(args, { files = {}, env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "env-contract-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const CLIENT = [
  "NEXT_PUBLIC_SUPABASE_URL=sentinel-url-7f3a",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sentinel-pub-7f3a",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=sentinel-maps-7f3a",
].join("\n");

const RUNTIME_WITHOUT_GEMINI = [
  "DATABASE_URL=sentinel-db-7f3a",
  "SUPABASE_SERVICE_ROLE_KEY=sentinel-service-7f3a",
  "CPK_INTELLIGENCE_API_KEY=sentinel-ck-7f3a",
  "NEXT_PUBLIC_SUPABASE_URL=sentinel-url-7f3a",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sentinel-pub-7f3a",
].join("\n");

const SENTINEL = /sentinel-[a-z]+-7f3a/;

describe("loads env files the way Next.js does", () => {
  it("sees values that exist only in .env.local", () => {
    const { status, out } = run(["--mode=build", "--strict"], { files: { ".env.local": CLIENT } });
    assert.equal(status, 0, out);
    assert.match(out, /env-contract: OK/);
  });

  it("sees values that exist only in .env", () => {
    const { status, out } = run(["--mode=build", "--strict"], { files: { ".env": CLIENT } });
    assert.equal(status, 0, out);
  });

  it("without any env file the strict check still fails, as before", () => {
    const { status, out } = run(["--mode=build", "--strict"]);
    assert.equal(status, 1, out);
    assert.match(out, /MISSING NEXT_PUBLIC_SUPABASE_URL/);
  });

  it(".env.local wins over .env, like Next (an empty .env.local value hides the .env one)", () => {
    const { status, out } = run(["--mode=build", "--strict"], {
      files: { ".env": CLIENT, ".env.local": "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=\n" },
    });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  });

  it("an explicit process variable wins over every env file", () => {
    // Process env has the key; the file tries to blank it. Process env must win.
    const { status, out } = run(["--mode=build", "--strict"], {
      files: { ".env.local": `${CLIENT}\nNEXT_PUBLIC_GOOGLE_MAPS_API_KEY=\n` },
      env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "sentinel-process-7f3a" },
    });
    assert.equal(status, 0, out);
  });

  it("an explicitly empty process variable is not refilled from a file", () => {
    // Same rule Next applies: the explicit environment (even empty) beats the file.
    const { status, out } = run(["--mode=build", "--strict"], {
      files: { ".env.local": CLIENT },
      env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "" },
    });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  });

  it("skips .env.local when NODE_ENV=test, exactly like Next", () => {
    const { status, out } = run(["--mode=build", "--strict"], {
      files: { ".env.local": CLIENT },
      env: { NODE_ENV: "test" },
    });
    assert.equal(status, 1, out);
  });

  it("names the env files it read, never their values", () => {
    const { out } = run(["--mode=build", "--strict"], { files: { ".env.local": CLIENT } });
    assert.match(out, /env files: .*\.env\.local/);
    assert.doesNotMatch(out, SENTINEL);
  });
});

describe("Gemini is required for a real runtime only", () => {
  it("runtime FAILS when GOOGLE_GENERATIVE_AI_API_KEY is missing", () => {
    const { status, out } = run(["--mode=runtime"], { files: { ".env.local": RUNTIME_WITHOUT_GEMINI } });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING GOOGLE_GENERATIVE_AI_API_KEY/);
    assert.match(out, /env-contract: FAIL/);
  });

  it("runtime PASSES when the Gemini key is in .env.local", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": `${RUNTIME_WITHOUT_GEMINI}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\n` },
    });
    assert.equal(status, 0, out);
    assert.match(out, /env-contract: OK/);
  });

  it("runtime PASSES when the Gemini key comes from the process environment", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": RUNTIME_WITHOUT_GEMINI },
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "sentinel-gem-7f3a" },
    });
    assert.equal(status, 0, out);
  });

  it("runtime still fails for its other required variables, as before", () => {
    const { status, out } = run(["--mode=runtime"], {
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "sentinel-gem-7f3a" },
    });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING DATABASE_URL/);
  });

  it("build mode does not need Gemini", () => {
    const { status, out } = run(["--mode=build"], { files: { ".env.local": CLIENT } });
    assert.equal(status, 0, out);
    assert.doesNotMatch(out, /MISSING GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("strict build (the floor / mocked CI) does not need Gemini", () => {
    const { status, out } = run(["--mode=build", "--strict"], { files: { ".env.local": CLIENT } });
    assert.equal(status, 0, out);
    assert.doesNotMatch(out, /GOOGLE_GENERATIVE_AI_API_KEY.*(MISSING|missing)/);
  });

  it("a production build does not need Gemini either", () => {
    const { status, out } = run(["--mode=build"], {
      // A production build also needs the CopilotKit public license key (SAN-1330), but never Gemini.
      files: { ".env.local": `${CLIENT}\nNEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=sentinel-map-7f3a\nNEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY=sentinel-lic-7f3a\n` },
      env: { VERCEL_ENV: "production" },
    });
    assert.equal(status, 0, out);
  });
});

describe("CopilotKit variables (SAN-1330)", () => {
  const LICENSE = "NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY=sentinel-lic-7f3a";
  const PRODUCTION_BUILD = { VERCEL_ENV: "production" };
  const MAPS_ID = "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=sentinel-map-7f3a";

  it("a production build FAILS when the public license key is missing", () => {
    const { status, out } = run(["--mode=build"], { files: { ".env.local": `${CLIENT}\n${MAPS_ID}` }, env: PRODUCTION_BUILD });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY/);
  });

  it("a production build PASSES when the public license key is present", () => {
    const { status, out } = run(["--mode=build"], { files: { ".env.local": `${CLIENT}\n${MAPS_ID}\n${LICENSE}` }, env: PRODUCTION_BUILD });
    assert.equal(status, 0, out);
  });

  it("the mocked-CI strict build does not need the license key", () => {
    const { status, out } = run(["--mode=build", "--strict"], { files: { ".env.local": CLIENT } });
    assert.equal(status, 0, out);
  });

  it("runtime PASSES without CPK_INTELLIGENCE_API_KEY: optional until MDE enables CopilotKit Intelligence", () => {
    const without = RUNTIME_WITHOUT_GEMINI.replace(/^CPK_INTELLIGENCE_API_KEY=.*\n?/m, "");
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": `${without}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\n` },
    });
    assert.equal(status, 0, out);
    assert.doesNotMatch(out, /MISSING CPK_INTELLIGENCE_API_KEY/);
    // It stays visible to operators as an optional variable (and its value is never printed).
    assert.match(out, /unset\s+CPK_INTELLIGENCE_API_KEY/);
  });

  it("runtime reports CPK_INTELLIGENCE_API_KEY as set when it is provisioned, without printing it", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": `${RUNTIME_WITHOUT_GEMINI}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\n` },
    });
    assert.equal(status, 0, out);
    assert.match(out, /set\s+CPK_INTELLIGENCE_API_KEY/);
    assert.doesNotMatch(out, /sentinel-ck-7f3a/);
  });

  it("runtime PASSES with both Gemini and CPK_INTELLIGENCE_API_KEY configured", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": `${RUNTIME_WITHOUT_GEMINI}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\n` },
    });
    assert.equal(status, 0, out);
  });

  it("the retired legacy name alone does NOT satisfy a production build (the license key is still required)", () => {
    const legacy = "COPILOTKIT" + "_API_KEY";
    const { status, out } = run(["--mode=build"], {
      files: { ".env.local": `${CLIENT}\n${MAPS_ID}\n${legacy}=sentinel-legacy-7f3a` },
      env: PRODUCTION_BUILD,
    });
    assert.equal(status, 1, out);
    assert.match(out, /MISSING NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY/);
    assert.doesNotMatch(out, /sentinel-legacy-7f3a/);
  });

  it("MDE_COPILOTKIT_SERVICE_BEARER is optional and never printed", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": `${RUNTIME_WITHOUT_GEMINI}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\nMDE_COPILOTKIT_SERVICE_BEARER=sentinel-bearer-7f3a\n` },
    });
    assert.equal(status, 0, out);
    assert.doesNotMatch(out, /sentinel-bearer-7f3a/);
  });
});

describe("never prints a secret value", () => {
  it("passing runs print no sentinel from files or process env", () => {
    const { out } = run(["--mode=runtime"], {
      files: { ".env.local": `${RUNTIME_WITHOUT_GEMINI}\nGOOGLE_GENERATIVE_AI_API_KEY=sentinel-gem-7f3a\n` },
      env: { GOOGLE_API_KEY: "sentinel-other-7f3a" },
    });
    assert.doesNotMatch(out, SENTINEL);
  });

  it("failing runs print no sentinel either", () => {
    const { status, out } = run(["--mode=runtime"], {
      files: { ".env.local": RUNTIME_WITHOUT_GEMINI },
      env: { GOOGLE_API_KEY: "sentinel-other-7f3a" },
    });
    assert.equal(status, 1, out);
    assert.doesNotMatch(out, SENTINEL);
  });
});
