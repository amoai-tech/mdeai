// Exact-draft hashing for the publish review.
//
// The durable receipt format is now owned by public.publish_event_tx (SQL); this
// module only reproduces the client's canonical draft hash inside the Deno edge
// function so a changed draft is rejected before any database write.

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
    .join(",")}}`;
}

const IDENTITY_FIELDS = new Set(["approvalRequestId", "publishedEventId", "publishedSlug", "status"]);

export function normalizeReviewDraft(draft: unknown): unknown {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return draft;
  return Object.fromEntries(
    Object.entries(draft as Record<string, unknown>).filter(([key]) => !IDENTITY_FIELDS.has(key)),
  );
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(normalizeReviewDraft(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
