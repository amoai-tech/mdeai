import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const wrapper = join(root, "scripts", "graphify-run.sh");
// The two skill-version warning lines Graphify prints on stderr (copied from real runs).
const WARN_OLD = "  warning: skill is from graphify 0.9.105, but the package is 0.9.101 (older). Upgrade the package (e.g. 'uv tool upgrade graphifyy' or 'pip install -U graphifyy'); running 'graphify install' would downgrade the skill.";
const WARN_NEW = "  warning: skill at /tmp/devin/skills/graphify is from graphify 0.9.105, package is 0.9.106. Run 'graphify install --platform devin' to update it (a plain 'graphify install' refreshes only the detected platform).";

function sandbox(t) {
  const temp = mkdtempSync(join(tmpdir(), "mde-graphify-wrapper-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  return temp;
}

function fakeGraphify(path, version = "graphify 0.9.106") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh
if [ "${"\$"}1" = "--version" ]; then
  printf '%s\\n' '${version}'
  exit 0
fi
printf 'AUTO=%s\\n' "${"\$"}GRAPHIFY_NO_AUTO_REFRESH"
printf 'PWD=%s\\n' "${"\$"}PWD"
printf 'ARGC=%s\\n' "${"\$"}#"
for arg in "${"\$"}@"; do printf 'ARG=%s\\n' "${"\$"}arg"; done
`, { mode: 0o755 });
}

function run(args, env, cwd) {
  return spawnSync("bash", [wrapper, ...args], {
    cwd, env: { ...process.env, ...env }, encoding: "utf8",
  });
}

test("preserves separate arguments, exact checkout root and default auto-refresh setting", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  fakeGraphify(exe);
  const env = { GRAPHIFY_BIN: exe };
  delete env.GRAPHIFY_NO_AUTO_REFRESH;
  const result = run(["explain", "conciergeAgent"], env, temp);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "AUTO=1", `PWD=${root}`, "ARGC=2", "ARG=explain", "ARG=conciergeAgent",
  ]);
});

test("honors the exact explicit no-auto-refresh override", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  fakeGraphify(exe);
  const result = run(["query", "conciergeAgent"], {
    GRAPHIFY_BIN: exe, GRAPHIFY_NO_AUTO_REFRESH: "0",
  }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "AUTO=0", `PWD=${root}`, "ARGC=2", "ARG=query", "ARG=conciergeAgent",
  ]);
});

test("resolves a caller-relative GRAPHIFY_BIN before changing directories", (t) => {
  const temp = sandbox(t);
  fakeGraphify(join(temp, "bin", "graphify"));
  const result = run(["explain", "conciergeAgent"], {
    GRAPHIFY_BIN: "bin/graphify", GRAPHIFY_NO_AUTO_REFRESH: "1",
  }, temp);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "AUTO=1", `PWD=${root}`, "ARGC=2", "ARG=explain", "ARG=conciergeAgent",
  ]);
});

test("does not execute a conflicting Graphify found earlier on PATH", (t) => {
  const temp = sandbox(t);
  const uv = join(temp, ".local/share/uv/tools/graphifyy/bin/graphify");
  fakeGraphify(uv);
  const bad = join(temp, "malicious", "graphify");
  fakeGraphify(bad, "graphify 0.9.11");
  const result = run(["query", "conciergeAgent"], {
    HOME: temp, UV_TOOL_DIR: join(temp, ".local/share/uv/tools"),
    GRAPHIFY_BIN: "", PATH: join(temp, "malicious") + ":" + process.env.PATH,
  }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^AUTO=1\n/);
  assert.match(result.stdout, /ARG=query\n/);
});

test("finds the uv shim even when ~/.local/bin is not on PATH", (t) => {
  const temp = sandbox(t);
  fakeGraphify(join(temp, ".local/bin/graphify"));
  const result = run(["explain", "conciergeAgent"], {
    HOME: temp, GRAPHIFY_BIN: "", UV_TOOL_DIR: join(temp, "absent"),
    PATH: "/usr/bin:/bin",
  }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^AUTO=1\n/);
});

test("rejects a binary with an incompatible version", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  fakeGraphify(exe, "graphify 0.9.11");
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: exe }, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Incompatible Graphify/);
  assert.match(result.stderr, /graphifyy\[sql\]==0\.9\.106/);
});

test("ignores skill-version warnings that Graphify prints on stderr", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  fakeGraphify(exe);
  const real = readFileSync(exe, "utf8");
  const patched = real.replace(
    "if [ \"$1\" = \"--version\" ]; then",
    `if [ "$1" = "--version" ]; then\n  cat >&2 <<'EOF'\n${WARN_OLD}\n${WARN_NEW}\nEOF`,
  );
  // String.replace is a no-op when the search text is missing; fail loudly instead of testing nothing.
  assert.match(patched, /downgrade the skill\.\n/);
  writeFileSync(exe, patched, { mode: 0o755 });
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: exe }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ARG=query\nARG=conciergeAgent\n/);
});

test("keeps real version-probe errors but drops skill-version warnings", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  writeFileSync(exe, `#!/bin/sh
cat >&2 <<'EOF'
${WARN_OLD}
${WARN_NEW}
boom: cannot load config
boom: text containing skill is from graphify must remain visible
warning: skill is from graphify 0.9.105, cannot load config
  warning: skill at /tmp/x/skills/graphify is from graphify 0.9.105, package is 0.9.106. Run 'graphify install --platform x' to update it (a plain 'graphify install' refreshes only the detected platform). Extra: bad plugin
EOF
exit 1
`, { mode: 0o755 });
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: exe }, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Incompatible Graphify/);
  assert.match(result.stderr, /boom: cannot load config/);
  assert.match(result.stderr, /boom: text containing skill is from graphify must remain visible/);
  // A warning prefix followed by other diagnostic text on the same line is NOT a known warning.
  assert.match(result.stderr, /warning: skill is from graphify 0\.9\.105, cannot load config/);
  assert.match(result.stderr, /Extra: bad plugin/);
  // The two complete known warning lines are dropped.
  assert.doesNotMatch(result.stderr, /but the package is 0\.9\.101 \(older\)/);
  assert.doesNotMatch(result.stderr, /warning: skill at \/tmp\/devin/);
});

test("checks the SQL extra before rebuilding a graph", (t) => {
  const temp = sandbox(t);
  const bin = join(temp, "bin", "graphify");
  fakeGraphify(bin);
  const python = join(temp, "bin", "python");
  writeFileSync(python, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const result = run(["update", ".", "--no-cluster"], { GRAPHIFY_BIN: bin }, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Graphify SQL parser missing/);
});

test("provides an actionable repair command for a unique missing executable", (t) => {
  const temp = sandbox(t);
  const missing = join(temp, "does-not-exist");
  assert.equal(existsSync(missing), false);
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: missing }, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Graphify executable not found/);
  assert.match(result.stderr, /graphifyy\[sql\]==0\.9\.106/);
});

test("the active agent guidance routes Graphify through the safe wrapper", () => {
  const guide = readFileSync(join(root, "docs/07-operations/graphify-reference.md"), "utf8");
  const graphConfig = readFileSync(join(root, ".graphifyrc"), "utf8");
  assert.match(graphConfig, /^query_budget=4000$/m);
  const tasks = readFileSync(join(root, ".claude/skills/tasks/SKILL.md"), "utf8");
  const routing = readFileSync(join(root, ".claude/skills/tasks/references/domain-routing.md"), "utf8");
  assert.match(guide, /bash scripts\/graphify-run\.sh affected "conciergeAgent"/);
  assert.match(guide, /GRAPHIFY_NO_AUTO_REFRESH=1 graphify --version/);
  assert.doesNotMatch(guide, /^graphify (?:query|explain|path|affected) /m);
  assert.match(guide, /Graph Stats \(verified example, not a shared current index\)\]\(#graph-stats-verified-example-not-a-shared-current-index\)/);
  assert.match(guide, /GRAPH_REPORT\.md.*historical/);
  assert.match(guide, /Upstream source receipt \(v0\.9\.106\)/);
  assert.match(tasks, /npm run graphify:query --/);
  assert.doesNotMatch(tasks, /PATH="\$HOME\/\.local\/bin:\$PATH" graphify query/);
  assert.match(routing, /active PR\/feature checkout/);
});

// Optional integration check: run with MDE_GRAPHIFY_REAL_SMOKE=1 after building
// graphify-out/ with the pinned CLI. Regular CI runs only deterministic fixtures.
// Graphify only prints a budget warning when results are truncated, so inspect
// its opt-in query log instead. The log is isolated and removed after this test.
test("real Graphify query reads the default budget and CLI override", {
  skip: process.env.MDE_GRAPHIFY_REAL_SMOKE !== "1",
}, (t) => {
  assert.ok(existsSync(join(root, "graphify-out", "graph.json")), "Run npm run graphify:update first");
  const temp = sandbox(t);
  const logPath = join(temp, "graphify-query-log.jsonl");
  const env = {
    GRAPHIFY_QUERY_LOG: logPath,
    GRAPHIFY_QUERY_LOG_DISABLE: "0",
    GRAPHIFY_QUERY_LOG_RESPONSES: "0",
  };
  const defaultQuery = run(["query", "rental map pins"], env, root);
  assert.equal(defaultQuery.status, 0, defaultQuery.stderr);
  const overriddenQuery = run(["query", "rental map pins", "--budget=2000"], env, root);
  assert.equal(overriddenQuery.status, 0, overriddenQuery.stderr);

  const entries = readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(
    entries.map(({ kind, question, token_budget }) => ({ kind, question, token_budget })),
    [
      { kind: "query", question: "rental map pins", token_budget: 4000 },
      { kind: "query", question: "rental map pins", token_budget: 2000 },
    ],
    "Graphify should read .graphifyrc by default and let an explicit CLI flag override it",
  );
});
