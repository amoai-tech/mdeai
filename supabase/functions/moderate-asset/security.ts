/** Request-level checks for the existing MDE moderation handler. No approval gate. */
export function validStoragePath(path: unknown): path is string {
  return typeof path === "string" && path.length > 1 && path.length <= 1024 &&
    !path.startsWith("/") && !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function canReadModerationPhoto(path: string, userId: string, isAdmin: boolean): boolean {
  // Existing listing-photos upload policy uses the user's UUID as first folder.
  return isAdmin || path.startsWith(`${userId}/`);
}

export function canWriteEntityModeration(
  actorId: string,
  creatorId: string | null,
  isAdmin: boolean,
): boolean {
  return isAdmin || (creatorId !== null && creatorId === actorId);
}

export function unavailableModerationResult() {
  return {
    label: "unavailable" as const,
    categories_flagged: [] as string[],
    confidence: 0,
    reason: "moderation_unavailable",
  };
}

/** Confidence is certainty about the verdict, never a replacement for it. */
export function validModerationResult(value: unknown): value is {
  label: "clean" | "flagged" | "rejected";
  categories_flagged: string[];
  confidence: number;
  reason: string;
} {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (result.label === "clean" || result.label === "flagged" ||
      result.label === "rejected") &&
    Array.isArray(result.categories_flagged) &&
    result.categories_flagged.every((flag) => typeof flag === "string") &&
    typeof result.confidence === "number" &&
    Number.isFinite(result.confidence) &&
    result.confidence >= 0 && result.confidence <= 1 &&
    typeof result.reason === "string";
}
