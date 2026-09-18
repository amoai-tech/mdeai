import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * SAN-1330 — pin the production certification wiring.
 *
 * The whole point of this workflow is *when* it runs and whether it publishes a
 * status Vercel can gate on. Both are easy to "simplify" back into something that
 * looks fine and certifies nothing:
 *
 *  - `vercel.deployment.success` fires AFTER the deployment has been promoted to
 *    production, so a workflow on that event can never gate the release.
 *  - without `actions/status@v1` + `statuses: write`, no commit status exists for
 *    Vercel Deployment Checks to require.
 *
 * These assertions exist so that regression fails loudly instead of silently
 * returning to "READY means live".
 */
const WORKFLOW = path.resolve(
  process.cwd(),
  ".github/workflows/prod-synthetic-smoke.yml",
);

type Step = { name?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, string> };
type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, { "if"?: string; steps?: Step[] }>;
};

const text = fs.readFileSync(WORKFLOW, "utf8");
const doc = parse(text) as Workflow & Record<string, unknown>;
// `yaml` implements YAML 1.2, so `on` stays the string key it looks like.
const on = (doc.on ?? (doc as Record<string, unknown>)[String(true)]) as Record<string, unknown>;
const triggers = on as {
  repository_dispatch?: { types?: string[] };
  schedule?: unknown;
  workflow_dispatch?: unknown;
};
const job = Object.values(doc.jobs ?? {})[0];
const steps = job?.steps ?? [];

const stepUsing = (uses: string) => steps.find((s) => s.uses?.startsWith(uses));

describe("prod certification workflow — trigger contract", () => {
  it("triggers on vercel.deployment.ready, which is not yet promoted", () => {
    const types = triggers.repository_dispatch?.types ?? [];
    expect(types).toContain("vercel.deployment.ready");
  });

  it("does not rely on vercel.deployment.success (already promoted)", () => {
    const types = triggers.repository_dispatch?.types ?? [];
    expect(types).not.toContain("vercel.deployment.success");
  });

  it("keeps the scheduled and manual paths for live-domain certification", () => {
    // `workflow_dispatch:` with no value is null in YAML, so assert the key.
    expect(triggers).toHaveProperty("schedule");
    expect(triggers).toHaveProperty("workflow_dispatch");
  });
});

describe("prod certification workflow — status publication", () => {
  it("grants statuses: write so a commit status can be published", () => {
    expect(doc.permissions?.statuses).toBe("write");
  });

  it("publishes the production-certification status via actions/status@v1", () => {
    const status = stepUsing("vercel/repository-dispatch/actions/status@");
    expect(status).toBeDefined();
    expect(status?.with?.name).toBe("production-certification");
  });

  it("guards status publication to repository_dispatch (one status per deployment)", () => {
    const status = stepUsing("vercel/repository-dispatch/actions/status@");
    expect(status?.if).toContain("repository_dispatch");
  });

  it("checks out the dispatched commit for repository_dispatch runs", () => {
    expect(stepUsing("vercel/repository-dispatch/actions/checkout@")).toBeDefined();
  });
});

describe("prod certification workflow — staged deployment handling", () => {
  it("resolves the staged deployment URL from the dispatch payload", () => {
    expect(text).toContain("github.event.client_payload.url");
  });

  it("certifies the dispatched SHA, not the branch head", () => {
    expect(text).toContain("github.event.client_payload.git.sha");
  });

  it("requires the automation bypass instead of silently passing", () => {
    // Deployment URLs are SSO-protected, so without the bypass the gate cannot
    // certify the staged deployment. It must fail, not skip.
    expect(text).toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(text).toContain("x-vercel-protection-bypass");
    expect(text).toContain("exit 1");
  });

  it("still certifies the production domain for non-dispatch runs", () => {
    expect(text).toContain("vars.PROD_SMOKE_BASE_URL");
  });
});
