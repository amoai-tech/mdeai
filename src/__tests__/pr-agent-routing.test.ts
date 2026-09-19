import { describe, expect, it } from "vitest";
import { selectSkills } from "../../scripts/select-pr-agent-skills.mjs";

const names = (files: string[]) => selectSkills(files).skills;

describe("SAN-1312 PR-Agent changed-file routing", () => {
  it("always loads universal code review and no irrelevant specialist for docs", () => {
    expect(names(["README.md"])).toEqual(["code-review"]);
  });

  it("routes Supabase migrations and MDE auth/session boundaries", () => {
    for (const file of [
      "supabase/migrations/202609190001_test.sql",
      "src/lib/supabase/client.ts",
      "src/app/auth/callback/route.ts",
      "src/proxy.ts",
    ]) {
      expect(names([file])).toContain("supabase-review");
    }
  });

  it("routes Mastra changes", () => {
    expect(names(["src/mastra/agents/concierge.ts"])).toEqual([
      "code-review",
      "mastra-review",
    ]);
  });

  it("routes CopilotKit API changes with Next.js review", () => {
    expect(names(["src/app/api/copilotkit/route.ts"])).toEqual([
      "code-review",
      "copilotkit-review",
      "nextjs-review",
    ]);
  });

  it("routes Maps and Stripe changes independently", () => {
    expect(names(["src/components/map/MapView.tsx"])).toContain("maps-review");
    expect(names(["src/lib/stripe/webhook.ts"])).toContain("stripe-review");
  });

  it("routes CI workflow changes to CI review", () => {
    expect(names([".github/workflows/floor.yml"])).toEqual([
      "code-review",
      "ci-review",
    ]);
  });

  it("does not route generic names to unrelated specialists", () => {
    expect(names(["docs/database-design.md"])).toEqual(["code-review"]);
    expect(names(["src/components/PaymentForm.tsx"])).toEqual(["code-review"]);
    expect(names(["src/components/MapboxWrapper.tsx"])).toEqual(["code-review"]);
  });

  it("still routes MDE ticket checkout paths that are Stripe-backed", () => {
    expect(names(["src/app/api/tickets/checkout/route.ts"])).toContain("stripe-review");
    expect(names(["src/lib/tickets/submit-ticket-checkout.ts"])).toContain("stripe-review");
  });

  it("loads broad specialists for package dependency changes", () => {
    const result = names(["package.json"]);
    for (const skill of [
      "copilotkit-review",
      "mastra-review",
      "supabase-review",
      "maps-review",
      "stripe-review",
      "nextjs-review",
    ]) {
      expect(result).toContain(skill);
    }
  });

  it("caps the specialist context budget", () => {
    expect(selectSkills(["README.md"]).maxTokens).toBeLessThanOrEqual(2000);
    expect(selectSkills(["package.json"]).maxTokens).toBeLessThanOrEqual(6000);
  });
});
