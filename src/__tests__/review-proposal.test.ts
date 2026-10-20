import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeDraftHash,
  createReviewProposal,
  reviewReceipt,
} from "@/platform/contracts/review-proposal";

const draft = { title: "Salsa Night", capacity: 80, ticketTiers: [{ name: "GA", priceCop: 50000, quantity: 80 }] };

describe("review proposal contract", () => {
  it("canonicalizes object keys and ignores undefined values", () => {
    expect(canonicalJson({ b: 2, a: 1, skip: undefined })).toBe('{"a":1,"b":2}');
  });

  it("hashes the exact draft deterministically", async () => {
    const first = await computeDraftHash(draft);
    const reordered = { ticketTiers: draft.ticketTiers, capacity: 80, title: "Salsa Night" };
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await computeDraftHash(reordered)).toBe(first);
    expect(await computeDraftHash({ ...draft, capacity: 81 })).not.toBe(first);
  });

  it("builds a valid proposal with one stable identity", async () => {
    const proposal = await createReviewProposal({
      proposalId: "proposal-1",
      target: { kind: "event", id: "event.publish" },
      baseVersion: "draft",
      draft,
    });
    expect(proposal.proposalId).toBe("proposal-1");
    expect(proposal.draftHash).toHaveLength(64);
    expect(proposal.target).toEqual({ kind: "event", id: "event.publish" });
  });

  it("maps a published event to a visible receipt", async () => {
    const { eventPublishReceipt } = await import("@/lib/events/review-proposal");
    const receipt = eventPublishReceipt("proposal-1", { eventId: "event-1", slug: "salsa-night" });
    expect(receipt).toMatchObject({
      proposalId: "proposal-1",
      status: "saved",
      savedId: "event-1",
      readbackUrl: "/events/salsa-night",
    });
  });

  it("rejects a receipt with an unknown status", () => {
    expect(() => reviewReceipt({
      proposalId: "p",
      status: "success" as never,
      message: "x",
    })).toThrow();
  });
});
