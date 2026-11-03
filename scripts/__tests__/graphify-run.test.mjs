import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const wrapper = join(root, "scripts", "graphify-run.sh");

test("Graphify wrapper forwards arguments without refreshing agent skills", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "mde-graphify-wrapper-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const fakeGraphify = join(temp, "graphify");
  writeFileSync(fakeGraphify, '#!/bin/sh\nprintf "ARGS=%s;AUTO=%s;PWD=%s\\n" "$*" "${GRAPHIFY_NO_AUTO_REFRESH-unset}" "$PWD"\n', { mode: 0o755 });

  const env = { ...process.env, GRAPHIFY_BIN: fakeGraphify };
  delete env.GRAPHIFY_NO_AUTO_REFRESH;

  const result = spawnSync("bash", [wrapper, "explain", "conciergeAgent"], {
    cwd: temp, env, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ARGS=explain conciergeAgent;AUTO=1/);
  assert.ok(result.stdout.includes("PWD=" + root.replace(/\/$/, "")));
});

test("Graphify wrapper respects an explicit auto-refresh override", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "mde-graphify-wrapper-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const fakeGraphify = join(temp, "graphify");
  writeFileSync(fakeGraphify, '#!/bin/sh\nprintf "AUTO=%s\\n" "$GRAPHIFY_NO_AUTO_REFRESH"\n', { mode: 0o755 });
  const result = spawnSync("bash", [wrapper, "query", "conciergeAgent"], {
    cwd: root,
    env: { ...process.env, GRAPHIFY_BIN: fakeGraphify, GRAPHIFY_NO_AUTO_REFRESH: "0" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AUTO=0/);
});

test("Graphify wrapper provides a repair command for a missing executable", () => {
  const result = spawnSync("bash", [wrapper, "query", "conciergeAgent"], {
    cwd: root,
    env: { ...process.env, GRAPHIFY_BIN: "/tmp/graphify-missing-mde-20261103" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Graphify executable not found/);
  assert.match(result.stderr, /graphifyy\[sql\]==0\.9\.101/);
});
