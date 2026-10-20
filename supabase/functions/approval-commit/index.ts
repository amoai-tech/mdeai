import { getCorsHeaders, errorBody, jsonResponse } from "../_shared/http.ts";
import { getUserClient, getUserId } from "../_shared/supabase-clients.ts";
import { slugifyEventTitle } from "./slugify.ts";
import { buildEventInsert } from "./build-event-insert.ts";
import { sha256 } from "./review-receipt.ts";

const jr = jsonResponse;

type DraftPayload = {
  title?: string;
  neighborhood?: string;
  dateIso?: string;
  venue?: string;
  priceMinCop?: number;
  capacity?: number;
  description?: string;
  coverPhotoPath?: string;
  ticketTiers?: Array<{ name: string; priceCop: number; quantity: number }>;
};

type Body = {
  decision?: string;
  draft?: DraftPayload;
  approvalRequestId?: string;
  proposalId?: string;
  baseVersion?: string;
  draftHash?: string;
  reason?: string;
};

const VALID_DECISIONS = new Set(["approved", "edit", "rejected"]);

/** Stable error codes raised by public.publish_event_tx (or Postgres itself). */
const PUBLISH_CODES = new RegExp(
  "AUTH_REQUIRED|FOREIGN_PROPOSAL|DRAFT_CHANGED|DECISION_CONFLICT|" +
    "PROPOSAL_NOT_FOUND|INVALID_[A-Z_]+",
);

function httpStatusFor(errorCode: string | undefined): number {
  switch (errorCode) {
    case "28000":
      return 401;
    case "42501":
    case "23503":
      return 403;
    case "22023":
    case "22P02":
    case "22003":
    case "23502":
    case "23514":
      return 400;
    case "23505":
    case "P0001":
      return 409;
    default:
      return 500;
  }
}

function failureResponse(
  error: { code?: string; message?: string },
  req: Request,
): Response {
  const status = httpStatusFor(error.code);

  if (error.code === "23505") {
    return jr(
      errorBody(
        "SLUG_CONFLICT",
        "That event link is already in use. Try publishing again.",
      ),
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

  const code = error.message?.match(PUBLISH_CODES)?.[0] ?? "PUBLISH_FAILED";
  return jr(
    errorBody(code, status >= 500 ? "Could not publish event" : code),
    status,
    req,
  );
}

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
    return jr(
      errorBody("VALIDATION_ERROR", "decision must be approved, edit, or rejected"),
      400,
      req,
    );
  }

  const draft = body.draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return jr(errorBody("VALIDATION_ERROR", "draft is required"), 400, req);
  }

  // Edit / cancel are local UX decisions, not business approval gates: they
  // write nothing. This also keeps the receipt UI's "nothing was written" copy
  // literally true.
  if (decision !== "approved") {
    return jr(
      {
        success: true,
        decision,
        eventId: null,
        slug: null,
        approvalRequestId: body.approvalRequestId ?? null,
      },
      200,
      req,
    );
  }

  if (!body.proposalId) {
    return jr(
      errorBody("VALIDATION_ERROR", "proposalId is required to publish"),
      400,
      req,
    );
  }
  if (!draft.title?.trim() || !draft.dateIso) {
    return jr(
      errorBody("VALIDATION_ERROR", "title and dateIso are required to publish"),
      400,
      req,
    );
  }

  // Exact-draft guard: the approved draft must be the one the host reviewed.
  if (body.draftHash && (await sha256(draft)) !== body.draftHash) {
    return jr(
      errorBody(
        "DRAFT_CHANGED",
        "This draft changed after review. Start a new review.",
      ),
      409,
      req,
    );
  }

  // One server-owned transaction writes approval claim + decision + event +
  // ticket tiers + receipt. The user's JWT is forwarded so auth.uid() is the
  // verified caller inside the SECURITY DEFINER function; no service role and no
  // second write can leave partial publish state behind.
  const { data, error } = await getUserClient(authHeader).rpc("publish_event_tx", {
    p_proposal_id: body.proposalId,
    p_draft: draft,
    p_event: buildEventInsert(draft, userId, slugifyEventTitle(draft.title)),
  });

  if (error) {
    return failureResponse(error, req);
  }

  const receipt = data as {
    eventId?: unknown;
    slug?: unknown;
    proposalId?: unknown;
    approvalRequestId?: unknown;
  } | null;

  if (
    typeof receipt?.eventId !== "string" ||
    typeof receipt.slug !== "string" ||
    typeof receipt.approvalRequestId !== "string"
  ) {
    return jr(
      errorBody(
        "INVALID_RECEIPT",
        "The event was saved but no durable receipt was returned.",
      ),
      502,
      req,
    );
  }

  return jr(
    {
      success: true,
      decision,
      eventId: receipt.eventId,
      slug: receipt.slug,
      proposalId: receipt.proposalId,
      approvalRequestId: receipt.approvalRequestId,
    },
    200,
    req,
  );
});
