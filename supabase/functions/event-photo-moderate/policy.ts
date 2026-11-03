/** Pure security and model-result checks for event-photo-moderate. */
export interface StoredEventAsset {
  event_id: string;
  asset_type: string;
}

export interface StoredEvent {
  id: string;
  organizer_id: string | null;
}

export function canAnalyzeEventAsset(
  userId: string,
  event: StoredEvent,
  asset: StoredEventAsset,
  isAdmin: boolean,
): boolean {
  return asset.event_id === event.id &&
    (event.organizer_id === userId || isAdmin);
}

const VERDICTS = new Set(["approved", "rejected", "manual_review"]);

/** Missing/invalid scores are not a clean verdict; reject the model response. */
export function isValidModerationResult(value: unknown): value is {
  verdict: "approved" | "rejected" | "manual_review";
  flags: string[];
  reasons: string[];
  ai_moderation_score: number;
} {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.verdict === "string" &&
    VERDICTS.has(item.verdict) &&
    Array.isArray(item.flags) &&
    item.flags.every((flag) => typeof flag === "string") &&
    Array.isArray(item.reasons) &&
    item.reasons.every((reason) => typeof reason === "string") &&
    typeof item.ai_moderation_score === "number" &&
    Number.isFinite(item.ai_moderation_score) &&
    item.ai_moderation_score >= 0 && item.ai_moderation_score <= 1;
}
