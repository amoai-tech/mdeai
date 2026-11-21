/**
 * VEB-MVP-010 / SAN-881 — proves Mastra suspend snapshots survive a cold start
 * when storage uses Supabase Postgres (same backing store as Vercel production).
 *
 * Run: VEB_MVP_010_INTEGRATION=1 infisical run --silent --env=dev --path=/ -- \
 *   npm test -- --run storage-durability.integration
 *
 * Refuses a non-loopback DATABASE_URL unless MASTRA_ALLOW_REMOTE_DB_HOST names that
 * exact host (see integration-db-guard.ts). The VEB-MVP-010 lane deliberately uses a
 * dedicated remote test database, so that workflow pins its host explicitly. A bare
 * boolean opt-in is not accepted: it would let any remote database, including production,
 * through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import {
  closeMastraStorageForTests,
  getMastraStorage,
  resetMastraStorageForTests,
} from "./storage";
import { eventVenueBookingWorkflow } from "@/mastra/workflows/event-venue-booking-workflow";
import { assertLoopbackDatabaseUrl, REMOTE_DB_HOST_PIN } from "./integration-db-guard";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const WORKFLOW_NAME = "eventVenueBookingWorkflow";

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/events/event-venue-booking-workflow-core", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/events/event-venue-booking-workflow-core")
  >();
  return {
    ...actual,
    validateEventBookingForWorkflow: vi.fn(),
    attachWorkflowRunToBooking: vi.fn(),
    applyEventBookingAdminDecision: vi.fn(),
  };
});

import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  validateEventBookingForWorkflow,
  attachWorkflowRunToBooking,
  applyEventBookingAdminDecision,
} from "@/lib/events/event-venue-booking-workflow-core";

function buildMastra() {
  return new Mastra({
    workflows: { eventVenueBookingWorkflow },
    storage: getMastraStorage(),
  });
}

async function deleteWorkflowSnapshot(runId: string): Promise<void> {
  const store = getMastraStorage();
  if (!(store instanceof PostgresStore)) return;
  const workflows = await store.getStore("workflows");
  if (!workflows?.deleteWorkflowRunById) return;
  try {
    await workflows.deleteWorkflowRunById({
      runId,
      workflowName: WORKFLOW_NAME,
    });
  } catch {
    // Best-effort — snapshot may already be gone after successful resume.
  }
}

// Flag on means the proof MUST run. A missing DATABASE_URL fails inside the test (the
// guard throws) instead of silently skipping to a green build.
const runIntegration = process.env.VEB_MVP_010_INTEGRATION === "1";

describe.runIf(runIntegration)("VEB-MVP-010 Postgres cold-start durability", () => {
  const runIdsToCleanup: string[] = [];

  beforeEach(() => {
    runIdsToCleanup.length = 0;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    resetMastraStorageForTests();
    vi.clearAllMocks();
    vi.mocked(createServiceRoleClient).mockReturnValue({} as never);
    vi.mocked(validateEventBookingForWorkflow).mockResolvedValue({
      ok: true,
      data: {
        bookingId: BOOKING_ID,
        userId: USER_ID,
        summary: "Birthday · 30 guests · 2026-07-15 · Mamacita",
        venueTitle: "Mamacita Provenza",
        partySize: 30,
        startDate: "2026-07-15",
      },
    });
    vi.mocked(attachWorkflowRunToBooking).mockResolvedValue({ ok: true });
    vi.mocked(applyEventBookingAdminDecision).mockResolvedValue({
      ok: true,
      data: { bookingId: BOOKING_ID, partnerStatus: "approved" },
    });
  });

  afterEach(async () => {
    for (const runId of runIdsToCleanup) {
      await deleteWorkflowSnapshot(runId);
    }
    // Close any open Postgres pool(s) created during the test.
    await closeMastraStorageForTests();
    vi.unstubAllEnvs();
  });

  it(
    "uses PostgresStore and resumes suspended workflow after storage singleton reset",
    async () => {
      assertLoopbackDatabaseUrl(process.env.DATABASE_URL, "VEB_MVP_010_INTEGRATION", {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      });
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      const mastraBefore = buildMastra();
      const storageBefore = getMastraStorage();
      expect(storageBefore).toBeInstanceOf(PostgresStore);
      expect(info).toHaveBeenCalledWith("[mastra-storage] using Postgres");

      const workflowBefore = mastraBefore.getWorkflow(WORKFLOW_NAME);
      const run = await workflowBefore.createRun();
      const started = await run.start({
        inputData: { bookingId: BOOKING_ID, userId: USER_ID },
      });

      expect(started.status).toBe("suspended");
      const runId = run.runId;
      expect(runId).toBeTruthy();
      runIdsToCleanup.push(runId);

      // Simulate Vercel redeploy: drop singleton (new pool on next boot). Do not close
      // the first pool here — Mastra may still hold the store reference until resume.
      resetMastraStorageForTests();
      info.mockClear();

      const mastraAfter = buildMastra();
      expect(getMastraStorage()).toBeInstanceOf(PostgresStore);
      expect(info).toHaveBeenCalledWith("[mastra-storage] using Postgres");

      const workflowAfter = mastraAfter.getWorkflow(WORKFLOW_NAME);
      const reloaded = await workflowAfter.createRun({ runId });
      const resumed = await reloaded.resume({
        step: "suspend-for-admin-review",
        resumeData: { decision: "approved", actorId: ACTOR_ID },
      });

      expect(resumed.status).toBe("success");
      expect(applyEventBookingAdminDecision).toHaveBeenCalledWith(
        expect.anything(),
        BOOKING_ID,
        { decision: "approved", actorId: ACTOR_ID },
      );

      info.mockRestore();
    },
    120_000,
  );

  it(
    "a second resume of one suspended run is refused and the approval side effect stays once",
    async () => {
      assertLoopbackDatabaseUrl(process.env.DATABASE_URL, "VEB_MVP_010_INTEGRATION", {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      });

      const startRun = await buildMastra()
        .getWorkflow(WORKFLOW_NAME)
        .createRun();
      const started = await startRun.start({
        inputData: { bookingId: BOOKING_ID, userId: USER_ID },
      });
      expect(started.status).toBe("suspended");
      runIdsToCleanup.push(startRun.runId);

      // Distinct PostgresStore pools, but NOT distinct workflow instances: Mastra
      // caches a Run per workflow instance by runId, and buildMastra() registers the
      // same imported singleton, so runnerA === runnerB here. This therefore proves
      // in-process duplicate-resume protection and exactly-once side effects, not a
      // cross-pool race. The database-level claim race is proven in the test below.
      resetMastraStorageForTests();
      const runnerA = await buildMastra()
        .getWorkflow(WORKFLOW_NAME)
        .createRun({ runId: startRun.runId });
      resetMastraStorageForTests();
      const runnerB = await buildMastra()
        .getWorkflow(WORKFLOW_NAME)
        .createRun({ runId: startRun.runId });

      const decision = {
        step: "suspend-for-admin-review",
        resumeData: { decision: "approved" as const, actorId: ACTOR_ID },
      };
      const outcomes = await Promise.allSettled([
        runnerA.resume(decision),
        runnerB.resume(decision),
      ]);
      const successes = outcomes.filter(
        (result) => result.status === "fulfilled" && result.value.status === "success",
      );
      const rejected = outcomes.filter((result) => result.status === "rejected");
      expect(successes).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const refused = String((rejected[0] as PromiseRejectedResult).reason);
      // The losing caller may see the atomic claim, or arrive after the
      // winning call has already committed the successful run state.
      expect(refused).toMatch(
        /WORKFLOW_RESUME_ALREADY_CLAIMED|WORKFLOW_RUN_NOT_SUSPENDED/,
      );
      // The loser can observe the winner mid-flight (running/pending) or already
      // committed (success); requiring only "success" made this flaky under load.
      if (refused.includes("WORKFLOW_RUN_NOT_SUSPENDED")) {
        expect(refused).toMatch(/"status":"(success|running|pending)"/);
      }
      // This workflow's completed snapshot may be pruned by Mastra, so a
      // post-completion snapshot lookup is not a valid persistence assertion.
      expect(applyEventBookingAdminDecision).toHaveBeenCalledTimes(1);
    },
    120_000,
  );

  it(
    "resolves exactly one run-claim winner across two independent Postgres pools",
    async () => {
      assertLoopbackDatabaseUrl(process.env.DATABASE_URL, "VEB_MVP_010_INTEGRATION", {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      });

      // No workflow instance is involved, so Mastra's per-instance Run cache cannot
      // mask this: the claim is decided by the row in mastra_workflow_run_owners.
      const connectionString = process.env.DATABASE_URL!;
      const runId = "san1698-claim-" + randomUUID();
      const storeA = new PostgresStore({ id: "claim-a", connectionString, disableInit: true });
      const storeB = new PostgresStore({ id: "claim-b", connectionString, disableInit: true });
      try {
        const workflowsA = await storeA.getStore("workflows");
        const workflowsB = await storeB.getStore("workflows");
        if (!workflowsA || !workflowsB) {
          throw new Error("workflows store domain is unavailable; cannot prove the claim race");
        }

        const results = await Promise.all([
          workflowsA.claimRunOwnership({
            runId,
            ownerId: "owner-a",
            leaseMs: 60_000,
            expectedGeneration: 0,
          }),
          workflowsB.claimRunOwnership({
            runId,
            ownerId: "owner-b",
            leaseMs: 60_000,
            expectedGeneration: 0,
          }),
        ]);

        const winners = results.filter((result) => result.acquired);
        expect(winners).toHaveLength(1);

        const winner = winners[0];
        expect(winner.record.runId).toBe(runId);
        // generation is an opaque monotonic claim token, not a small counter.
        expect(winner.record.generation).toBeGreaterThan(0);
        expect(["owner-a", "owner-b"]).toContain(winner.record.ownerId);

        // A third claimant that observed the pre-claim generation must be refused,
        // and the refusal is the live generation, not a silent success.
        const stale = await workflowsA.claimRunOwnership({
          runId,
          ownerId: "owner-c",
          leaseMs: 60_000,
          expectedGeneration: 0,
        });
        expect(stale.acquired).toBe(false);
        expect(stale.record?.generation).toBe(winner.record.generation);

        // Release so no live lease outlives the test (the row is intentionally kept).
        await workflowsA.releaseRunOwnership({
          runId,
          generation: winner.record.generation,
          ownerId: winner.record.ownerId,
        });
      } finally {
        await storeA.close();
        await storeB.close();
      }
    },
    120_000,
  );
});
