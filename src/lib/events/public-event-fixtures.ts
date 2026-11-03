/** Explicit, developer-labelled QA event markers. This is not a moderation or publication gate. */
export const QA_EVENT_NAME_SQL_PATTERN =
  String.raw`^[[:space:]]*(\[?[[:space:]]*(qa|test)([[:space:]_:-]|\]|$))`;

// Do not accidentally exclude real events with NULL slugs.
// PostgREST uses * as a wildcard for ILIKE percent.
export const NON_QA_EVENT_SLUG_FILTER = "slug.is.null,slug.not.ilike.qa-*";

const QA_EVENT_TITLE_PATTERN = /^\s*\[?\s*(?:qa|test)(?:[\s_:-]|\]|$)/i;

/** Use on hybrid RPC rows, which do not allow database query-level filtering. */
export function isQaEventFixture(row: { name?: string | null; slug?: string | null }): boolean {
  return row.slug?.toLowerCase().startsWith("qa-") === true ||
    QA_EVENT_TITLE_PATTERN.test(row.name ?? "");
}
