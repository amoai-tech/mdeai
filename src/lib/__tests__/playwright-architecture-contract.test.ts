import { describe, expect, it } from "vitest";
import fs from "node:fs";
import config from "../../../playwright.config";

describe("SAN-1341 Playwright architecture", () => {
  it("separates local browsers from explicitly opted-in production projects", () => {
    const names = (config.projects ?? []).map((project) => project.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "local-chromium",
        "cross-browser-chromium",
        "cross-browser-firefox",
        "cross-browser-webkit",
        "critical-cross-browser-chromium",
        "critical-cross-browser-firefox",
        "critical-cross-browser-webkit",
      ]),
    );
    // Direct local discovery cannot even select production by accident.
    expect(names).not.toContain("prod-smoke");
  });

  it("does not impose production-scale serialization globally", () => {
    expect(config.workers).not.toBe(1);
    expect(config.timeout).toBeLessThanOrEqual(60_000);
  });

  it("excludes Vitest unit tests from Playwright collection", () => {
    const local = (config.projects ?? []).find(
      (project) => project.name === "local-chromium",
    );
    expect(JSON.stringify(local?.testIgnore ?? "")).toContain("*.test.ts");
    expect(local?.retries).toBe(0);
    expect(local?.workers).toBe(1);
  });

  it("keeps critical helpers on Playwright user interactions without native value setters", () => {
    const helper = fs.readFileSync("e2e/helpers/maps-layout.ts", "utf8");
    expect(helper).not.toContain("Object.getOwnPropertyDescriptor(");
  });

  it("uses a web assertion instead of a load-lifecycle wait for the Home to Chat handoff", () => {
    const helper = fs.readFileSync("e2e/helpers/maps-layout.ts", "utf8");
    const submitHelper = helper.match(
      /export async function submitHomeHeroQuery[\s\S]*?\n}/,
    )?.[0];
    expect(submitHelper).toBeDefined();
    expect(submitHelper).toContain("await submit.click()");
    expect(submitHelper).toContain("await expect(page).toHaveURL");
    expect(submitHelper).not.toContain("page.waitForURL(");
  });

  it("removes the restaurant fast-path fixed sleep", () => {
    const spec = fs.readFileSync(
      "e2e/restaurant-card-fast-path.spec.ts",
      "utf8",
    );
    expect(spec).not.toContain("waitForTimeout(");
  });

  it("keeps opted-in production smoke serialized with a long timeout", () => {
    const source = fs.readFileSync("playwright.config.ts", "utf8");
    expect(source).toMatch(/name: "prod-smoke"[\s\S]*?workers: 1,[\s\S]*?timeout: 600_000/);
    // The actual opt-in/omission is exercised by playwright-local-safety.test.mjs.
  });
  it("mounts a deterministic chat adapter without CopilotKit transport for local PR tests", () => {
    const panel = fs.readFileSync(
      "src/components/chat/chat-center-panel.tsx",
      "utf8",
    );
    expect(panel).toContain("isDeterministicE2E()");
    expect(panel).toContain("DeterministicConciergeChat");
  });

  it("restores visible local fast-path messages and restaurant clarify chips", () => {
    const localMessages = fs.readFileSync(
      "src/components/chat/concierge-local-chat-messages.tsx",
      "utf8",
    );
    expect(localMessages).toContain("RestaurantFilterChips");
    expect(localMessages).toContain("useEventLocalChat");
    expect(localMessages).toContain("restaurant-clarify");
  });

  it("bypasses useAgent transport in deterministic E2E mode", () => {
    const provider = fs.readFileSync(
      "src/components/chat/concierge-coagent-context.tsx",
      "utf8",
    );
    expect(provider).toContain("isDeterministicE2E()");
    expect(provider).toContain("DeterministicConciergeCoAgentProvider");
  });

  it("bypasses the root CopilotKit transport in deterministic E2E mode", () => {
    const provider = fs.readFileSync(
      "src/components/copilot/copilot-kit-provider.tsx",
      "utf8",
    );
    expect(provider).toContain("isDeterministicE2E()");
    expect(provider).toContain("deterministicE2E");
  });
  it("centralizes deterministic E2E mode behind a production guard", () => {
    const guard = fs.readFileSync("src/lib/deterministic-e2e.ts", "utf8");
    const provider = fs.readFileSync(
      "src/components/copilot/copilot-kit-provider.tsx",
      "utf8",
    );
    expect(guard).toContain('process.env.NODE_ENV !== "production"');
    expect(guard).toContain("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT");
    expect(provider).toContain("isDeterministicE2E()");
  });

  it("retains a production journey trace only on failure, via its workflow", () => {
    const source = fs.readFileSync("playwright.config.ts", "utf8");
    // Opted-in production projects keep private trace capture off by default.
    expect(source).toMatch(/name: "prod-smoke"[\s\S]*?trace: "off"/);
    // The nightly journey opts into failure-only evidence and disables the CI retry that would
    // repeat a real write journey. Pin that here so the policy cannot drift silently.
    const workflow = fs.readFileSync(
      ".github/workflows/prod-renter-journey.yml",
      "utf8",
    );
    expect(workflow).toContain("--trace=retain-on-failure");
    expect(workflow).toContain("--screenshot=only-on-failure");
    expect(workflow).toContain("--retries=0");
    expect(workflow).toContain('PW_SKIP_WEBSERVER: "1"');
    expect(workflow).not.toMatch(/--trace=on\b/);
    // The evidence upload must survive a timeout or a cancelled job, and must never publish raw
    // browser state: this repository is public, so traces are encrypted or not uploaded at all.
    expect(workflow).toMatch(/Upload encrypted failure artifacts[\s\S]{0,220}if: always\(\)/);
    expect(workflow).toContain("PROD_JOURNEY_ARTIFACT_KEY");
    expect(workflow).toContain("openssl enc -aes-256-cbc");
    expect(workflow).not.toMatch(/\n\s+test-results\/\n/);
  });
  it("keeps auth and deterministic cross-browser contracts isolated", () => {
    for (const name of [
      "cross-browser-chromium",
      "cross-browser-firefox",
      "cross-browser-webkit",
    ]) {
      const project = (config.projects ?? []).find(
        (item) => item.name === name,
      );
      expect(JSON.stringify(project?.testMatch ?? "")).toContain(
        "auth-guard.spec.ts",
      );
      expect(JSON.stringify(project?.testMatch ?? "")).not.toContain(
        "deterministic-critical.spec.ts",
      );
    }

    for (const name of [
      "critical-cross-browser-chromium",
      "critical-cross-browser-firefox",
      "critical-cross-browser-webkit",
    ]) {
      const project = (config.projects ?? []).find(
        (item) => item.name === name,
      );
      expect(JSON.stringify(project?.testMatch ?? "")).toContain(
        "deterministic-critical.spec.ts",
      );
      expect(project?.retries).toBe(0);
      expect(project?.workers).toBe(1);
    }
  });

  it("keeps a serialized chromium compatibility project during migration", () => {
    const legacy = (config.projects ?? []).find(
      (project) => project.name === "chromium",
    );
    expect(legacy).toBeDefined();
    expect(legacy?.workers).toBe(1);
  });

  it("adds a focused deterministic Playwright pull-request workflow", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/playwright-deterministic.yml",
      "utf8",
    );
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("npm run test:e2e:deterministic");
    expect(workflow).toContain('NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT: "1"');
    expect(workflow).toContain("NODE_ENV: development");
    expect(workflow).not.toContain("secrets.NEXT_PUBLIC_SUPABASE");
    expect(workflow).toContain("SMOKE_BASE_URL: http://localhost:3002");
  });

  it("includes long-chat virtualization in the same deterministic PR browser run", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.scripts["test:e2e:deterministic"]).toContain(
      "e2e/chat-virtualization.spec.ts",
    );
    const workflow = fs.readFileSync(
      ".github/workflows/playwright-deterministic.yml",
      "utf8",
    );
    expect(workflow).toContain("run: npm run test:e2e:deterministic");
    expect(workflow).not.toContain("run: npm run test:e2e:chat-virtualization");
  });

  it("adds scheduled/manual critical cross-browser certification without slowing PRs", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/playwright-cross-browser.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("chromium firefox webkit");
    expect(workflow).toContain("critical-cross-browser-chromium");
    expect(workflow).toContain("critical-cross-browser-firefox");
    expect(workflow).toContain("critical-cross-browser-webkit");
    expect(workflow).toContain("NODE_ENV: development");
    expect(workflow).not.toContain("secrets.NEXT_PUBLIC_SUPABASE");
  });

  it("retains traces on deterministic failures when retries are disabled", () => {
    for (const name of [
      "local-chromium",
      "critical-cross-browser-chromium",
      "critical-cross-browser-firefox",
      "critical-cross-browser-webkit",
    ]) {
      const project = (config.projects ?? []).find(
        (item) => item.name === name,
      );
      expect(project?.retries).toBe(0);
      expect(project?.use?.trace).toBe("retain-on-failure");
    }
  });


  it("removes fixed Playwright sleeps from the E2E suite", () => {
    const files = fs
      .readdirSync("e2e", { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => `${entry.parentPath}/${entry.name}`);
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8"), file).not.toContain("waitForTimeout(");
    }
  });

  it("removes XPath from shared concierge helpers", () => {
    const helper = fs.readFileSync("e2e/helpers/maps-layout.ts", "utf8");
    expect(helper).not.toContain("xpath=");
  });

  it("waits for the accepted concierge request to finish instead of using composer enabled state", () => {
    const helper = fs.readFileSync("e2e/helpers/maps-layout.ts", "utf8");
    const idleHelper = helper.match(
      /export async function waitForCopilotIdle[\s\S]*?\n}/,
    )?.[0];
    expect(idleHelper).toBeDefined();
    expect(helper).toContain("request.response()");
    expect(helper).toContain("response.finished()");
    expect(idleHelper).not.toContain("toBeEnabled");
  });

  it("provides opt-in shared fixtures with reusable authenticated storageState", () => {
    const fixture = fs.readFileSync("e2e/fixtures.ts", "utf8");
    expect(fixture).toContain("base.extend");
    expect(fixture).toContain("authStorageState");
    expect(fixture).toContain("storageState");
    expect(fixture).toContain("context.setStorageState(authStorageState)");
    expect(fixture).toContain("{ page, context, authStorageState }");
  });

  it("tags critical, auth, and production smoke suites for selective execution", () => {
    const critical = fs.readFileSync("e2e/deterministic-critical.spec.ts", "utf8");
    const auth = fs.readFileSync("e2e/auth-guard.spec.ts", "utf8");
    const prod = fs.readFileSync("e2e/prod-synthetic-smoke.spec.ts", "utf8");
    expect(critical).toContain('tag: ["@critical", "@deterministic"]');
    expect(auth).toContain('tag: ["@auth", "@smoke"]');
    expect(prod).toContain('tag: ["@prod", "@smoke"]');
  });

  it("never silently reuses an existing worktree server", () => {
    const configText = fs.readFileSync("playwright.config.ts", "utf8");
    expect(configText).toContain('reuseExistingServer: !process.env.CI && process.env.PW_REUSE_WEBSERVER === "1"');
    if (!process.env.PW_REUSE_WEBSERVER && config.webServer && !Array.isArray(config.webServer)) {
      expect(config.webServer.reuseExistingServer).toBe(false);
    }
  });
});
