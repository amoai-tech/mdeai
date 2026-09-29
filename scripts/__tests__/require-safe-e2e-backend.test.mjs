import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROD_CERTIFICATION_OVERRIDE,
  evaluateE2eBackend,
  requireSafeE2eBackend,
  resolveSupabaseTarget,
} from "../require-safe-e2e-backend.mjs";

// Resolved against this file, not the working directory, so the test still finds things when a
// runner uses a different cwd.
const script = fileURLToPath(
  new URL("../require-safe-e2e-backend.mjs", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** The real production project this guard exists to stop a local run from writing to. */
const PROD_URL = "https://zkwcbyxiwklihegjhuql.supabase.co";

/**
 * Every case supplies its own environment. Without this, an operator machine that already
 * exports SUPABASE_URL or the override would silently change what the tests assert.
 * @param {Record<string, string | undefined>} [overrides] - per-case environment.
 * @returns {Record<string, string | undefined>} a controlled environment.
 */
function env(overrides = {}) {
  return { PATH: process.env.PATH, ...overrides };
}

test("allows an absent Supabase URL, because deterministic mode needs no hosted backend", () => {
  const decision = evaluateE2eBackend(null, env());
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "absent");
});

test("allows a local Supabase URL on loopback", () => {
  for (const url of [
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://127.0.0.2:54321",
  ]) {
    const decision = evaluateE2eBackend(url, env());
    assert.equal(decision.allowed, true, url);
    assert.equal(decision.reason, "local", url);
  }
});

test("refuses a remote Supabase URL", () => {
  const decision = evaluateE2eBackend(PROD_URL, env());
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "remote");
  assert.equal(decision.hostname, "zkwcbyxiwklihegjhuql.supabase.co");
});

test("refuses an unparseable URL rather than assuming it is safe", () => {
  const decision = evaluateE2eBackend("not-a-url", env());
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "unparseable");
});

test("allows a remote URL only with the explicit override, and says so loudly", () => {
  const decision = evaluateE2eBackend(PROD_URL, env({ [PROD_CERTIFICATION_OVERRIDE]: "1" }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "remote-override");
  assert.equal(decision.override, true);
});

test("treats a negative override as off", () => {
  for (const off of ["0", "false", "no", "off", ""]) {
    const decision = evaluateE2eBackend(PROD_URL, env({ [PROD_CERTIFICATION_OVERRIDE]: off }));
    assert.equal(decision.allowed, false, `override=${off}`);
  }
});

test("resolves SUPABASE_URL before NEXT_PUBLIC_SUPABASE_URL, matching server-env.ts", () => {
  const target = resolveSupabaseTarget(
    env({
      SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    }),
  );
  assert.equal(target?.name, "SUPABASE_URL");
  assert.equal(target?.value, "http://127.0.0.1:54321");
});

test("a remote SUPABASE_URL cannot hide behind a local NEXT_PUBLIC_SUPABASE_URL", () => {
  // The whole point of the precedence test: guarding only the public variable would let this
  // configuration write to production while looking locally configured.
  const decision = requireSafeE2eBackend({
    env: env({
      SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    }),
    write: () => {},
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "remote");
});

test("treats a blank value as absent rather than as a target", () => {
  const target = resolveSupabaseTarget(
    env({ SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
  );
  assert.equal(target?.name, "NEXT_PUBLIC_SUPABASE_URL");
});

test("never writes the key or the full URL into the refusal", () => {
  const key = "sb-secret-value-that-must-not-be-printed";
  let written = "";
  const decision = requireSafeE2eBackend({
    env: env({
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    }),
    write: (text) => {
      written += text;
    },
  });
  assert.equal(decision.allowed, false);
  assert.ok(written.includes("zkwcbyxiwklihegjhuql.supabase.co"), "host is useful");
  assert.equal(written.includes(key), false, "key must never be printed");
  assert.equal(written.includes(PROD_URL), false, "full URL must never be printed");
});

test("names the variable that actually decided the refusal", () => {
  let written = "";
  requireSafeE2eBackend({
    env: env({ SUPABASE_URL: PROD_URL }),
    write: (text) => {
      written += text;
    },
  });
  assert.ok(written.includes("SUPABASE_URL"));
  assert.ok(written.includes("ALLOW_PROD_CERTIFICATION=1"));
});

test("CLI exits 1 on a remote backend and 0 on a local one", () => {
  const remote = spawnSync(process.execPath, [script, "--no-env-files"], {
    cwd: repoRoot,
    env: env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
    encoding: "utf8",
  });
  assert.equal(remote.status, 1, remote.stderr);
  assert.ok(remote.stderr.includes("Refusing to start"));

  const local = spawnSync(process.execPath, [script, "--no-env-files"], {
    cwd: repoRoot,
    env: env({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    encoding: "utf8",
  });
  assert.equal(local.status, 0, local.stderr);
  assert.equal(local.stderr.trim(), "");
});

test("CLI exits 0 when the override permits a remote backend", () => {
  const run = spawnSync(process.execPath, [script, "--no-env-files"], {
    cwd: repoRoot,
    env: env({
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      [PROD_CERTIFICATION_OVERRIDE]: "1",
    }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stderr.includes("ALLOW_PROD_CERTIFICATION is set"));
});

test("refuses a hostless or non-HTTP value that would otherwise read as local", () => {
  // Regression: `isLocalHostname` treats an empty host as local because a Postgres connection
  // string may name a unix socket. Reusing it unguarded let `file:///tmp/evil` — which has no
  // host — be allowed. A Supabase URL is always HTTP(S) over a real host.
  for (const url of ["file:///tmp/evil", "file://", "ftp://example.com", "data:text/plain,x"]) {
    const decision = evaluateE2eBackend(url, env());
    assert.equal(decision.allowed, false, url);
    assert.equal(decision.reason, "unparseable", url);
  }
});

test("refuses a hostless value even with the override set", () => {
  const decision = evaluateE2eBackend("file:///tmp/evil", env({ [PROD_CERTIFICATION_OVERRIDE]: "1" }));
  assert.equal(decision.allowed, false);
});

test("still allows genuine loopback hosts, including IPv6 and mixed case", () => {
  for (const url of ["HTTP://LOCALHOST:54321", "http://[::1]:54321", "http://127.1.2.3:54321"]) {
    assert.equal(evaluateE2eBackend(url, env()).allowed, true, url);
  }
});

test("does not treat a loopback-looking remote name as local", () => {
  for (const url of ["https://localhost.evil.com", "https://127.0.0.1.evil.com"]) {
    const decision = evaluateE2eBackend(url, env());
    assert.equal(decision.allowed, false, url);
    assert.equal(decision.reason, "remote", url);
  }
});

test("CLI names the real environment variable, not an internal option name", () => {
  // Regression: the CLI resolves the value before calling the guard, so an earlier revision
  // printed the internal option name ("supabaseUrl") instead of the variable an operator can
  // actually act on. The message must name the variable that decided the refusal.
  const run = spawnSync(process.execPath, [script, "--no-env-files"], {
    cwd: repoRoot,
    env: env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
    encoding: "utf8",
  });
  assert.equal(run.status, 1, run.stderr);
  assert.ok(
    run.stderr.includes("NEXT_PUBLIC_SUPABASE_URL points at"),
    `expected the public variable name, got: ${run.stderr}`,
  );
  assert.equal(run.stderr.includes("supabaseUrl points at"), false);

  const viaPrivate = spawnSync(process.execPath, [script, "--no-env-files"], {
    cwd: repoRoot,
    env: env({ SUPABASE_URL: PROD_URL }),
    encoding: "utf8",
  });
  assert.ok(viaPrivate.stderr.includes("SUPABASE_URL points at"), viaPrivate.stderr);
});

test("the unsafe local command runs the guard first", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const focused = pkg.scripts["test:e2e:p0-focused"];
  assert.ok(focused, "test:e2e:p0-focused must exist");
  assert.ok(
    focused.startsWith("node scripts/require-safe-e2e-backend.mjs &&"),
    `guard must run before any browser work, got: ${focused}`,
  );
  // A guard that can be skipped by reordering the chain is not a guard.
  assert.ok(focused.indexOf("require-safe-e2e-backend") < focused.indexOf("test:e2e:copilot-budget"));
});

test("no committed env file opts into production certification", () => {
  for (const file of [".env.example", ".env.local.example"]) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) continue;
    assert.equal(
      fs.readFileSync(full, "utf8").includes(PROD_CERTIFICATION_OVERRIDE),
      false,
      `${file} must not carry the override`,
    );
  }
});
