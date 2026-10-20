import { getCorsHeaders, errorBody, jsonResponse } from "../_shared/http.ts";
import { getUserClient, getUserId } from "../_shared/supabase-clients.ts";
import { slugifyEventTitle } from "./slugify.ts";
import { sha256 } from "./review-receipt.ts";

const jr = jsonResponse;

/** Map a database publish error to a truthful HTTP status and stable code. */
function publishFailureResponse(
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
  return jr(errorBody(code, status >= 500 ? "Could not publish event" : code), status, req);
}


type DraftPayload = {
  title?: string;
  neighborhood?: string;
  dateIso?: string;
  venue?: string;
  priceMinCop?: number;
  capacity?: number;
  description?: string;
  ticketTiers?: Array<{ name: string; priceCop: number; quantity: number }>;
};

type Body = {
  decision?: string;
  draft?: DraftPayload;
  approvalRequestId?: string;
  proposalId?: string;
  baseVersion?: string;
  draftHash?: string;
};

const VALID_DECISIONS = new Set(["approved", "edit", "rejected"]);

/** One consequential mutation: public.publish_event_tx owns the atomic commit. */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jr(errorBody("METHOD_NOT_ALLOWED", "POST only"), 405, req);
  }

  const authHeader = req.headers.get("Authorization");
  const userId = await getUserId(authHeader);
  if (!userId || !authHeader) {
    return jr(errorBody("UNAUTHORIZED", "Sign in required"), 401, req);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jr(errorBody("BAD_REQUEST", "Invalid JSON"), 400, req);
  }
  const decision = body.decision ?? "";
  if (!VALID_DECISIONS.has(decision)) {
    return jr(errorBody("VALIDATION_ERROR", "Invalid review decision"), 400, req);
  }
  const draft = body.draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return jr(errorBody("VALIDATION_ERROR", "Draft is required"), 400, req);
  }

  // Edit/Cancel are local user decisions, never business approval gates.
  // In particular, do not write a fake 'edit' value to approval_decisions:
  // the live CHECK permits 'request_changes', not 'edit'.
  if (decision !== "approved") {
    return jr({
      success: true,
      decision,
      eventId: null,
      slug: null,
      approvalRequestId: body.approvalRequestId ?? null,
    }, 200, req);
  }

  if (!draft.title?.trim() || !draft.dateIso || !body.proposalId) {
    return jr(errorBody("VALIDATION_ERROR", "title, dateIso and proposalId are required"), 400, req);
  }
  if (body.draftHash && (await sha256(draft)) !== body.draftHash) {
    return jr(errorBody("DRAFT_CHANGED", "Event changed after review. Review it again."), 409, req);
  }

  // Forward the authenticated user's JWT. Service-role RPC calls would lose
  // auth.uid(), undermining user-scoped authorization inside the SQL function.
  const { data, error } = await getUserClient(authHeader).rpc("publish_event_tx", {
    p_proposal_id: body.proposalId,
    p_draft: draft,
    p_slug: slugifyEventTitle(draft.title),
  });

  if (error) {
    return publishFailureResponse(error, req);
  }

  const receipt = data as {
    eventId?: unknown;
    slug?: unknown;
    proposalId?: unknown;
    approvalRequestId?: unknown;
  } | null;
  if (typeof receipt?.eventId !== "string" ||
      typeof receipt.slug !== "string" ||
      typeof receipt.approvalRequestId !== "string") {
    return jr(errorBody("INVALID_RECEIPT", "Database returned no durable event receipt"), 502, req);
  }
  return jr({
    success: true,
    decision,
    eventId: receipt.eventId,
    slug: receipt.slug,
    proposalId: receipt.proposalId,
    approvalRequestId: receipt.approvalRequestId,
  }, 200, req);
});
