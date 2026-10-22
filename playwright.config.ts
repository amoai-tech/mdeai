import { defineConfig, devices } from "@playwright/test";

const localBaseURL = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev:ui";
const prodBaseURL = process.env.PROD_SMOKE_BASE_URL?.trim();
// Remote targets belong only to the opt-in prod-smoke project. A developer's
// inherited PROD_SMOKE_BASE_URL must never redirect ordinary browser tests.
const baseURL = localBaseURL;
// Keep live-data tests out of ordinary local/agent discovery. Both flags must
// be intentional; explicit trusted production scripts already supply them.
const runProductionProjects = Boolean(prodBaseURL) && process.env.PW_SKIP_WEBSERVER === "1";

const VITEST_TESTS = "**/*.test.ts";

const PROD_SPECS = [
  "**/prod-candidate-certification.spec.ts",
  "**/prod-synthetic-smoke.spec.ts",
  "**/prod-signed-in-route.spec.ts",
  "**/prod-copilotkit-isolation.spec.ts",
  "**/prod-concierge-thread-lifecycle.spec.ts",
  "**/san-1413-saved-chat-continuity.spec.ts",
  "**/prod-journey-j05-j20.spec.ts",
  "**/rental-ai-security.spec.ts",
  "**/san-1204-broker-viewing-requests.spec.ts",
  "**/rental-conversion-journey.spec.ts",
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tmp/playwright-report" }],
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
        // SAN-524: the browse map sheet Close target; runs in the PR gate under `local-chromium`.
        "**/browse-map-close-touch.spec.ts",
        ...PROD_SPECS,
      ],
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL },
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
        "**/san-1524-contests.spec.ts",
      ],
      testIgnore: [VITEST_TESTS, ...PROD_SPECS],
      retries: 0,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: localBaseURL,
        trace: "retain-on-failure",
      },
    },
    {
      name: "cross-browser-chromium",
      testMatch: "**/auth-guard.spec.ts",
      testIgnore: VITEST_TESTS,
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL: localBaseURL },
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
        // A static 200 means the HTTP server is up without waiting for slow home-page data.
        // Actual auth pages are still exercised by Playwright test assertions.
        url: new URL("/file.svg", localBaseURL).toString(),
        stdout: process.env.CI ? "pipe" : "ignore",
        stderr: "pipe",
        // A reused server may belong to a different worktree and produce false greens.
        // Explicit opt-in is available when the caller knows the server owner.
        reuseExistingServer: !process.env.CI && process.env.PW_REUSE_WEBSERVER === "1",
        timeout: 240_000,
      },
});
