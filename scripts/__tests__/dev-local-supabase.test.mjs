import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = join(repoRoot, "scripts/dev-local-supabase.sh");
const mockBin = mkdtempSync(join(tmpdir(), "mde-local-supabase-"));

after(() => rmSync(mockBin, { recursive: true, force: true }));

writeFileSync(
  join(mockBin, "npx"),
  "#!/bin/bash\n[[ \"$1\" == supabase && \"$2\" == status && \"$3\" == -o && \"$4\" == env ]] || exit 2\nprintf '%s\\n' \"$MOCK_SUPABASE_OUTPUT\"\n",
  { mode: 0o755 },
);
writeFileSync(
  join(mockBin, "npm"),
  "#!/bin/bash\n[[ \"$1\" == run && \"$2\" == dev:ui:worktree ]] || exit 3\n[[ \"$MASTRA_DEV_LIBSQL\" == 0 && \"$NEXT_PUBLIC_SUPABASE_URL\" == http://127.0.0.1:54621 && \"$SUPABASE_SERVICE_ROLE_KEY\" == qa-private ]] || exit 4\necho MOCK_LOCAL_UI_STARTED\n",
  { mode: 0o755 },
);

const localCli = [
  'API_URL="http://127.0.0.1:54621"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54622/postgres"',
  'ANON_KEY="qa-public"',
  'SERVICE_ROLE_KEY="qa-private"',
].join("\n");

function invoke(statusOutput, overrides = {}) {
  return spawnSync("bash", [script], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 8000,
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH}`,
      MOCK_SUPABASE_OUTPUT: statusOutput,
      NODE_ENV: "development",
      VERCEL_ENV: "",
      ...overrides,
    },
  });
}

test("local Supabase starter has valid Bash syntax", () => {
  const result = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("starts existing Next.js UI with local Postgres and no printed credentials", () => {
  const result = invoke(localCli);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MOCK_LOCAL_UI_STARTED/);
  assert.doesNotMatch(result.stdout + result.stderr, /qa-private|qa-public/);
});

test("refuses a hosted Supabase API even when local DB is configured", () => {
  const result = invoke(localCli.replace("http://127.0.0.1:54621", "https://example.supabase.co"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing a non-local/);
});

test("refuses a hosted PostgreSQL pooler even when local API is configured", () => {
  const result = invoke(localCli.replace("127.0.0.1:54622", "example.pooler.supabase.com:6543"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing a non-local/);
});

test("refuses missing service credentials", () => {
  const result = invoke(localCli.replace('SERVICE_ROLE_KEY="qa-private"', ""));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /credentials missing/);
});

test("refuses production runtime", () => {
  const result = invoke(localCli, { VERCEL_ENV: "production" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refuse to start in a production/);
});
