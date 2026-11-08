/**
 * Ephemeral, authenticated Chrome for trusted LOCAL DevTools MCP debugging.
 *
 * Uses the existing Supabase QA session helper, not a password/new account.
 * CDP grants the attached agent full control of the authenticated browser.
 * Never run in an untrusted agent environment; the browser profile is private
 * and removed on exit. Deliberately NOT a Playwright test fixture.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function waitForChrome(port: number, process: ChildProcess): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (process.pid === undefined || process.exitCode !== null || process.signalCode !== null) {
      throw new Error("Chrome quit before its local debugger was ready. Check Chrome installation/display.");
    }
    try {
      const response = await fetch(endpoint + "/json/version", { signal: AbortSignal.timeout(350) });
      if (response.ok) {
        const data = await response.json() as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) return endpoint;
      }
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  throw new Error("Chrome debugger did not start on the expected local port.");
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
  // Never accidentally attach to some other Chrome/browser on the configured CDP port.
  try {
    const response = await fetch(`http://127.0.0.1:${options.port}/json/version`, {
      signal: AbortSignal.timeout(500),
    });
    if (response.ok) throw new Error("QA browser CDP port is already occupied. Close that session or use --port=...");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already occupied")) throw error;
  }

  const directory = await mkdtemp(join(tmpdir(), "mde-qa-chrome-"));
  let child: ChildProcess | undefined;
  let connected: Browser | undefined;
  try {
    const args = [
      `--user-data-dir=${directory}`,
      `--remote-debugging-port=${options.port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      ...(options.headless ? ["--headless=new"] : []),
      "about:blank",
    ];
    child = spawn("google-chrome", args, {
      env: chromeProcessEnvironment(process.env),
      stdio: "ignore",
    });
    child.on("error", () => {}); // waitForChrome reports startup failures without leaking environment.
    const endpoint = await waitForChrome(options.port, child);
    connected = await chromium.connectOverCDP(endpoint);
    const context = connected.contexts()[0];
    if (!context) throw new Error("Chrome did not expose a default browser context.");
    const page = context.pages()[0] ?? await context.newPage();
    await signInAsOnOrigin(page, options.origin, email, { requireExisting: true });
    const response = await page.goto(new URL("/saved", options.origin).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response || response.status() !== 200 || /\/(login|sign-in|sign_up|auth)(\/|$)/i.test(new URL(page.url()).pathname)) {
      throw new Error("QA browser authentication was not confirmed on /saved; closing the session.");
    }
    await page.getByTestId("saved-page").waitFor({ state: "visible", timeout: 15_000 });
    if (await page.getByTestId("saved-empty-signin").count()) {
      throw new Error("QA browser still shows sign-in UI; closing the session.");
    }
    console.log(`MDE QA browser READY: role=${options.role}, origin=${options.origin}`);
    console.log(`Chrome DevTools MCP: --browser-url=${endpoint}`);
    console.log("Only allow trusted agents to connect. CDP can read cookies/session data. Press Ctrl+C to close and erase the temporary profile.");
    await new Promise<void>((resolve) => {
      const terminate = () => child?.kill("SIGTERM");
      process.once("SIGINT", terminate);
      process.once("SIGTERM", terminate);
      child!.once("exit", () => {
        process.off("SIGINT", terminate);
        process.off("SIGTERM", terminate);
        resolve();
      });
    });
  } finally {
    await connected?.close().catch(() => undefined);
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    // Use a temporary profile so privileged cookies are never committed or reused.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

if (process.argv[1] && /qa-browser\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error("MDE QA browser: FAIL —", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
