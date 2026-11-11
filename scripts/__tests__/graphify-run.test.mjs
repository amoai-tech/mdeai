import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const wrapper = join(root, "scripts", "graphify-run.sh");

function sandbox(t) {
  const temp = mkdtempSync(join(tmpdir(), "mde-graphify-wrapper-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  return temp;
}

function fakeGraphify(path, version = "graphify 0.9.101") {
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
  assert.match(result.stderr, /graphifyy\[sql\]==0\.9\.101/);
});

test("ignores skill-version warnings that Graphify prints on stderr", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  fakeGraphify(exe);
  const real = readFileSync(exe, "utf8");
  const patched = real.replace(
    "if [ \"$1\" = \"--version\" ]; then",
    "if [ \"$1\" = \"--version\" ]; then\n  echo 'warning: skill is from graphify 0.9.105' >&2",
  );
  // String.replace is a no-op when the search text is missing; fail loudly instead of testing nothing.
  assert.match(patched, /skill is from graphify 0\.9\.105' >&2/);
  writeFileSync(exe, patched, { mode: 0o755 });
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: exe }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ARG=query\nARG=conciergeAgent\n/);
});

test("keeps real version-probe errors but drops skill-version warnings", (t) => {
  const temp = sandbox(t);
  const exe = join(temp, "graphify");
  writeFileSync(exe, `#!/bin/sh
echo 'warning: skill is from graphify 0.9.105' >&2
echo 'boom: cannot load config' >&2
exit 1
`, { mode: 0o755 });
  const result = run(["query", "conciergeAgent"], { GRAPHIFY_BIN: exe }, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Incompatible Graphify/);
  assert.match(result.stderr, /boom: cannot load config/);
  assert.doesNotMatch(result.stderr, /skill is from graphify/);
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
  assert.match(result.stderr, /graphifyy\[sql\]==0\.9\.101/);
});

test("the active agent guidance routes Graphify through the safe wrapper", () => {
  const guide = readFileSync(join(root, "docs/07-operations/graphify-reference.md"), "utf8");
  const tasks = readFileSync(join(root, ".claude/skills/tasks/SKILL.md"), "utf8");
  const routing = readFileSync(join(root, ".claude/skills/tasks/references/domain-routing.md"), "utf8");
  assert.match(guide, /bash scripts\/graphify-run\.sh affected "conciergeAgent"/);
  assert.match(guide, /GRAPHIFY_NO_AUTO_REFRESH=1 graphify --version/);
  assert.doesNotMatch(guide, /^graphify (?:query|explain|path|affected) /m);
  assert.match(guide, /Graph Stats \(verified example, not a shared current index\)\]\(#graph-stats-verified-example-not-a-shared-current-index\)/);
  assert.match(guide, /GRAPH_REPORT\.md.*historical/);
  assert.match(guide, /Upstream source receipt \(v0\.9\.101\)/);
  assert.match(tasks, /npm run graphify:query --/);
  assert.doesNotMatch(tasks, /PATH="\$HOME\/\.local\/bin:\$PATH" graphify query/);
  assert.match(routing, /active PR\/feature checkout/);
});
