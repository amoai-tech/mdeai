import { describe, expect, it } from "vitest";
import { selectSkills } from "../../scripts/select-pr-agent-skills.mjs";

const names = (files: string[]) => selectSkills(files).skills;

describe("SAN-1312 PR-Agent changed-file routing", () => {
  it("always loads universal code review and no irrelevant specialist for docs", () => {
    expect(names(["README.md"])).toEqual(["code-review"]);
  });

  it("routes Supabase migrations and MDE auth/session boundaries", () => {
    expect(names(["supabase/migrations/202609190001_test.sql"])).toEqual([
      "code-review",
      "supabase",
    ]);
    expect(names(["src/lib/supabase/client.ts"])).toEqual([
      "code-review",
      "supabase",
    ]);
    expect(names(["src/app/auth/callback/route.ts"])).toEqual([
      "code-review",
      "supabase",
      "nextjs",
    ]);
    expect(names(["src/proxy.ts"])).toEqual([
      "code-review",
      "supabase",
      "nextjs",
    ]);
    expect(names(["src/proxy.test.ts"])).not.toContain("supabase");
  });

  it("routes Mastra changes", () => {
    expect(names(["src/mastra/agents/concierge.ts"])).toEqual([
      "code-review",
      "mastra",
    ]);
  });

  it("routes CopilotKit API changes with Next.js review", () => {
    expect(names(["src/app/api/copilotkit/route.ts"])).toEqual([
      "code-review",
      "copilotkit",
      "nextjs",
    ]);
  });

  it("routes Maps and Stripe changes independently", () => {
    expect(names(["src/components/map/MapView.tsx"])).toContain("maps");
    expect(names(["src/lib/stripe/webhook.ts"])).toContain("stripe");
  });

  it("keeps CI workflow review under universal code-review", () => {
    expect(names([".github/workflows/floor.yml"])).toEqual(["code-review"]);
  });

  it("does not route generic names to unrelated specialists", () => {
    expect(names(["docs/database-design.md"])).toEqual(["code-review"]);
    expect(names(["src/components/PaymentForm.tsx"])).toEqual(["code-review"]);
    expect(names(["src/components/MapboxWrapper.tsx"])).toEqual(["code-review"]);
  });

  it("still routes MDE ticket checkout paths that are Stripe-backed", () => {
    expect(names(["src/app/api/tickets/checkout/route.ts"])).toContain("stripe");
    expect(names(["src/lib/tickets/submit-ticket-checkout.ts"])).toContain("stripe");
  });

  it("loads broad specialists for package dependency changes", () => {
    const result = names(["package.json"]);
    for (const skill of [
      "copilotkit",
      "mastra",
      "supabase",
      "maps",
      "stripe",
      "nextjs",
    ]) {
      expect(result).toContain(skill);
    }
  });

  it("includes Next.js review invariants in PR-Agent context", () => {
    const result = selectSkills(["src/app/page.tsx"]);
    expect(result.paths).not.toContain("/github/workspace/.claude/skills/nextjs");
    expect(result.paths).toContain("/github/workspace/.claude/skills/nextjs/references/review.md");
  });

  it("caps the specialist context budget", () => {
    expect(selectSkills(["README.md"]).maxTokens).toBeLessThanOrEqual(2000);
    expect(selectSkills(["package.json"]).maxTokens).toBeLessThanOrEqual(6000);
  });
});
