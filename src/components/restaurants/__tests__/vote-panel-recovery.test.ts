import { describe, expect, it } from "vitest";
import { resolveSavedVote } from "../vote-panel-recovery";

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const VOTE = "33333333-3333-4333-8333-333333333333";

describe("resolveSavedVote", () => {
  it("only an explicit null receipt proves there is no ballot", () => {
    expect(resolveSavedVote(200, { receipt: null }, TARGET)).toEqual({ kind: "none" });
  });

  it("treats a missing receipt property as unknown, never as no ballot", () => {
    expect(resolveSavedVote(200, {}, TARGET).kind).toBe("unknown");
    expect(resolveSavedVote(200, null, TARGET).kind).toBe("unknown");
    expect(resolveSavedVote(200, "nope", TARGET).kind).toBe("unknown");
  });

  it("treats a malformed receipt as unknown, never as no ballot", () => {
    expect(resolveSavedVote(200, { receipt: { vote_id: "not-a-uuid", entity_id: TARGET } }, TARGET).kind).toBe("unknown");
    expect(resolveSavedVote(200, { receipt: { vote_id: VOTE } }, TARGET).kind).toBe("unknown");
    expect(resolveSavedVote(200, { receipt: 42 }, TARGET).kind).toBe("unknown");
  });

  it("returns a fully typed receipt for the target restaurant", () => {
    expect(resolveSavedVote(200, { receipt: { vote_id: VOTE, entity_id: TARGET, created_at: "2026-10-16T00:00:00Z", status: "cast" } }, TARGET))
      .toEqual({ kind: "receipt", receipt: { voteId: VOTE, entityId: TARGET, createdAt: "2026-10-16T00:00:00Z", status: "cast" } });
  });

  it("reports another restaurant so the CTA can be hidden", () => {
    expect(resolveSavedVote(200, { receipt: { vote_id: VOTE, entity_id: OTHER, restaurant_name: "Carmen" } }, TARGET))
      .toEqual({ kind: "already-voted", restaurantName: "Carmen" });
  });

  it("requires sign-in on 401 and unknown on 502/503", () => {
    expect(resolveSavedVote(401, null, TARGET).kind).toBe("sign-in");
    expect(resolveSavedVote(502, null, TARGET).kind).toBe("unknown");
    expect(resolveSavedVote(503, null, TARGET).kind).toBe("unknown");
  });
});