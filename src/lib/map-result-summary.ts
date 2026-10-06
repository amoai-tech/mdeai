/**
 * SAN-1422 — the chat summary may only mention map pins that exist. A search can return more cards
 * than it can pin (a result without trusted coordinates stays a usable card), so the wording follows
 * the result count and the pin count, never one standing in for the other.
 *
 * `head` is the "Found N …" clause; `pinCount` is `normalizeToolOutput(...).pins.length`.
 */
export function withMapCoverage(head: string, resultCount: number, pinCount: number): string {
  if (pinCount >= resultCount) return `${head} — see cards below and pins on the map.`;
  if (pinCount > 0) return `${head} · ${pinCount} shown on the map — see cards below.`;
  return `${head} — see cards below. Map locations aren't available for these yet.`;
}
