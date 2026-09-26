import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Resolved against this file, not the working directory, so the test still finds the script
// when a runner (IDE, `node --test` from a subdirectory) uses a different cwd.
const script = fileURLToPath(new URL("../warn-remote-database-url.mjs", import.meta.url));

/**
 * The ambient environment decides the outcome of this guard, so every case runs the script
 * as a subprocess with these names removed first. Without this, a machine (or agent runtime)
 * that already exports DATABASE_URL/CI would silently change what the tests assert.
 */
const CONTROLLED = [
  "DATABASE_URL",
  "NODE_ENV",
  "CI",
  "GITHUB_ACTIONS",
  "VERCEL",
  "NETLIFY",
  "BUILDKITE",
  "CIRCLECI",
  "GITLAB_CI",
  "TF_BUILD",
  "TEAMCITY_VERSION",
  "JENKINS_URL",
];

const DIRECT_URL =
  "postgresql://postgres:s3cret@db.abcdefghijklmnop.supabase.co:5432/postgres";
const POOLER_URL =
  "postgresql://postgres.abcdefghijklmnop:s3cret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

function run(env = {}) {
  const base = { ...process.env };
  for (const name of CONTROLLED) delete base[name];
  const result = spawnSync(process.execPath, [script], {
    env: { ...base, ...env },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("warns and names the host for the Supabase direct host", () => {
  const { status, stderr } = run({ DATABASE_URL: DIRECT_URL });
  assert.equal(status, 0, "the guard must never fail the run");
  assert.match(stderr, /Supabase DIRECT host/);
  assert.match(stderr, /db\.abcdefghijklmnop\.supabase\.co:5432/);
});

test("explains why the direct host is dangerous", () => {
  const { stderr } = run({ DATABASE_URL: DIRECT_URL });
  assert.match(stderr, /IPv6-only/);
  assert.match(stderr, /ENETUNREACH/);
});

test("warns for a remote host that is not the direct Supabase shape", () => {
  const { status, stderr } = run({ DATABASE_URL: POOLER_URL });
  assert.equal(status, 0);
  assert.match(stderr, /REMOTE host/);
  assert.match(stderr, /pooler\.supabase\.com:6543/);
  assert.doesNotMatch(stderr, /Supabase DIRECT host/);
});

test("recommends local Supabase, LibSQL, and the pooler", () => {
  const { stderr } = run({ DATABASE_URL: DIRECT_URL });
  assert.match(stderr, /local Supabase/);
  assert.match(stderr, /LibSQL/);
  assert.match(stderr, /MASTRA_DEV_LIBSQL=1/);
  assert.match(stderr, /pooler\.supabase\.com:6543/);
});

test("stays silent for every local host form", () => {
  const localUrls = [
    "postgresql://postgres:s3cret@localhost:5432/postgres",
    "postgresql://postgres:s3cret@127.0.0.1:5432/postgres",
    "postgresql://postgres:s3cret@127.0.0.2:5432/postgres",
    "postgresql://postgres:s3cret@127.0.0.1:54622/postgres",
    "postgresql://postgres:s3cret@[::1]:5432/postgres",
    "postgresql://postgres:s3cret@0.0.0.0:5432/postgres",
    "postgresql://postgres:s3cret@host.docker.internal:5432/postgres",
  ];
  for (const url of localUrls) {
    const { status, stderr } = run({ DATABASE_URL: url });
    assert.equal(status, 0, url);
    assert.equal(stderr, "", `expected silence for ${url}, got: ${stderr}`);
  }
});

test("does not exempt a .local name, which split DNS can point anywhere", () => {
  const { status, stderr } = run({
    DATABASE_URL: "postgresql://postgres:s3cret@postgres.local:5432/postgres",
  });
  assert.equal(status, 0);
  assert.match(stderr, /REMOTE host/);
  assert.match(stderr, /postgres\.local:5432/);
});

test("does not treat a DNS name starting with 127. as loopback", () => {
  const { status, stderr } = run({
    DATABASE_URL: "postgresql://postgres:s3cret@127.example.com:5432/postgres",
  });
  assert.equal(status, 0);
  assert.match(stderr, /REMOTE host/);
});

test("still exempts .localhost, which is reserved to loopback", () => {
  const { status, stderr } = run({
    DATABASE_URL: "postgresql://postgres:s3cret@db.localhost:5432/postgres",
  });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("stays silent under CI so intentional remote injection is allowed", () => {
  for (const marker of ["CI", "GITHUB_ACTIONS", "VERCEL"]) {
    const { status, stderr } = run({ DATABASE_URL: DIRECT_URL, [marker]: "true" });
    assert.equal(status, 0, marker);
    assert.equal(stderr, "", `expected silence under ${marker}, got: ${stderr}`);
  }
});

test("stays silent in a deployed production runtime", () => {
  const { status, stderr } = run({ DATABASE_URL: DIRECT_URL, NODE_ENV: "production" });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("stays silent when DATABASE_URL is absent, blank, or quoted-blank", () => {
  for (const value of [undefined, "", "   ", '""']) {
    const { status, stderr } = run(value === undefined ? {} : { DATABASE_URL: value });
    assert.equal(status, 0, String(value));
    assert.equal(stderr, "", `expected silence for ${JSON.stringify(value)}`);
  }
});

test("stays silent when the value cannot be parsed as a URL", () => {
  const { status, stderr } = run({ DATABASE_URL: "not a url at all" });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("writes to stderr only, leaving stdout clean", () => {
  const { stdout } = run({ DATABASE_URL: DIRECT_URL });
  assert.equal(stdout, "");
});

test("never prints the password or the input connection string", () => {
  const { stderr } = run({ DATABASE_URL: DIRECT_URL });
  assert.ok(stderr.length > 0, "expected a warning to inspect");
  // The remedy lines show a *template* pooler URL with <ref>/<pw> placeholders, so a bare
  // "postgresql://" is expected. What must never appear is the real credential or userinfo.
  assert.doesNotMatch(stderr, /s3cret/);
  assert.doesNotMatch(stderr, /postgres:s3cret/);
  assert.ok(
    !stderr.includes(DIRECT_URL),
    "the input connection string must not be echoed verbatim",
  );
});

test("exits 0 for every case, including remote warnings", () => {
  for (const env of [
    { DATABASE_URL: DIRECT_URL },
    { DATABASE_URL: POOLER_URL },
    { DATABASE_URL: "postgresql://postgres:s3cret@localhost:5432/postgres" },
    {},
  ]) {
    assert.equal(run(env).status, 0, JSON.stringify(env));
  }
});
