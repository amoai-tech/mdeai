/**
 * Ephemeral, authenticated Chrome for trusted LOCAL DevTools MCP debugging.
 *
 * Uses the existing Supabase QA session helper, not a password/new account.
 * CDP grants the attached agent full control of the authenticated browser.
 * Never run in an untrusted agent environment; the browser profile is private
 * and removed on exit. Deliberately NOT a Playwright test fixture.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "playwright";
import { hasE2eEnv, loadEnvLocalForE2E, signInAsOnOrigin } from "../e2e/helpers/auth";
import { resolveQaRoleEmail, type QaRole } from "../e2e/helpers/qa-roles";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LIVE_HOSTS = new Set(["www.mdeai.co", "mdeai.co"]);
const DEFAULT_PORT = 9227;
const ALLOWED_ROLES = new Set<QaRole>(["event-host", "renter", "broker", "super-admin"]);

export type QaBrowserOptions = {
  role: QaRole;
  origin: string;
  port: number;
  headless: boolean;
};

export function parseQaBrowserArgs(args: string[]): QaBrowserOptions | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (const arg of args) {
    const [name, ...pieces] = arg.split("=");
    if (["--allow-admin", "--allow-remote", "--headless"].includes(name) && pieces.length === 0) {
      flags.add(name);
    } else if (["--role", "--origin", "--port"].includes(name) && pieces.length > 0) {
      if (values.has(name)) throw new Error("Duplicate option: " + name);
      values.set(name, pieces.join("="));
    } else {
      throw new Error("Unknown QA browser option: " + name + " (use --help)");
    }
  }
  const role = (values.get("--role") ?? "event-host") as QaRole;
  if (!ALLOWED_ROLES.has(role)) throw new Error("Unsupported QA role. Use event-host, renter, broker, or super-admin.");
  if (role === "super-admin" && !flags.has("--allow-admin")) {
    throw new Error("Super Admin over CDP requires explicit --allow-admin; use a non-admin role for normal debugging.");
  }
  const origin = values.get("--origin") ?? "http://localhost:3001";
  const target = new URL(origin);
  const local = LOCAL_HOSTS.has(target.hostname) && ["http:", "https:"].includes(target.protocol);
  const remote = LIVE_HOSTS.has(target.hostname) && target.protocol === "https:" && target.port === "";
  if (!local && !(remote && flags.has("--allow-remote"))) {
    throw new Error("QA browser supports local URLs, or https://www.mdeai.co with explicit --allow-remote only.");
  }
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("Provide an origin without login details, query, fragment, or pathname.");
  }
  const port = Number(values.get("--port") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("CDP port must be an integer between 1024 and 65535.");
  }
  return { role, origin: target.origin, port, headless: flags.has("--headless") };
}

/** Only OS/display variables, never Supabase, GitHub, Stripe or agent keys. */
export function chromeProcessEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    "HOME", "PATH", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR",
    "XDG_SESSION_TYPE", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS",
    "LANG", "LC_ALL", "TMPDIR", "XDG_CURRENT_DESKTOP",
  ];
  return {
    NODE_ENV: env.NODE_ENV ?? "development",
    ...Object.fromEntries(allowed.filter((key) => env[key] !== undefined).map((key) => [key, env[key]])),
  };
}

/** Select Chrome on Linux, macOS and Windows, or use an explicit local override. */
export function findChromeExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fileExists: (path: string) => boolean = existsSync,
): string {
  if (env.CHROME_PATH?.trim()) return env.CHROME_PATH.trim();
  if (platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ...(env.HOME ? [join(env.HOME, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")] : []),
    ];
    const found = candidates.find(fileExists);
    if (found) return found;
  } else if (platform === "win32") {
    const candidates = [
      env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA,
    ].filter((directory): directory is string => Boolean(directory))
      .map((directory) => join(directory, "Google", "Chrome", "Application", "chrome.exe"));
    const found = candidates.find(fileExists);
    if (found) return found;
  } else {
    const paths = (env.PATH ?? "").split(delimiter).filter(Boolean);
    for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
      const found = paths.map((directory) => join(directory, binary)).find(fileExists);
      if (found) return found;
    }
  }
  throw new Error("Chrome executable not found. Install Chrome or set CHROME_PATH to its executable.");
}

/** Use only a fixed loopback host, never a URL supplied by the agent. */
export function probeLocalChrome(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: "/json/version",
      method: "GET",
      timeout: 350,
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        raw += chunk;
        if (raw.length > 4096) req.destroy();
      });
      response.on("end", () => {
        try {
          const metadata = JSON.parse(raw) as { webSocketDebuggerUrl?: unknown };
          finish(response.statusCode === 200 && typeof metadata.webSocketDebuggerUrl === "string" ? metadata.webSocketDebuggerUrl : null);
        } catch {
          finish(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish(null));
    req.end();
  });
}

/** Reject any listener already occupying the requested Chrome CDP port. */
export function isLoopbackPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

/** Match the unguessable browser target printed by THIS Chrome process to CDP discovery. */
export function matchesLaunchedChrome(
  port: number,
  launchedWs: string | undefined,
  discoveredWs: string | null,
): boolean {
  if (!launchedWs || !discoveredWs) return false;
  try {
    const launched = new URL(launchedWs);
    const discovered = new URL(discoveredWs);
    const allowed = new Set(["127.0.0.1", "localhost", "[::1]"]);
    return launched.protocol === "ws:" && discovered.protocol === "ws:" &&
      allowed.has(launched.hostname) && allowed.has(discovered.hostname) &&
      Number(launched.port) === port && Number(discovered.port) === port &&
      launched.pathname.startsWith("/devtools/browser/") &&
      launched.pathname.length > "/devtools/browser/".length &&
      launched.pathname === discovered.pathname;
  } catch {
    return false;
  }
}

async function waitForChrome(
  port: number,
  child: ChildProcess,
  getLaunchError: () => NodeJS.ErrnoException | undefined,
  getLaunchedDebuggerUrl: () => string | undefined,
  signal: AbortSignal,
  executable: string,
): Promise<string> {
  const endpoint = "http://127.0.0.1:" + port;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (signal.aborted) throw new Error("QA browser interrupted during startup.");
    const error = getLaunchError();
    if (error) {
      if (error.code === "ENOENT") {
        throw new Error("Chrome executable not found at " + executable + ". Install Chrome or set CHROME_PATH.");
      }
      throw new Error("Chrome failed to start: " + error.message);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Chrome quit before its local debugger was ready. Check Chrome installation/display.");
    }
    const discovered = await probeLocalChrome(port);
    if (matchesLaunchedChrome(port, getLaunchedDebuggerUrl(), discovered)) return endpoint;
    await delay(250);
  }
  throw new Error("Chrome debugger did not start with a matching browser identity on the expected local port.");
}

async function main(): Promise<void> {
  const options = parseQaBrowserArgs(process.argv.slice(2));
  if (options === "help") {
    console.log("Usage: npm run qa:browser -- [--role=event-host|renter|broker|super-admin] [--allow-admin] [--origin=http://localhost:3001] [--allow-remote] [--headless] [--port=9227]");
    console.log("Uses EXISTING QA users only. For Chrome DevTools MCP use --browser-url=http://127.0.0.1:9227. Ctrl+C closes Chrome and removes its profile.");
    return;
  }
  loadEnvLocalForE2E();
  if (!hasE2eEnv()) {
    throw new Error("QA Supabase configuration missing or invalid. Run npm run qa:auth:check first.");
  }
  const email = resolveQaRoleEmail(options.role);
  if (!email) throw new Error("An authenticated QA browser needs an existing non-anonymous QA role.");
  // Fail closed if any process already holds the selected port.
  if (await isLoopbackPortOccupied(options.port)) {
    throw new Error("QA browser CDP port is already occupied. Close that session or use --port=...");
  }

  let directory: string | undefined;
  let child: ChildProcess | undefined;
  let connected: Browser | undefined;
  // Attach handlers BEFORE creating the profile. A signal while mkdtemp is
  // pending must not bypass cleanup of a newly created session directory.
  const stop = new AbortController();
  const terminate = () => {
    stop.abort();
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  };
  process.on("SIGINT", terminate);
  process.on("SIGTERM", terminate);

  try {
    directory = await mkdtemp(join(tmpdir(), "mde-qa-chrome-"));
    if (stop.signal.aborted) throw new Error("QA browser interrupted during profile creation.");
    const profileDirectory = directory;
    const initialize = async (): Promise<void> => {
      if (stop.signal.aborted) return;
      const executable = findChromeExecutable();
      const args = [
        "--user-data-dir=" + profileDirectory,
        "--remote-debugging-port=" + options.port,
        "--remote-debugging-address=127.0.0.1",
        "--no-first-run",
        "--no-default-browser-check",
        ...(options.headless ? ["--headless=new"] : []),
        "about:blank",
      ];
      child = spawn(executable, args, {
        env: chromeProcessEnvironment(process.env),
        stdio: ["ignore", "ignore", "pipe"],
      });
      let launchError: NodeJS.ErrnoException | undefined;
      let chromeStderrTail = "";
      let launchedDebuggerUrl: string | undefined;
      child.on("error", (error: NodeJS.ErrnoException) => { launchError = error; });
      // Chrome prints its own unguessable browser WebSocket identity on stderr.
      // Do not forward browser stderr to the agent, as it can contain private data.
      child.stderr?.on("data", (chunk: Buffer) => {
        chromeStderrTail = (chromeStderrTail + chunk.toString("utf8")).slice(-4096);
        const marker = "DevTools listening on ";
        const index = chromeStderrTail.lastIndexOf(marker);
        if (index >= 0) {
          launchedDebuggerUrl = chromeStderrTail.slice(index + marker.length).split(/\s/)[0];
        }
      });
      const endpoint = await waitForChrome(options.port, child, () => launchError, () => launchedDebuggerUrl, stop.signal, executable);
      if (stop.signal.aborted) return;
      connected = await chromium.connectOverCDP(endpoint);
      const context = connected.contexts()[0];
      if (!context) throw new Error("Chrome did not expose a default browser context.");
      const page = context.pages()[0] ?? await context.newPage();
      await signInAsOnOrigin(page, options.origin, email, { requireExisting: true });
      const response = await page.goto(new URL("/saved", options.origin).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const currentPath = new URL(page.url()).pathname;
      if (!response || response.status() !== 200 || ["/login", "/sign-in", "/sign_up", "/auth"].includes(currentPath)) {
        throw new Error("QA browser authentication was not confirmed on /saved; closing the session.");
      }
      await page.getByTestId("saved-page").waitFor({ state: "visible", timeout: 15_000 });
      if (await page.getByTestId("saved-empty-signin").count()) {
        throw new Error("QA browser still shows sign-in UI; closing the session.");
      }
      if (stop.signal.aborted) return;
      console.log("MDE QA browser READY: role=" + options.role + ", origin=" + options.origin);
      console.log("Chrome DevTools MCP: --browser-url=" + endpoint);
      console.log("Only allow trusted agents to connect. CDP can read cookies/session data. Press Ctrl+C to close and erase the temporary profile.");
    };

    const interrupted = new Promise<void>((resolve) => {
      if (stop.signal.aborted) resolve();
      else stop.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    await Promise.race([initialize(), interrupted]);
    if (stop.signal.aborted) throw new Error("QA browser interrupted; temporary profile cleanup completed.");
    if (!child) throw new Error("Chrome was not launched.");
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => { child!.once("close", () => resolve()); });
    }
  } finally {
    try {
      await connected?.close().catch(() => undefined);
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = new Promise<void>((resolve) => { child!.once("close", () => resolve()); });
        child.kill("SIGTERM");
        await Promise.race([closed, delay(2_000)]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await Promise.race([closed, delay(2_000)]);
        }
      }
      if (directory) {
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      }
    } finally {
      process.off("SIGINT", terminate);
      process.off("SIGTERM", terminate);
    }
  }
}

if (process.argv[1] && /qa-browser\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error("MDE QA browser: FAIL —", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
