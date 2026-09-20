import { defineConfig, devices } from "@playwright/test";

const localBaseURL = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev:ui";
const prodBaseURL = process.env.PROD_SMOKE_BASE_URL?.trim();
const baseURL = prodBaseURL || localBaseURL;

const VITEST_TESTS = "**/*.test.ts";

const PROD_SPECS = [
  "**/prod-synthetic-smoke.spec.ts",
  "**/prod-signed-in-route.spec.ts",
  "**/prod-journey-j05-j20.spec.ts",
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
        ...PROD_SPECS,
      ],
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL },
    },
    {
      name: "local-chromium",
      testMatch: ["**/deterministic-critical.spec.ts", "**/auth-guard.spec.ts"],
      testIgnore: [VITEST_TESTS, ...PROD_SPECS],
      retries: 0,
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL: localBaseURL },
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
      name: "prod-smoke",
      testMatch: PROD_SPECS,
      testIgnore: VITEST_TESTS,
      retries: 1,
      workers: 1,
      timeout: 600_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: prodBaseURL || "https://www.mdeai.co",
      },
    },
  ],
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command: webServerCommand,
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
