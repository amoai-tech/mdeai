import { toDetailRental } from "@/lib/rentals/chat-rental-detail";
import type { RentalAskResults } from "@/components/rentals/rental-ask-composer";

/**
 * Keep the last Ask MDE answer in the tab so a refresh restores the cards the renter was looking at,
 * not the full catalogue.
 *
 * The saved thread restores the messages; the page's result set is separate state. Persist it per
 * tab thread (sessionStorage) and only reuse it when the URL filters are unchanged. A different
 * account or a filter change therefore never inherits another search's cards.
 */
const PREFIX = "mde:rental-ask-results:v1:";

export type AskFilterSignatureInput = {
  neighborhood?: string | null;
  beds?: string | null;
  from?: string | null;
  through?: string | null;
};

export function askFilterSignature(input: AskFilterSignatureInput): string {
  return JSON.stringify([
    input.neighborhood ?? null,
    input.beds ?? null,
    input.from ?? null,
    input.through ?? null,
  ]);
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isAskResults(value: unknown): value is RentalAskResults {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RentalAskResults>;
  return (
    Array.isArray(candidate.results) &&
    candidate.results.every((row) => toDetailRental(row) !== null) &&
    typeof candidate.total === "number" &&
    Number.isFinite(candidate.total) &&
    candidate.total >= candidate.results.length &&
    typeof candidate.query === "string"
  );
}

export function readStoredAskResults(
  threadId: string | null | undefined,
  signature: string,
): RentalAskResults | null {
  if (!threadId) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + threadId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { signature?: unknown; payload?: unknown };
    if (parsed.signature !== signature || !isAskResults(parsed.payload)) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writeStoredAskResults(
  threadId: string | null | undefined,
  signature: string,
  payload: RentalAskResults,
): void {
  if (!threadId) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + threadId, JSON.stringify({ signature, payload }));
  } catch {
    // Storage can be full or denied; the conversation still works without card restoration.
  }
}

export function clearStoredAskResults(threadId: string | null | undefined): void {
  if (!threadId) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + threadId);
  } catch {
    // ignore
  }
}
