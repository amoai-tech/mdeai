/**
 * Pure classification of a publish failure. Kept dependency-free (no Deno or
 * HTTP imports) so the mapping can be unit-tested in Node/Vitest and reused by
 * the edge entry point.
 */
export type PublishErrorShape = { code?: string; message?: string };
export type PublishErrorClassification = {
  status: number;
  code: string;
  message: string;
};

const KNOWN_CODES = new RegExp(
  "AUTH_REQUIRED|FOREIGN_PROPOSAL|DRAFT_CHANGED|DECISION_CONFLICT|PROPOSAL_NOT_FOUND|" +
    "PUBLISH_IN_PROGRESS_OR_INCOMPLETE|INVALID_[A-Z_]+|TICKET_QUANTITY_REQUIRED",
);

export function classifyPublishError(
  error: PublishErrorShape,
): PublishErrorClassification {
  if (error.code === "23505") {
    // Only the event-slug unique index is an expected conflict. Anything else is
    // reported truthfully instead of claiming a slug conflict.
    const constraint = error.message?.match(/constraint "([^"]+)"/)?.[1] ?? "";
    return constraint.includes("events_slug")
      ? {
          status: 409,
          code: "SLUG_CONFLICT",
          message: "That event link is already in use. Try publishing again.",
        }
      : {
          status: 409,
          code: "CONFLICT",
          message: "This publish conflicted with another write. Retry shortly.",
        };
  }

  if (error.code === "23503") {
    return {
      status: 403,
      code: "PROFILE_REQUIRED",
      message: "Finish your host profile before publishing.",
    };
  }

  if (error.code === "28000") {
    return { status: 401, code: "AUTH_REQUIRED", message: "AUTH_REQUIRED" };
  }

  // Postgres datetime casts: 22007 invalid_datetime_format, 22008 field overflow.
  if (error.code === "22007" || error.code === "22008") {
    return {
      status: 400,
      code: "INVALID_EVENT_DATE",
      message: "Enter a valid event date and time.",
    };
  }

  const code = error.message?.match(KNOWN_CODES)?.[0] ?? "PUBLISH_FAILED";
  const status =
    error.code === "28000" ? 401 :
    error.code === "42501" ? 403 :
    error.code === "22023" || error.code === "22P02" || error.code === "22003" ||
    error.code === "23502" || error.code === "23514" ? 400 :
    error.code === "P0001" ? 409 : 500;

  return {
    status,
    code,
    message: status >= 500 ? "Could not publish event" : code,
  };
}
