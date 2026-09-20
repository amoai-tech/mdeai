import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../../../playwright.config";

describe("SAN-1341 Playwright architecture", () => {
  it("separates deterministic, cross-browser, and production projects", () => {
    const names = (config.projects ?? []).map((project) => project.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "local-chromium",
        "cross-browser-chromium",
        "cross-browser-firefox",
        "cross-browser-webkit",
        "prod-smoke",
      ]),
    );
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
    const helper = fs.readFileSync(
      path.join(process.cwd(), "e2e/helpers/maps-layout.ts"),
      "utf8",
    );
    expect(helper).not.toContain("Object.getOwnPropertyDescriptor(");
  });

  it("removes the restaurant fast-path fixed sleep", () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), "e2e/restaurant-card-fast-path.spec.ts"),
      "utf8",
    );
    expect(spec).not.toContain("waitForTimeout(");
  });

  it("keeps production smoke serialized with a long timeout", () => {
    const prod = (config.projects ?? []).find(
      (project) => project.name === "prod-smoke",
    );
    expect(prod).toBeDefined();
    expect(prod?.workers).toBe(1);
    expect(prod?.timeout).toBeGreaterThanOrEqual(300_000);
  });
  it("mounts a deterministic chat adapter without CopilotKit transport for local PR tests", () => {
    const panel = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-center-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT");
    expect(panel).toContain("DeterministicConciergeChat");
  });

  it("restores visible local fast-path messages and restaurant clarify chips", () => {
    const localMessages = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/concierge-local-chat-messages.tsx",
      ),
      "utf8",
    );
    expect(localMessages).toContain("RestaurantFilterChips");
    expect(localMessages).toContain("useEventLocalChat");
    expect(localMessages).toContain("restaurant-clarify");
  });

  it("bypasses useAgent transport in deterministic E2E mode", () => {
    const provider = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/concierge-coagent-context.tsx",
      ),
      "utf8",
    );
    expect(provider).toContain("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT");
    expect(provider).toContain("DeterministicConciergeCoAgentProvider");
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
      path.join(
        process.cwd(),
        ".github/workflows/playwright-deterministic.yml",
      ),
      "utf8",
    );
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("npm run test:e2e:deterministic");
    expect(workflow).toContain('NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT: "1"');
    expect(workflow).not.toContain("secrets.NEXT_PUBLIC_SUPABASE");
    expect(workflow).toContain("SMOKE_BASE_URL: http://localhost:3002");
  });

  it("never reuses an existing web server in CI", () => {
    const configText = fs.readFileSync(
      path.join(process.cwd(), "playwright.config.ts"),
      "utf8",
    );
    expect(configText).toContain("reuseExistingServer: !process.env.CI");
  });
});
