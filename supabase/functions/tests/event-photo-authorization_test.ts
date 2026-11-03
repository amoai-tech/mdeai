import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canAnalyzeEventAsset,
  isValidModerationResult,
} from "../event-photo-moderate/policy.ts";

const organizer = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const event = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizer_id: organizer,
};
const asset = { event_id: event.id, asset_type: "hero_photo" };

Deno.test("photo analysis: organizer may analyze a stored asset in their event", () => {
  assert(canAnalyzeEventAsset(organizer, event, asset, false));
});

Deno.test("photo analysis: another signed-in user is denied", () => {
  assertFalse(canAnalyzeEventAsset(stranger, event, asset, false));
});

Deno.test("photo analysis: trusted DB admin role may analyze stored asset", () => {
  assert(canAnalyzeEventAsset(stranger, event, asset, true));
});

Deno.test("photo analysis: mismatched event and media row denied even for admin", () => {
  assertFalse(
    canAnalyzeEventAsset(
      stranger,
      event,
      { ...asset, event_id: stranger },
      true,
    ),
  );
});

Deno.test("photo analysis: untrusted request URL never overrides persisted asset ID", () => {
  const request = {
    storage_url: "https://127.0.0.1/admin",
    context: { organizer_id: stranger },
  };
  assertEquals(Object.keys(asset).includes("storage_url"), false);
  assertFalse(
    canAnalyzeEventAsset(request.context.organizer_id, event, asset, false),
  );
});

Deno.test("photo analysis: valid moderation result includes bounded numeric score", () => {
  assert(isValidModerationResult({
    verdict: "manual_review",
    flags: ["low_quality"],
    reasons: [],
    ai_moderation_score: 0,
  }));
  assert(isValidModerationResult({
    verdict: "approved",
    flags: [],
    reasons: ["Clear photo"],
    ai_moderation_score: 1,
  }));
});

Deno.test("photo analysis: missing, null, NaN, out-of-range or invalid verdict fails closed", () => {
  const valid = {
    verdict: "approved",
    flags: [],
    reasons: [],
    ai_moderation_score: 0.9,
  };
  for (
    const patch of [
      { ai_moderation_score: undefined },
      { ai_moderation_score: null },
      { ai_moderation_score: Number.NaN },
      { ai_moderation_score: -0.01 },
      { ai_moderation_score: 1.1 },
      { ai_moderation_score: "1.0" },
      { verdict: "clean" },
      { flags: [123] },
      { reasons: null },
    ]
  ) {
    assertFalse(isValidModerationResult({ ...valid, ...patch }));
  }
});
