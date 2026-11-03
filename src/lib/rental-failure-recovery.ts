/**
 * SAN-1059 · RE-FAIL-002 — Rental failure recovery matrix (user copy + telemetry tags).
 */

/**
 * The rental example shown to renters (chat welcome, timeout hint). Monthly pesos, because renters here
 * think in pesos per month. The search parses it to a COP monthly cap (see the test), so the example
 * does what it says.
 */
export const RENTAL_EXAMPLE_QUERY = "1BR in Laureles under COP 3,000,000/month";

export type RentalFailureKind =
  | "gemini_timeout"
  | "gemini_rate_limit"
  | "supabase_slow"
  | "supabase_error"
  | "agui_stream_error"
  | "map_pin_render"
  | "schedule_viewing_api"
  | "rental_search_api";

export type RentalFailureRecovery = {
  kind: RentalFailureKind;
  userMessage: string;
  telemetryTag: string;
  fallback: "retry" | "regex" | "clarify" | "degraded_map" | "agent_once";
};

const MATRIX: Record<RentalFailureKind, Omit<RentalFailureRecovery, "kind">> = {
  gemini_timeout: {
    userMessage:
      `Search is taking longer than usual. Try a simpler query like "${RENTAL_EXAMPLE_QUERY}".`,
    telemetryTag: "gemini_parse_fallback",
    fallback: "regex",
  },
  gemini_rate_limit: {
    userMessage: "We're getting a lot of requests right now. Please try again in a moment.",
    telemetryTag: "gemini_rate_limited",
    fallback: "retry",
  },
  supabase_slow: {
    userMessage: "Rental search is slower than usual. You can retry or narrow your neighborhood.",
    telemetryTag: "search_timeout",
    fallback: "clarify",
  },
  supabase_error: {
    userMessage: "We couldn't load listings right now. Please try again shortly.",
    telemetryTag: "supabase_search_failed",
    fallback: "retry",
  },
  agui_stream_error: {
    userMessage: "The chat stream was interrupted. Resend your message to continue.",
    telemetryTag: "stream_interrupted",
    fallback: "retry",
  },
  map_pin_render: {
    userMessage: "Map pins couldn't load, but your rental cards are still available above.",
    telemetryTag: "map_degraded",
    fallback: "degraded_map",
  },
  schedule_viewing_api: {
    userMessage: "We couldn't save your viewing request. Check your date and try again.",
    telemetryTag: "schedule_viewing_failed",
    fallback: "retry",
  },
  rental_search_api: {
    userMessage: "Rental search failed. Try again or simplify your filters.",
    telemetryTag: "fast_path_failed",
    fallback: "agent_once",
  },
};

export const rentalFailureRecovery = (
  kind: RentalFailureKind,
): RentalFailureRecovery => ({ kind, ...MATRIX[kind] });

export const classifyHttpStatusForRentalFailure = (
  status: number,
): RentalFailureKind => {
  if (status === 429) return "gemini_rate_limit";
  if (status >= 500) return "rental_search_api";
  if (status === 408) return "supabase_slow";
  return "rental_search_api";
};

/** Error-message substrings → failure kind, in priority order. */
const ERROR_MATCHERS: ReadonlyArray<readonly [readonly string[], RentalFailureKind]> = [
  [["429", "rate"], "gemini_rate_limit"],
  [["timeout", "timed out"], "gemini_timeout"],
  [["supabase"], "supabase_error"],
];

export const classifyRentalSearchError = (err: unknown): RentalFailureKind => {
  if (!(err instanceof Error)) return "rental_search_api";
  const message = err.message.toLowerCase();
  for (const [needles, kind] of ERROR_MATCHERS) {
    if (needles.some((needle) => message.includes(needle))) return kind;
  }
  return "rental_search_api";
};
