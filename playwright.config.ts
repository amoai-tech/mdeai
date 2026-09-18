import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PROD_SMOKE_BASE_URL?.trim() ||
  process.env.SMOKE_BASE_URL ||
  "http://localhost:3001";

/**
 * SAN-1330 — Vercel deployment URLs are SSO-protected
 * (`ssoProtection: all_except_custom_domains`), so pre-promotion certification
 * runs against a staged deployment that requires the automation bypass. Only
 * applied when the secret is present, so local and live-domain runs are
 * unaffected.
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 150_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tmp/playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...(bypassSecret
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": bypassSecret,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev:ui",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
