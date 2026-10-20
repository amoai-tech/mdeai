export type Receipt = { eventId: string; slug: string; proposalId?: string | null };

export const RECEIPT_PREFIX = "MDE_RECEIPT:";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
    .join(",")}}`;
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseReceipt(notes: string | null): Receipt | null {
  if (!notes?.startsWith(RECEIPT_PREFIX)) return null;
  try {
    const value = JSON.parse(notes.slice(RECEIPT_PREFIX.length)) as Receipt;
    return typeof value?.eventId === "string" && typeof value?.slug === "string" ? value : null;
  } catch {
    return null;
  }
}
