import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const checker = resolve("scripts/check-mastra-builder-isolation.mjs");

function withBuildFixture({ server = "console.log('server');", browser = "console.log('client');" }, check) {
  const root = mkdtempSync(join(tmpdir(), "mde-builder-isolation-"));
  try {
    const lockKey = ["node_modules/@copilot", "kit/runtime/node_modules/openai"].join("");
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages: { [lockKey]: { version: "4.104.0" } } }));
    for (const [path, content] of [[".next/server/app/route.js", server], [".next/static/chunks/app.js", browser]]) {
      if (content === null) continue;
      const file = join(root, path);
      mkdirSync(dirname(file), { recursive: true });
      if (content !== "__empty__") writeFileSync(file, content);
    }
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8", timeout: 15000 });
    check(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("accepts independent server and browser JS assets with the pinned chat SDK", () => {
  withBuildFixture({}, ({ status, stdout, stderr }) => {
    assert.equal(status, 0, stderr);
    assert.match(stdout, /isolation OK/);
  });
});

test("rejects Editor code in the server bundle", () => {
  withBuildFixture({ server: 'import "@mastra/editor";' }, ({ status, stderr }) => {
    assert.equal(status, 1);
    assert.match(stderr, /FAILED/);
  });
});

test("rejects Editor code in a browser chunk even when server is clean", () => {
  withBuildFixture({ browser: 'const Builder = createBuilderAgent();' }, ({ status, stderr }) => {
    assert.equal(status, 1);
    assert.match(stderr, /FAILED/);
  });
});

test("rejects missing browser output despite a populated server tree", () => {
  withBuildFixture({ browser: null }, ({ status, stderr }) => {
    assert.equal(status, 1);
    assert.match(stderr, /build|missing|FAILED/i);
  });
});

test("rejects missing server output despite a populated browser tree", () => {
  withBuildFixture({ server: null }, ({ status, stderr }) => {
    assert.equal(status, 1);
    assert.match(stderr, /build|missing|FAILED/i);
  });
});

test("rejects a browser directory containing no JavaScript", () => {
  withBuildFixture({ browser: "__empty__" }, ({ status, stderr }) => {
    assert.equal(status, 1);
    assert.match(stderr, /build|missing|FAILED/i);
  });
});
