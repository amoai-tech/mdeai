import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { warnIfRemoteDatabaseUrl } from "../warn-remote-database-url.mjs";

// Resolved against this file, not the working directory, so the test still finds the script
// when a runner (IDE, `node --test` from a subdirectory) uses a different cwd.
const script = fileURLToPath(new URL("../warn-remote-database-url.mjs", import.meta.url));
const vitestEntry = fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url));
const vitestConfig = fileURLToPath(new URL("../../vitest.config.ts", import.meta.url));

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
  "MDE_DATABASE_URL_GUARD_RUNNING",
];

const DIRECT_URL =
  "postgresql://postgres:s3cret@db.abcdefghijklmnop.supabase.co:5432/postgres";
/** The same direct host written as a fully qualified name, with a root dot. */
const DIRECT_URL_ROOT_DOT =
  "postgresql://postgres:s3cret@db.abcdefghijklmnop.supabase.co.:5432/postgres";
const POOLER_URL =
  "postgresql://postgres.abcdefghijklmnop:s3cret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

const fixtureDirs = [];

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Fixture filenames this helper will write, so a typo cannot silently create nothing. */
const FIXTURE_NAMES = [".env.local", ".env"];

/**
 * A scratch directory to run the CLI in. Every subprocess gets one of these rather than the
 * repo root, so a real `.env.local` in the checkout can never leak into an assertion.
 *
 * The files are written through literal basenames after a temporary `chdir`, rather than
 * `fs.writeFileSync(path.join(dir, name), …)`. A computed path argument trips a
 * non-literal-filename rule aimed at untrusted input, which cannot apply to a test-owned temp
 * directory, so the literal form states plainly which files are ever created. `node --test` runs
 * the top-level tests in one file sequentially, so the brief cwd change cannot race a sibling.
 * @param {Record<string, string>} [files] - dotenv files to create inside it.
 * @returns {string} the directory path.
 */
function scratchDir(files = {}) {
  for (const name of Object.keys(files)) {
    if (!FIXTURE_NAMES.includes(name)) {
      throw new Error(`scratchDir: unsupported fixture file ${name}`);
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mde-db-url-guard-"));
  fixtureDirs.push(dir);
  const previous = process.cwd();
  try {
    process.chdir(dir);
    if (files[".env.local"] !== undefined) fs.writeFileSync(".env.local", files[".env.local"]);
    if (files[".env"] !== undefined) fs.writeFileSync(".env", files[".env"]);
  } finally {
    process.chdir(previous);
  }
  return dir;
}

function run(env = {}, options = {}) {
  const base = { ...process.env };
  for (const name of CONTROLLED) delete base[name];
  const result = spawnSync(process.execPath, [script, ...(options.args ?? [])], {
    env: { ...base, ...env },
    cwd: options.cwd ?? scratchDir(),
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Call the imported function and capture whatever it wrote. */
function capture(env = {}, options = {}) {
  let out = "";
  const message = warnIfRemoteDatabaseUrl({
    ...options,
    env,
    write: (text) => {
      out += text;
    },
  });
  return { message, out };
}

// ── Ambient environment ──────────────────────────────────────────────────────────────────

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

test("a fully qualified direct host with a root dot still gets the specific warning", () => {
  const { status, stderr } = run({ DATABASE_URL: DIRECT_URL_ROOT_DOT });
  assert.equal(status, 0);
  assert.match(stderr, /Supabase DIRECT host/, "a trailing root dot must not downgrade the message");
  // The root dot is normalized away before the host is printed.
  assert.match(stderr, /db\.abcdefghijklmnop\.supabase\.co:5432/);
  assert.doesNotMatch(stderr, /\.co\.:/);
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

// ── Dotenv files (the `next dev` path) ───────────────────────────────────────────────────

test("CLI reads DATABASE_URL from .env.local, which predev runs before Next loads", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.match(stderr, /Supabase DIRECT host/);
  assert.match(stderr, /Found in \.env\.local/);
});

test("prefers .env.local over .env, matching Next precedence", () => {
  const cwd = scratchDir({
    ".env.local": `DATABASE_URL=${DIRECT_URL}\n`,
    ".env": `DATABASE_URL=${POOLER_URL}\n`,
  });
  const { stderr } = run({}, { cwd });
  assert.match(stderr, /Found in \.env\.local/);
  assert.match(stderr, /db\.abcdefghijklmnop\.supabase\.co/, "the .env.local value must win");
});

test("the ambient environment wins over every dotenv file", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run(
    { DATABASE_URL: "postgresql://postgres:s3cret@localhost:5432/postgres" },
    { cwd },
  );
  assert.equal(status, 0);
  assert.equal(stderr, "", "a local ambient value must not be overridden by a file");
});

test("a set-but-blank ambient value suppresses the file fallback", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run({ DATABASE_URL: "" }, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "", "Next never overrides a set variable, so the file value is unused");
});

test("parses quoted values and skips comments in a dotenv file", () => {
  const cwd = scratchDir({
    ".env.local": `# leading comment\nDATABASE_URL="${DIRECT_URL}"\n`,
  });
  const { stderr } = run({}, { cwd });
  assert.match(stderr, /Supabase DIRECT host/);
});

test("uses Next dotenv parsing for backtick-quoted DATABASE_URL values", () => {
  const cwd = scratchDir({
    ".env.local": `DATABASE_URL=\`${DIRECT_URL}\`\n`,
  });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.match(stderr, /Supabase DIRECT host/, "Next accepts backtick-quoted dotenv values");
});

test("a commented-out assignment in a dotenv file is ignored", () => {
  const cwd = scratchDir({ ".env.local": `# DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("a repeated key resolves to the last assignment, as dotenv does", () => {
  const cwd = scratchDir({
    ".env.local":
      "DATABASE_URL=postgresql://postgres:s3cret@localhost:5432/postgres\n" +
      `DATABASE_URL=${DIRECT_URL}\n`,
  });
  const { stderr } = run({}, { cwd });
  assert.match(stderr, /Supabase DIRECT host/, "the later assignment must win");
});

test("a blank assignment in a dotenv file counts as set and stops the search", () => {
  const cwd = scratchDir({
    ".env.local": "DATABASE_URL=\n",
    ".env": `DATABASE_URL=${DIRECT_URL}\n`,
  });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "", "the higher-precedence blank must not fall through to .env");
});

test("expands a ${VAR} reference defined in the same dotenv file", () => {
  const cwd = scratchDir({
    ".env.local": `REMOTE_DB=${DIRECT_URL}\nDATABASE_URL=\${REMOTE_DB}\n`,
  });
  const { stderr } = run({}, { cwd });
  assert.match(stderr, /Supabase DIRECT host/, "the reference must expand, not read as unparseable");
});

test("recursively expands nested dotenv references exactly like Next", () => {
  const cwd = scratchDir({
    ".env.local":
      `REMOTE_DB=${DIRECT_URL}\n` +
      "LEVEL_TWO=${REMOTE_DB}\n" +
      "LEVEL_ONE=${LEVEL_TWO}\n" +
      "DATABASE_URL=${LEVEL_ONE}\n",
  });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.match(stderr, /Supabase DIRECT host/);
  assert.doesNotMatch(stderr, /could not resolve/, "Next recursively resolves the chain");
});

test("expands a $VAR reference to an ambient environment value", () => {
  const cwd = scratchDir({ ".env.local": "DATABASE_URL=$SOME_REMOTE_DB\n" });
  const { status, stderr } = run({ SOME_REMOTE_DB: DIRECT_URL }, { cwd });
  assert.equal(status, 0);
  assert.match(stderr, /Supabase DIRECT host/);
});

test("a reference resolving to a local host stays silent", () => {
  const cwd = scratchDir({
    ".env.local":
      "LOCAL_DB=postgresql://postgres:s3cret@127.0.0.1:5432/postgres\n" +
      "DATABASE_URL=${LOCAL_DB}\n",
  });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("undefined dotenv references follow Next semantics without leaking variable names", () => {
  const cwd = scratchDir({ ".env.local": "DATABASE_URL=${NOT_DEFINED_ANYWHERE}\n" });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0, "the guard must never fail the run");
  assert.equal(stderr, "", "@next/env resolves an undefined reference to an empty value");
});

test("--no-env-files restricts the CLI to the ambient environment", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run({}, { cwd, args: ["--no-env-files"] });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("the CLI stays silent for a local value found in a dotenv file", () => {
  const cwd = scratchDir({
    ".env.local": "DATABASE_URL=postgresql://postgres:s3cret@127.0.0.1:5432/postgres\n",
  });
  const { status, stderr } = run({}, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});

test("the suppress marker silences a child script a parent already guarded", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { status, stderr } = run({ MDE_DATABASE_URL_GUARD_RUNNING: "1" }, { cwd });
  assert.equal(status, 0);
  assert.equal(stderr, "");
});


test("direct Vitest/IDE starts inspect .env.local exactly once without mutating test env", () => {
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const previous = process.cwd();
  try {
    process.chdir(cwd);
    fs.mkdirSync("src", { recursive: true });
    fs.writeFileSync(
      "src/direct-vitest.test.ts",
      'test("guard leaves Vitest env untouched", () => expect(process.env.DATABASE_URL).toBeUndefined());\n',
    );
  } finally {
    process.chdir(previous);
  }

  const env = { ...process.env };
  for (const name of CONTROLLED) delete env[name];
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "src/direct-vitest.test.ts", "--config", vitestConfig],
    { cwd, env, encoding: "utf8" },
  );
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.equal((output.match(/Supabase DIRECT host/g) ?? []).length, 1, output);
  assert.match(output, /1 passed/);
});

test("Vitest runs the direct-start guard in globalSetup, not during config evaluation", () => {
  const configSource = fs.readFileSync(new URL("../../vitest.config.ts", import.meta.url), "utf8");
  const setupSource = fs.readFileSync(
    new URL("../../vitest.global-setup.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(configSource, /node:child_process|spawnSync\s*\(/);
  assert.match(configSource, /globalSetup:/);
  assert.match(configSource, /vitest\.global-setup\.ts/);
  assert.doesNotMatch(setupSource, /spawnSync\s*\(/, "global setup must not block on spawnSync");
});

test("every supported Vitest npm entry point runs the file-aware guard exactly once", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  const vitestScripts = [
    "test",
    "test:watch",
    "test:coverage",
    "test:mastra",
    "test:lib",
    "test:hooks",
    "test:api",
  ];
  for (const name of vitestScripts) {
    assert.equal(
      packageJson.scripts[`pre${name}`],
      "node scripts/warn-remote-database-url.mjs",
      `${name} must inspect Next-style dotenv files before Vitest starts`,
    );
    assert.match(
      packageJson.scripts[name],
      /^MDE_DATABASE_URL_GUARD_RUNNING=1 vitest(?:\s|$)/,
      `${name} must suppress the ambient-only Vitest fallback after the pre-hook runs`,
    );
  }
});

// ── Imported call (the Vitest path) ──────────────────────────────────────────────────────

test("the imported call reads no dotenv files by default", () => {
  // Vitest does not load `.env.local` into process.env, so reading it here would warn about a
  // value the test run never uses. This assertion is what keeps that a deliberate choice.
  const cwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const { message, out } = capture({}, { cwd });
  assert.equal(message, null);
  assert.equal(out, "");
});

test("the imported call still reports an ambient remote value", () => {
  const { message } = capture({ DATABASE_URL: DIRECT_URL }, { cwd: scratchDir() });
  assert.ok(message);
});

test("direct CLI stays non-blocking when Next dotenv expansion fails", () => {
  const validCwd = scratchDir({ ".env.local": `DATABASE_URL=${DIRECT_URL}\n` });
  const valid = run({}, { cwd: validCwd });
  assert.equal(valid.status, 0);
  assert.match(valid.stderr, /Supabase DIRECT host/);

  const brokenCwd = scratchDir({ ".env.local": "DATABASE_URL=$DATABASE_URL\n" });
  const broken = run({}, { cwd: brokenCwd });
  assert.equal(broken.status, 0, "dotenv expansion failures must never block the CLI guard");
  assert.equal(broken.stderr, "", "@next/env loader errors stay quiet when no URL resolves");
});
