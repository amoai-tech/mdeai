import { describe, expect, it } from "vitest";
import { nextIdempotencyKey, parseReceipt } from "../restaurant-vote-panel";

const CONTEST = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const VOTE = "33333333-3333-3333-3333-333333333333";
const target = { contestId: CONTEST, entityId: ENTITY };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("nextIdempotencyKey", () => {
  it("reuses the stored key so a reload recovers the same ballot", () => {
    const stored = "33333333-3333-3333-3333-333333333333";
    expect(nextIdempotencyKey(stored)).toBe(stored);
  });

  it("mints a fresh, well-formed UUID when nothing usable is stored", () => {
    expect(nextIdempotencyKey(null)).toMatch(UUID_PATTERN);
    expect(nextIdempotencyKey("")).toMatch(UUID_PATTERN);
    expect(nextIdempotencyKey("not-a-uuid")).toMatch(UUID_PATTERN);
  });

  it("never reuses a stored value that is not a valid UUID", () => {
    expect(nextIdempotencyKey("not-a-uuid")).not.toBe("not-a-uuid");
  });
});

describe("parseReceipt", () => {
  it("refuses a receipt with no status instead of claiming cast", () => {
    const r = parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: ENTITY } }, target);
    expect(r).toBeNull();
  });

  it("refuses an unrecognised or failed status", () => {
    expect(parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: ENTITY, status: "failed" } }, target)).toBeNull();
    expect(parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: ENTITY, status: "pending" } }, target)).toBeNull();
  });

  it("refuses a receipt for a different restaurant in the same contest", () => {
    const otherEntity = "55555555-5555-5555-5555-555555555555";
    expect(parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: otherEntity, status: "cast" } }, target)).toBeNull();
  });

  it("refuses a receipt for a different contest or a malformed vote id", () => {
    expect(parseReceipt({ data: { vote_id: VOTE, contest_id: "44444444-4444-4444-4444-444444444444", entity_id: ENTITY, status: "cast" } }, target)).toBeNull();
    expect(parseReceipt({ data: { vote_id: "nope", contest_id: CONTEST, entity_id: ENTITY, status: "cast" } }, target)).toBeNull();
  });

  it("returns the receipt only for a recognised status", () => {
    const r = parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: ENTITY, status: "cast" } }, target);
    expect(r?.status).toBe("cast");
    expect(r?.voteId).toBe(VOTE);
    expect(parseReceipt({ data: { vote_id: VOTE, contest_id: CONTEST, entity_id: ENTITY, status: "replayed" } }, target)?.status).toBe("replayed");
  });
});