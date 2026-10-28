import type { PublicEventFacts } from "./types";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Practical details read only from events.details; absent keys stay absent (nothing is invented). */
export function parseEventFacts(details: unknown): PublicEventFacts | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = details as Record<string, unknown>;
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.map(text).filter((h): h is string => h !== null).slice(0, 6)
    : [];
  const facts: PublicEventFacts = {
    artist: text(raw.artist),
    genre: text(raw.genre),
    ticketInfo: text(raw.ticket_info),
    listingSource: text(raw.ticket_source),
    highlights,
  };
  const hasAny = Object.values(facts).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null));
  return hasAny ? facts : null;
}
