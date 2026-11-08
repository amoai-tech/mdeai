import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const check = join(root, "scripts/qa-auth-check.ts");
const browser = join(root, "scripts/qa-browser.ts");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");

/**
 * Do not test the CLI's failure paths against the default CDP port 9227.
 * The developer may have an authenticated QA Chrome session attached there;
 * a port collision would mask the ENOENT/SIGINT behavior under test.
 * Reserve an ephemeral loopback port from the OS and release it immediately
 * before starting the tested child process. Never kill an unrelated listener.
 */
async function isolatedQaPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function run(file, args = [], env = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "mde-qa-cli-test-"));
  try {
    return spawnSync(process.execPath, ["--import", tsxLoader, file, ...args], {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      encoding: "utf8",
      timeout: 12_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("missing QA env fails closed without logging credentials", () => {
  const result = run(check);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(result.stderr, /(?:token|cookie)=/i);
});

test("shape-valid QA env passes without printing keys", () => {
  const secret = randomBytes(16).toString("hex");
  const result = run(check, [], {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    SUPABASE_SERVICE_ROLE_KEY: secret,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret + "|sb_publishable_fixture"));
});

test("qa browser help succeeds without secrets or Chrome", () => {
  const result = run(browser, ["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--browser-url=http:\/\/127\.0\.0\.1:9227/);
});

test("QA browser disallows automatic Super Admin exposure over CDP", () => {
  const result = run(browser, ["--role=super-admin"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires explicit --allow-admin/);
});

test("QA browser rejects untrusted origins, malformed ports, and unknown flags for the RIGHT reason", () => {
  const cases = [
    { flags: ["--origin=https://evil.example", "--allow-remote"], message: /QA browser supports local URLs/ },
    { flags: ["--origin=https://www.mdeai.co.evil.example", "--allow-remote"], message: /QA browser supports local URLs/ },
    { flags: ["--origin=http://www.mdeai.co", "--allow-remote"], message: /QA browser supports local URLs/ },
    { flags: ["--origin=http://localhost:3001/evil"], message: /Provide an origin without/ },
    { flags: ["--port=12"], message: /CDP port must be an integer/ },
    { flags: ["--port=not-a-number"], message: /CDP port must be an integer/ },
    { flags: ["--role=anonymous"], message: /Unsupported QA role/ },
    { flags: ["--password=abc"], message: /Unknown QA browser option/ },
  ];
  for (const { flags, message } of cases) {
    const result = run(browser, flags);
    assert.equal(result.status, 1, flags.join(" "));
    assert.match(result.stderr, message, flags.join(" "));
    assert.doesNotMatch(result.stderr, /QA Supabase configuration missing/, "must fail before credential check");
  }
});

test("Chrome binary lookup supports macOS, Windows, Linux and CHROME_PATH override", () => {
  const source = fileURLToPath(new URL("../qa-browser.ts", import.meta.url));
  const script = [
    "import { findChromeExecutable } from " + JSON.stringify(source) + ";",
    "const mac = findChromeExecutable({ HOME: '/Users/qa' }, 'darwin', p => p.startsWith('/Applications/'));",
    "const windows = findChromeExecutable({ PROGRAMFILES: 'C:/Program Files' }, 'win32', p => p.endsWith('chrome.exe'));",
    "const linux = findChromeExecutable({ PATH: '/opt/bin' }, 'linux', p => p === '/opt/bin/chromium');",
    "const custom = findChromeExecutable({ CHROME_PATH: '/test/custom-chrome' }, 'linux', () => false);",
    "console.log(JSON.stringify({mac,windows,linux,custom}));",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--import", tsxLoader, "--input-type=module", "--eval", script], {
    cwd: root, encoding: "utf8", timeout: 12_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout.trim());
  assert.match(values.mac, /Google Chrome/);
  assert.match(values.windows, /chrome\.exe$/);
  assert.equal(values.linux, "/opt/bin/chromium");
  assert.equal(values.custom, "/test/custom-chrome");
});

test("missing custom Chrome binary explains ENOENT and fails closed", async () => {
  const port = await isolatedQaPort();
  const missing = join(tmpdir(), "missing-mde-chrome-" + randomBytes(8).toString("hex"));
  const result = run(browser, ["--headless", `--port=${port}`], {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    SUPABASE_SERVICE_ROLE_KEY: randomBytes(16).toString("hex"),
    MDE_QA_EVENT_HOST_EMAIL: "qa-test@mdeai.co",
    CHROME_PATH: missing,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Chrome executable not found at/);
  assert.match(result.stderr, /CHROME_PATH/);
});

test("SIGINT during Chrome startup deletes its isolated profile", { timeout: 12_000 }, async (t) => {
  if (process.platform === "win32") return t.skip("Unix test uses a fake shell Chrome executable");
  const port = await isolatedQaPort();
  const dir = mkdtempSync(join(tmpdir(), "mde-qa-signal-fixture-"));
  const fakeChrome = join(dir, "fake-chrome");
  writeFileSync(fakeChrome, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
  const child = spawn(process.execPath, ["--import", tsxLoader, browser, "--headless", `--port=${port}`], {
    cwd: dir,
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      TMPDIR: dir,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      SUPABASE_SERVICE_ROLE_KEY: randomBytes(16).toString("hex"),
      MDE_QA_EVENT_HOST_EMAIL: "qa-test@mdeai.co",
      CHROME_PATH: fakeChrome,
    },
    stdio: "ignore",
  });
  try {
    await Promise.race([
      (async () => {
        while (!readdirSync(dir).some((entry) => entry.startsWith("mde-qa-chrome-"))) {
          if (child.exitCode !== null) throw new Error("launcher exited before Chrome startup");
          await delay(40);
        }
      })(),
      delay(5_000).then(() => { throw new Error("launcher failed to create temporary profile"); }),
    ]);
    child.kill("SIGINT");
    const [exitCode] = await Promise.race([
      once(child, "exit"),
      delay(5_000).then(() => { throw new Error("launcher failed to stop after Ctrl+C"); }),
    ]);
    assert.notEqual(exitCode, 0);
    assert.deepEqual(readdirSync(dir).filter((entry) => entry.startsWith("mde-qa-chrome-")), []);
  } finally {
    child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("CDP identity verification rejects a hijacked local port", () => {
  const source = fileURLToPath(new URL("../qa-browser.ts", import.meta.url));
  const script = [
    "import { matchesLaunchedChrome as matches } from " + JSON.stringify(source) + ";",
    "const expected = 'ws://127.0.0.1:9227/devtools/browser/this-instance';",
    "const foreign = 'ws://127.0.0.1:9227/devtools/browser/other-instance';",
    "const hostile = 'ws://evil.example:9227/devtools/browser/this-instance';",
    "console.log(JSON.stringify([matches(9227,expected,expected),matches(9227,expected,foreign),matches(9227,undefined,expected),matches(9227,expected,hostile),matches(9228,expected,expected)]));",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--import", tsxLoader, "--input-type=module", "--eval", script], {
    cwd: root, encoding: "utf8", timeout: 12_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [true, false, false, false, false]);
});

test("Chrome child environment drops agent and Supabase secret variables", () => {
  const source = fileURLToPath(new URL("../qa-browser.ts", import.meta.url));
  const js = `import { chromeProcessEnvironment } from ${JSON.stringify(source)}; console.log(JSON.stringify(chromeProcessEnvironment({ PATH: "/usr/bin", HOME: "/tmp", SUPABASE_SERVICE_ROLE_KEY: "unsafe", GH_TOKEN: "unsafe", NODE_OPTIONS: "unsafe" })))`;
  const result = spawnSync(process.execPath, ["--import=tsx", "--input-type=module", "--eval", js], {
    cwd: root, encoding: "utf8", timeout: 12_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { NODE_ENV: "development", HOME: "/tmp", PATH: "/usr/bin" });
});
