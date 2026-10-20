import { errorBody, jsonResponse } from "../_shared/http.ts";

const jr = jsonResponse;

/**
 * Map a `public.publish_event_tx` / PostgREST error to a truthful HTTP status
 * and stable error code. Kept in its own module so the publish entry point stays
 * small and the mapping is reviewable in isolation.
 */
export function publishFailureResponse(
  error: { code?: string; message?: string },
  req: Request,
): Response {
  if (error.code === "23505") {
    // The only expected unique violation is the public event slug. Anything else
    // is reported truthfully instead of claiming a slug conflict.
    const constraint = error.message?.match(/constraint "([^"]+)"/)?.[1] ?? "";
    if (constraint.includes("events_slug")) {
      return jr(
        errorBody(
          "SLUG_CONFLICT",
          "That event link is already in use. Try publishing again.",
        ),
        409,
        req,
      );
    }
    return jr(
      errorBody("CONFLICT", "This publish conflicted with another write. Retry shortly."),
      409,
      req,
    );
  }

  if (error.code === "23503") {
    return jr(
      errorBody("PROFILE_REQUIRED", "Finish your host profile before publishing."),
      403,
      req,
    );
  }

  const known = error.message?.match(
    /AUTH_REQUIRED|FOREIGN_PROPOSAL|DRAFT_CHANGED|DECISION_CONFLICT|PROPOSAL_NOT_FOUND|PUBLISH_IN_PROGRESS_OR_INCOMPLETE|INVALID_[A-Z_]+|TICKET_QUANTITY_REQUIRED/,
  );
  const code = known?.[0] ?? "PUBLISH_FAILED";
  const status =
    error.code === "28000" ? 401 :
    error.code === "42501" ? 403 :
    error.code === "22023" || error.code === "22P02" || error.code === "22003" ||
    error.code === "23502" || error.code === "23514" ? 400 :
    error.code === "P0001" ? 409 : 500;

  return jr(
    errorBody(code, status >= 500 ? "Could not publish event" : code),
    status,
    req,
  );
}
