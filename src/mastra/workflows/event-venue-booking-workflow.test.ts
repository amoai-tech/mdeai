import { describe, expect, it, vi, beforeEach } from "vitest";
import { Mastra } from "@mastra/core/mastra";
import { getMastraStorage } from "@/mastra/lib/storage";
import { eventVenueBookingWorkflow } from "@/mastra/workflows/event-venue-booking-workflow";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

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

function buildTestMastra() {
  return new Mastra({
    workflows: { eventVenueBookingWorkflow },
    storage: getMastraStorage(),
  });
}

describe("eventVenueBookingWorkflow", () => {
  beforeEach(() => {
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

  it("validates then suspends for admin review", async () => {
    const mastra = buildTestMastra();
    const workflow = mastra.getWorkflow("eventVenueBookingWorkflow");
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { bookingId: BOOKING_ID, userId: USER_ID },
    });

    expect(result.status).toBe("suspended");
    expect(validateEventBookingForWorkflow).toHaveBeenCalled();
    expect(attachWorkflowRunToBooking).toHaveBeenCalled();
    expect(applyEventBookingAdminDecision).not.toHaveBeenCalled();
  });

  it("resumes approve path and updates partner_status without a second insert", async () => {
    const mastra = buildTestMastra();
    const workflow = mastra.getWorkflow("eventVenueBookingWorkflow");
    const run = await workflow.createRun();

    await run.start({
      inputData: { bookingId: BOOKING_ID, userId: USER_ID },
    });

    const resumed = await run.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "approved", actorId: ACTOR_ID },
    });

    expect(resumed.status).toBe("success");
    expect(applyEventBookingAdminDecision).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      { decision: "approved", actorId: ACTOR_ID },
    );
  });

  it("resumes decline path", async () => {
    vi.mocked(applyEventBookingAdminDecision).mockResolvedValue({
      ok: true,
      data: { bookingId: BOOKING_ID, partnerStatus: "declined" },
    });

    const mastra = buildTestMastra();
    const workflow = mastra.getWorkflow("eventVenueBookingWorkflow");
    const run = await workflow.createRun();

    await run.start({
      inputData: { bookingId: BOOKING_ID, userId: USER_ID },
    });

    const resumed = await run.resume({
      step: "suspend-for-admin-review",
      resumeData: {
        decision: "declined",
        actorId: ACTOR_ID,
        declineReason: "Venue unavailable",
      },
    });

    expect(resumed.status).toBe("success");
    expect(applyEventBookingAdminDecision).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      {
        decision: "declined",
        actorId: ACTOR_ID,
        declineReason: "Venue unavailable",
      },
    );
  });
});

/**
 * SAN-1301 · MDE-CK-UPGRADE-001 — concurrent HITL isolation.
 *
 * A pending admin review is per-run state. Two operators holding two approvals
 * open must not be able to answer each other's run, and no business decision may
 * execute before the matching human response arrives.
 *
 * "B is still pending" is asserted behaviourally rather than by reading internal
 * run status: B must still resume afterwards with B's own decision. That is the
 * property that matters and it does not depend on a Mastra status accessor.
 */
describe("SAN-1301 · concurrent HITL runs stay isolated per run", () => {
  const BOOKING_A = "aaaa1111-1111-4111-8111-aaaaaaaaaaaa";
  const BOOKING_B = "bbbb2222-2222-4222-8222-bbbbbbbbbbbb";

  beforeEach(() => {
    vi.clearAllMocks();
    // This describe is a sibling of the one above, so it does not inherit its
    // hooks: the service-role client and the run attachment must be stubbed here
    // too, or the validate step fails closed before it can suspend.
    vi.mocked(createServiceRoleClient).mockReturnValue({} as never);
    vi.mocked(attachWorkflowRunToBooking).mockResolvedValue({ ok: true });

    // Each run must be identifiable by its own booking, so a decision applied to
    // one run can be attributed — and a cross-run leak cannot hide.
    vi.mocked(validateEventBookingForWorkflow).mockImplementation(
      async (_supabase, bookingId) => ({
        ok: true,
        data: {
          bookingId,
          userId: USER_ID,
          summary: `Booking ${bookingId}`,
          venueTitle: "Mamacita Provenza",
          partySize: 30,
          startDate: "2026-07-15",
        },
      }),
    );
    vi.mocked(applyEventBookingAdminDecision).mockImplementation(
      async (_supabase, bookingId, resume) => ({
        ok: true,
        data: {
          bookingId,
          partnerStatus: resume.decision === "approved" ? "approved" : "declined",
        },
      }),
    );
  });

  /** Start two independent runs and leave both suspended awaiting a human. */
  async function suspendTwoRuns() {
    const mastra = buildTestMastra();
    const workflow = mastra.getWorkflow("eventVenueBookingWorkflow");
    const runA = await workflow.createRun();
    const runB = await workflow.createRun();

    expect(runA.runId, "two runs must not share an identity").not.toBe(runB.runId);

    const [startedA, startedB] = await Promise.all([
      runA.start({ inputData: { bookingId: BOOKING_A, userId: USER_ID } }),
      runB.start({ inputData: { bookingId: BOOKING_B, userId: USER_ID } }),
    ]);

    // Surface the engine's own error when a run does not reach the suspension,
    // so a failure here is diagnosable without re-running under a debugger.
    const detail = (result: { status: string; error?: unknown }) =>
      `status=${result.status} error=${result.error instanceof Error ? result.error.message : JSON.stringify(result.error)}`;
    expect(startedA.status, `run A: ${detail(startedA)}`).toBe("suspended");
    expect(startedB.status, `run B: ${detail(startedB)}`).toBe("suspended");

    return { runA, runB, startedA, startedB };
  }

  function decidedBookingIds() {
    return vi.mocked(applyEventBookingAdminDecision).mock.calls.map((call) => call[1]);
  }

  it("holds both runs pending and applies nothing before a human answers", async () => {
    const { startedA, startedB } = await suspendTwoRuns();

    expect(startedA.status).toBe("suspended");
    expect(startedB.status).toBe("suspended");
    // No business side effect may execute before the matching approval.
    expect(applyEventBookingAdminDecision).not.toHaveBeenCalled();
  });

  it("approving A applies only A and leaves B independently pending", async () => {
    const { runA, runB } = await suspendTwoRuns();

    const resumedA = await runA.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "approved", actorId: ACTOR_ID },
    });
    expect(resumedA.status).toBe("success");

    // Exactly one decision, and it is A's.
    expect(decidedBookingIds()).toEqual([BOOKING_A]);

    // B was untouched by A's approval: it still had its own suspension to
    // answer, and answering it applies only B.
    const resumedB = await runB.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "declined", actorId: ACTOR_ID, declineReason: "Venue unavailable" },
    });
    expect(resumedB.status).toBe("success");
    expect(decidedBookingIds()).toEqual([BOOKING_A, BOOKING_B]);
  });

  it("rejecting B affects only B", async () => {
    const { runA, runB } = await suspendTwoRuns();

    const resumedB = await runB.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "declined", actorId: ACTOR_ID, declineReason: "Venue unavailable" },
    });
    expect(resumedB.status).toBe("success");
    expect(decidedBookingIds()).toEqual([BOOKING_B]);

    // A is still pending and still answers with A's decision.
    const resumedA = await runA.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "approved", actorId: ACTOR_ID },
    });
    expect(resumedA.status).toBe("success");
    expect(decidedBookingIds()).toEqual([BOOKING_B, BOOKING_A]);
  });

  it("does not apply one run's decision twice", async () => {
    const { runA } = await suspendTwoRuns();

    await runA.resume({
      step: "suspend-for-admin-review",
      resumeData: { decision: "approved", actorId: ACTOR_ID },
    });
    expect(decidedBookingIds()).toEqual([BOOKING_A]);

    // Re-answering the same run must not produce a second business transition.
    await runA
      .resume({
        step: "suspend-for-admin-review",
        resumeData: { decision: "approved", actorId: ACTOR_ID },
      })
      .catch(() => undefined);

    expect(decidedBookingIds()).toEqual([BOOKING_A]);
  });
});
