import { defineConfig, devices } from "@playwright/test";
import { createArgosReporterOptions } from "@argos-ci/playwright/reporter";

const prodBaseURL = process.env.PROD_SMOKE_BASE_URL?.trim();
// Remote tests require BOTH production flags and an explicitly selected project.
// No ordinary project ever receives a remote base URL, even with those flags.
const runProductionProjects = Boolean(prodBaseURL) && process.env.PW_SKIP_WEBSERVER === "1";
const requestedLocalBaseURL = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const requestedURL = new URL(requestedLocalBaseURL);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isSafeLocalURL =
  ["http:", "https:"].includes(requestedURL.protocol) &&
  loopbackHosts.has(requestedURL.hostname) &&
  !requestedURL.username &&
  !requestedURL.password;
if (!isSafeLocalURL && !runProductionProjects) {
  throw new Error(
    "SMOKE_BASE_URL must be a local HTTP(S) loopback URL (localhost, 127.0.0.1, or [::1]). " +
      "Use PROD_SMOKE_BASE_URL with PW_SKIP_WEBSERVER=1 and --project=prod-smoke for explicit remote checks.",
  );
}
// Production certification historically sets both URL variables to the remote
// deployment. Ignore SMOKE_BASE_URL in that case for ALL ordinary projects;
// only prod-smoke uses PROD_SMOKE_BASE_URL. This prevents a remote test leak.
const localBaseURL = isSafeLocalURL ? requestedLocalBaseURL : "http://localhost:3001";
// Browser CI needs to know when Next.js is LISTENING, not when the expensive
// marketing homepage has finished compiling or fetching live data.
const localWebServerURL = new URL(localBaseURL);
const localWebServerPort = Number(
  localWebServerURL.port || (localWebServerURL.protocol === "https:" ? 443 : 80),
);
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev:ui";
const baseURL = localBaseURL;

const VITEST_TESTS = "**/*.test.ts";

// SAN-1298's cross-screen journey is opt-in: the history reattach it asserts on is
// still intermittent on the product side (SAN-1639), so it must not gate the smoke
// suite. Enable deliberately with MDE_SAN1298_CROSS_SCREEN=1.
const OPT_IN_PROD_SPECS =
  process.env.MDE_SAN1298_CROSS_SCREEN === "1" ? ["**/prod-cross-screen-journey.spec.ts"] : [];

const PROD_SPECS = [
  "**/app/host-ai-continuity.spec.ts",
  "**/app/host-ai-sales-accuracy.spec.ts",
  "**/prod-candidate-certification.spec.ts",
  ...OPT_IN_PROD_SPECS,
  // SAN-1606's read-only deployed mobile navigation probe is explicitly opt-in.
  ...(process.env.MDE_SAN1606_REMOTE_MOBILE_NAV === "1"
    ? ["**/mobile-bottom-nav.spec.ts"]
    : []),
  // Remote QA is suite-scoped; an opt-in flag enables only its corresponding
  // existing test file. All still require --project=prod-smoke, a remote URL,
  // and PW_SKIP_WEBSERVER=1. Auth and fixture cleanup remain in each suite.
  ...(process.env.MDE_REMOTE_DISCOVERY_CARDS === "1"
    ? ["**/san-1140-discovery-card-actions.spec.ts"] : []),
  ...(process.env.MDE_ROLE_QA_E2E === "1"
    ? ["**/qa-role-selection.spec.ts"] : []),
  ...(process.env.MDE_SUPER_ADMIN_QA === "1"
    ? ["**/qa-super-admin-fixture.spec.ts"] : []),
  ...(process.env.MDE_PARTNER_LIVE_SOURCE_E2E === "1"
    ? ["**/app/partner-ai-signup-live-source.spec.ts"] : []),
  "**/prod-synthetic-smoke.spec.ts",
  "**/prod-signed-in-route.spec.ts",
  "**/prod-ticket-wallet-authed.spec.ts",
  "**/prod-rentals-results-refresh.spec.ts",
  "**/prod-rentals-mobile-form-map.spec.ts",
  "**/prod-discovery-inline-ask.spec.ts",
  "**/prod-discovery-nightlife-mobile.spec.ts",
  "**/prod-copilotkit-isolation.spec.ts",
  "**/prod-concierge-thread-lifecycle.spec.ts",
  "**/prod-concierge-stop-retry.spec.ts",
  "**/prod-renter-mobile-chat.spec.ts",
  "**/prod-release-health.spec.ts",
  "**/san-1413-saved-chat-continuity.spec.ts",
  "**/prod-journey-j05-j20.spec.ts",
  "**/rental-ai-security.spec.ts",
  "**/san-1204-broker-viewing-requests.spec.ts",
  "**/rental-conversion-journey.spec.ts",
  "**/maps-mobile-lifecycle.spec.ts",
];

export default defineConfig({
  // Only CI opt-in runs this; never on production smoke or ordinary local tests.
  globalSetup: process.env.PLAYWRIGHT_CI_WARMUP === "1" ? "./e2e/ci-warmup.ts" : undefined,
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [
    [process.env.CI ? "dot" : "list"],
    ["html", { open: "never", outputFolder: "tmp/playwright-report" }],
    [
      "@argos-ci/playwright/reporter",
      createArgosReporterOptions({
        // Other MDE browser CI jobs intentionally have no Argos token.
        uploadToArgos: Boolean(process.env.CI && process.env.ARGOS_TOKEN),
      }),
    ],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Backward-compatible project for existing focused scripts while migration proceeds.
      name: "chromium",
      testIgnore: [
        VITEST_TESTS,
        "**/deterministic-critical.spec.ts",
        // SAN-1357: the probe route only exists when NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT=1,
        // which this project does not set. It runs under `local-chromium` instead.
        "**/chat-virtualization.spec.ts",
        // SAN-966: needs the deterministic chat, so it runs under `local-chromium`.
        "**/chat-result-order.spec.ts",
        // SAN-1413: same reason.
        "**/chat-thread-history.spec.ts",
        // SAN-1414: same reason.
        "**/chat-workspace-layout.spec.ts",
        // SAN-524: touch/mobile map journey runs hermetically with the deterministic chat + Maps seam.
        "**/maps-layout-mobile.spec.ts",
        // SAN-1075: the viewing modal needs the deterministic chat + an emulated keyboard.
        "**/viewing-modal-keyboard.spec.ts",
        // SAN-1075: the phone header runs with the deterministic chat so it can measure real boxes.
        "**/mobile-header.spec.ts",
        // SAN-522: mobile composer runs under local-chromium; keep it out of the general project.
        "**/screens/MOB-CK-001-mobile-composer.spec.ts",
        // SAN-1606: the phone navigation journey runs in the deterministic lane only.
        "**/mobile-bottom-nav.spec.ts",
        // SAN-524: the browse map sheet Close target; runs in the PR gate under `local-chromium`.
        "**/browse-map-close-touch.spec.ts",
        ...PROD_SPECS,
      ],
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        // Chromium-only launch arguments stabilize screenshot text rendering.
        launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none"] },
      },
    },
    {
      name: "local-chromium",
      testMatch: [
        "**/deterministic-critical.spec.ts",
        "**/auth-guard.spec.ts",
        "**/chat-virtualization.spec.ts",
        "**/chat-result-order.spec.ts",
        "**/chat-thread-history.spec.ts",
        "**/chat-workspace-layout.spec.ts",
        "**/screens/MOB-CK-001-mobile-composer.spec.ts",
        "**/maps-layout-mobile.spec.ts",
        "**/viewing-modal-keyboard.spec.ts",
        "**/mobile-header.spec.ts",
        "**/browse-map-close-touch.spec.ts",
        "**/mobile-bottom-nav.spec.ts",
        "**/san-1524-contests.spec.ts",
        // SAN-1140/SAN-1122: discovery card actions against the deterministic inventory fixture.
        "**/san-1140-discovery-card-actions.spec.ts",
      ],
      testIgnore: [VITEST_TESTS, ...PROD_SPECS],
      retries: 0,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: localBaseURL,
        launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none"] },
        trace: "retain-on-failure",
      },
    },
    {
      name: "cross-browser-chromium",
      testMatch: "**/auth-guard.spec.ts",
      testIgnore: VITEST_TESTS,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: localBaseURL,
        launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none"] },
      },
    },
    {
      name: "cross-browser-firefox",
      testMatch: "**/auth-guard.spec.ts",
      testIgnore: VITEST_TESTS,
      workers: 1,
      use: { ...devices["Desktop Firefox"], baseURL: localBaseURL },
    },
    {
      name: "cross-browser-webkit",
      testMatch: "**/auth-guard.spec.ts",
      testIgnore: VITEST_TESTS,
      workers: 1,
      use: { ...devices["Desktop Safari"], baseURL: localBaseURL },
    },
    {
      name: "critical-cross-browser-chromium",
      testMatch: "**/deterministic-critical.spec.ts",
      testIgnore: VITEST_TESTS,
      retries: 0,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: localBaseURL,
        launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none"] },
        trace: "retain-on-failure",
      },
    },
    {
      name: "critical-cross-browser-firefox",
      testMatch: "**/deterministic-critical.spec.ts",
      testIgnore: VITEST_TESTS,
      retries: 0,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
        baseURL: localBaseURL,
        trace: "retain-on-failure",
      },
    },
    {
      name: "critical-cross-browser-webkit",
      testMatch: "**/deterministic-critical.spec.ts",
      testIgnore: VITEST_TESTS,
      retries: 0,
      workers: 1,
      use: {
        ...devices["Desktop Safari"],
        baseURL: localBaseURL,
        trace: "retain-on-failure",
      },
    },
    ...(runProductionProjects ? [{
      name: "prod-smoke",
      testMatch: PROD_SPECS,
      testIgnore: VITEST_TESTS,
      retries: 1,
      workers: 1,
      timeout: 600_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: prodBaseURL || "https://www.mdeai.co",
        trace: "off" as const,
      },
    }] : []),
  ],
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command: webServerCommand,
        // A GET / can compile the full marketing homepage (and depend on external
        // discovery calls), causing false 120s "startup" failures in cold CI.
        // Keep baseURL above for real page assertions; only readiness checks the port.
        port: localWebServerPort,
        // Playwright otherwise hides server stdout; preserve diagnostics when CI fails.
        stdout: "pipe",
        stderr: "pipe",
        // A reused server may belong to a different worktree and produce false greens.
        // Explicit opt-in is available when the caller knows the server owner.
        reuseExistingServer: !process.env.CI && process.env.PW_REUSE_WEBSERVER === "1",
        timeout: 120_000,
      },
});
