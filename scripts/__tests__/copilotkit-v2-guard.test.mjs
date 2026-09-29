import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";

/**
 * SAN-1300 · Stop Old or Broken CopilotKit Code From Reaching Main
 *
 * Hermetic negative-proof harness for the CopilotKit no-new-v1 guard.
 *
 * `scripts/audit-copilotkit-v2-no-new-v1.mjs` derives its scan root from its own
 * location (`new URL("..", import.meta.url)`), so each case copies the real guard
 * and the allowlist into a throwaway root and runs them there. The repository
 * worktree is never mutated, which is why this runs inside `check:release-gates`
 * instead of inside `floor` (where `audit:copilotkit-v2:depcruise:proof` still
 * writes a temporary fixture into `src/__fixtures__/`).
 */

const GUARD_REL = "scripts/audit-copilotkit-v2-no-new-v1.mjs";
const ALLOWLIST_REL = "scripts/copilotkit-v2-allowlist.json";

const GUARD_SRC = path.resolve(GUARD_REL);
const ALLOWLIST_SRC = path.resolve(ALLOWLIST_REL);

/** Each forbidden token in isolation, so a removed regex fails exactly one case. */
const FORBIDDEN_CASES = [
  ["useCoAgent", "export function Bad() { return useCoAgent; }\n"],
  ["useCopilotAction", "export function Bad() { return useCopilotAction; }\n"],
  ["renderAndWaitForResponse", "export const bad = renderAndWaitForResponse;\n"],
  ["@copilotkit/react-ui", 'import "@copilotkit/react-ui";\n'],
  ["@copilotkit/react-core", 'import x from "@copilotkit/react-core";\n'],
];

const CLEAN_SOURCE =
  'import { useCopilotChat } from "@copilotkit/react-core/v2";\n' +
  'import { CopilotKitProvider } from "@copilotkit/react-core/v2";\n' +
  "export function Ok() { return [useCopilotChat, CopilotKitProvider]; }\n";

const fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true });
  fixtureRoots.length = 0;
});

/**
 * Build a temp root containing a copy of the real guard + allowlist, then write
 * the given repo-relative files into it.
 */
function fixture(files = {}, allowlistFiles = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mde-ck-v2-guard-"));
  fixtureRoots.push(root);

  for (const rel of [GUARD_REL, ALLOWLIST_REL]) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  }
  fs.copyFileSync(GUARD_SRC, path.join(root, GUARD_REL));
  fs.writeFileSync(
    path.join(root, ALLOWLIST_REL),
    `${JSON.stringify({ description: "test fixture", mainSha: "test", files: allowlistFiles }, null, 2)}\n`,
  );

  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  return root;
}

function runGuard(root, cwd = root) {
  return spawnSync(process.execPath, [path.join(root, GUARD_REL)], {
    cwd,
    encoding: "utf8",
  });
}

test("the real guard exists and is wired as the audit:copilotkit-v2 command", () => {
  assert.ok(fs.existsSync(GUARD_SRC), `${GUARD_REL} must exist`);
  assert.ok(fs.existsSync(ALLOWLIST_SRC), `${ALLOWLIST_REL} must exist`);

  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  // The umbrella command must resolve to a real script, not the deleted
  // audit-copilotkit-v2-map.mjs dashboard.
  assert.equal(pkg.scripts["audit:copilotkit-v2"], "npm run audit:copilotkit-v2:depcruise");
  assert.ok(
    /node scripts\/audit-copilotkit-v2-no-new-v1\.mjs/.test(pkg.scripts["audit:copilotkit-v2:depcruise"]),
    "audit:copilotkit-v2:depcruise must invoke the no-new-v1 guard",
  );
  // Floor is the only required status check, so the guard must be in it.
  assert.match(pkg.scripts.floor, /npm run audit:copilotkit-v2(?!:)/);
});

for (const [token, source] of FORBIDDEN_CASES) {
  test(`rejects synthetic v1 code using ${token} outside the allowlist`, () => {
    const root = fixture({ "src/__fixtures__/synthetic-violation.tsx": source });
    const result = runGuard(root);

    assert.notEqual(result.status, 0, `${token} must be rejected`);
    assert.match(
      `${result.stdout}${result.stderr}`,
      /src\/__fixtures__\/synthetic-violation\.tsx/,
      "the violation must name the offending file",
    );
  });
}

test("accepts clean v2 source", () => {
  const root = fixture({ "src/components/good.tsx": CLEAN_SOURCE });
  const result = runGuard(root);

  assert.equal(result.status, 0, `clean v2 source must pass:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /no-new-v1: OK/);
});

test("honours the allowlist for an explicitly exempted file", () => {
  const rel = "src/legacy/legacy-chat.tsx";
  const root = fixture({ [rel]: "export const a = useCoAgent;\n" }, [rel]);
  const result = runGuard(root);

  assert.equal(result.status, 0, `allowlisted file must pass:\n${result.stdout}${result.stderr}`);
});

// ---------- the allowlist is a ledger, not a permanent exemption ----------
// Before SAN-1357 Step 7 nothing checked the other direction: an entry whose v1 usage had already
// been migrated away stayed forever, and an allowlisted path silently pre-approves whatever is
// written there next. All 29 shipped entries were in exactly that state.

test("fails when an allowlisted file no longer contains a v1 pattern", () => {
  const rel = "src/legacy/already-migrated.tsx";
  const root = fixture({ [rel]: CLEAN_SOURCE }, [rel]);
  const result = runGuard(root);

  assert.notEqual(result.status, 0, "a stale exemption must fail the guard");
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /no longer earn their exemption/i, "the failure must name the problem");
  assert.match(output, /already-migrated\.tsx/, "the failure must name the stale entry");
  assert.match(output, /--write-allowlist/, "the failure must give the regeneration command");
});

test("fails when an allowlisted file no longer exists", () => {
  const root = fixture({}, ["src/legacy/deleted-long-ago.tsx"]);
  const result = runGuard(root);

  assert.notEqual(result.status, 0, "an entry pointing at a deleted file must fail the guard");
  assert.match(
    `${result.stdout}${result.stderr}`,
    /deleted-long-ago\.tsx: the file no longer exists/,
    "the failure must distinguish a missing file from a migrated one",
  );
});

test("does not treat v1 prose in a comment as a v1 usage", () => {
  // `src/app/chat/page.tsx` ships exactly this shape: a doc comment naming the retired package,
  // which used to be the sole reason it stayed on the allowlist.
  const root = fixture({
    "src/components/commented.tsx":
      "/** v2-only after SAN-891 — Retire @copilotkit/react-ui. */\n" +
      'import { CopilotKitProvider } from "@copilotkit/react-core/v2";\n' +
      "export const x = CopilotKitProvider;\n",
  });
  const result = runGuard(root);

  assert.equal(
    result.status,
    0,
    `comment prose must not create or sustain a violation:\n${result.stdout}${result.stderr}`,
  );
});

test("the shipped allowlist has no stale entries and permits nothing", () => {
  const data = JSON.parse(fs.readFileSync(ALLOWLIST_SRC, "utf8"));
  assert.ok(Array.isArray(data.files), "the allowlist must expose a files array");
  assert.equal(
    data.files.length,
    0,
    "every v1 usage is migrated, so the ledger must be empty; a non-empty ledger means the guard " +
      "is pre-approving that path rather than protecting it",
  );
});

test("honours the *-v1.tsx and __tests__ path exemptions", () => {
  const root = fixture({
    "src/legacy/rollback-v1.tsx": "export const a = useCoAgent;\n",
    "src/components/__tests__/whatever.ts": "export const b = useCoAgent;\n",
  });
  const result = runGuard(root);

  assert.equal(result.status, 0, `exempt paths must pass:\n${result.stdout}${result.stderr}`);
});

test("does not flag a bare @copilotkit/react-core/v2 import", () => {
  const root = fixture({
    "src/components/v2-only.tsx": 'import { useCopilotChat } from "@copilotkit/react-core/v2";\n',
  });
  const result = runGuard(root);

  assert.equal(result.status, 0, `/v2 is the approved boundary:\n${result.stdout}${result.stderr}`);
});

test("passes against the real repository source (read-only positive control)", () => {
  const result = runGuard(path.resolve("."), path.resolve("."));

  assert.equal(
    result.status,
    0,
    `current repository source must satisfy the guard:\n${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /no-new-v1: OK/);
});
