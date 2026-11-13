/**
 * moderate-asset — Supabase Edge Function
 *
 * Moderates contestant photos uploaded during the intake wizard using
 * Gemini Flash multimodal analysis. Returns a label (clean | flagged | rejected)
 * with categories, confidence, and a plain-English reason.
 *
 * Auth:    Bearer JWT required
 * Input:   { storage_path: string, entity_id?: string, bio?: string }
 * Output:  { success: true, data: { label, categories_flagged, confidence, reason } }
 * Fallback: if Gemini is unavailable, returns unavailable/0-confidence without blocking development uploads
 */

import { callGeminiStructured, withRetry } from "../_shared/gemini.ts";
import { insertAiRun } from "../_shared/ai-runs.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getCorsHeaders, jsonResponse, errorBody } from "../_shared/http.ts";
import { getUserId, getServiceClient } from "../_shared/supabase-clients.ts";
import { validStoragePath, canReadModerationPhoto, canWriteEntityModeration, unavailableModerationResult, validModerationResult } from "./security.ts";

type ModerationLabel = "clean" | "flagged" | "rejected" | "unavailable";

interface ModerationResult {
  label: ModerationLabel;
  categories_flagged: string[];
  confidence: number;
  reason: string;
}

interface RequestBody {
  storage_path: string;
  entity_id?: string;
  bio?: string;
}

const BUCKET = "listing-photos";

const SYSTEM_INSTRUCTION = `You are a content moderation assistant for mdeai.co, a Medellín beauty pageant platform. Review the provided image for policy violations.

Policy rules:
- REJECT: explicit nudity, sexual content, minors in inappropriate situations, illegal content
- FLAG: borderline nudity (swimsuit ok for pageant context but flag for admin), multiple faces in hero shot, heavy text overlay, low image quality
- CLEAN: professional photos, headshots, swimsuit (pageant context), evening gown photos, casual portraits

Important:
- Beauty pageants include swimsuit categories — flag but don't auto-reject swimsuit photos
- Multiple faces should be flagged (hero shot should be solo)
- Brand logos/text in photo = flag for brand_conflict review
- Never fabricate. Rate only what you can see.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: ["clean", "flagged", "rejected"] },
    categories_flagged: { type: "array", items: { type: "string" } },
    confidence: { type: "number", description: "0.0 to 1.0" },
    reason: { type: "string", description: "Plain-English reason for the label" },
  },
  required: ["label", "categories_flagged", "confidence", "reason"],
};

const FALLBACK_RESULT: ModerationResult = unavailableModerationResult();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "Use POST"), 405, req);
  }

  const authHeader = req.headers.get("Authorization");
  const userId = await getUserId(authHeader, undefined);
  if (!userId) {
    return jsonResponse(errorBody("UNAUTHORIZED", "Missing or invalid auth token"), 401, req);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(errorBody("BAD_REQUEST", "Request body must be valid JSON"), 400, req);
  }

  const { storage_path, entity_id, bio } = body;

  if (!validStoragePath(storage_path)) {
    return jsonResponse(errorBody("BAD_REQUEST", "Invalid storage_path"), 400, req);
  }
  if (entity_id !== undefined &&
      (typeof entity_id !== "string" ||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entity_id))) {
    return jsonResponse(errorBody("BAD_REQUEST", "Invalid entity_id"), 400, req);
  }

  const serviceClient = getServiceClient();
  // The caller must own the uploaded object (folder policy) or hold a real
  // server-side admin role. Client-supplied paths cannot authorize themselves.
  const { data: adminRole, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .or("expires_at.is.null,expires_at.gt.now()")
    .limit(1)
    .maybeSingle();
  if (roleError) {
    return jsonResponse(errorBody("AUTH_LOOKUP_FAILED", "Unable to check permissions"), 503, req);
  }
  const isAdmin = !!adminRole;
  if (!canReadModerationPhoto(storage_path, userId, isAdmin)) {
    return jsonResponse(errorBody("FORBIDDEN", "Photo does not belong to caller"), 403, req);
  }

  // This query must run before signing the photo URL or invoking Gemini.
  // Even a validly owned photo cannot be used to update someone else's entity.
  if (entity_id) {
    const { data: entity, error: entityError } = await serviceClient
      .schema("vote")
      .from("entities")
      .select("id, created_by_user_id")
      .eq("id", entity_id)
      .maybeSingle();
    if (entityError) {
      return jsonResponse(errorBody("DB_ERROR", "Cannot resolve contestant"), 503, req);
    }
    if (!entity) {
      return jsonResponse(errorBody("NOT_FOUND", "Contestant not found"), 404, req);
    }
    if (!canWriteEntityModeration(userId, entity.created_by_user_id, isAdmin)) {
      return jsonResponse(errorBody("FORBIDDEN", "Contestant does not belong to caller"), 403, req);
    }
  }

  // Analyze only authorized Storage bytes; never give Gemini a private signed URL.
  const { data: photo, error: photoError } = await serviceClient.storage
    .from(BUCKET)
    .download(storage_path);
  if (photoError || !photo) {
    return jsonResponse(errorBody("STORAGE_ERROR", "Could not load stored photo"), 502, req);
  }
  const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!acceptedTypes.includes(photo.type) || photo.size > 10 * 1024 * 1024) {
    return jsonResponse(errorBody("UNSUPPORTED_ASSET", "Photo must be a supported image under 10 MB"), 415, req);
  }
  const inlineImage = { mimeType: photo.type, data: encodeBase64(await photo.arrayBuffer()) };
  const moderationStart = Date.now();
  let moderationResult: ModerationResult;
  let geminiStatus: "success" | "error" = "success";

  try {
    const geminiResult = await withRetry(() =>
      callGeminiStructured<ModerationResult>({
        agentName: "moderate-asset",
        model: "gemini-3-flash-preview",
        prompt: `Review the attached contestant photo for a beauty pageant application.${bio ? ` Context supplied by the contestant: "${bio}"` : ""}`,
        inlineImage,
        systemInstruction: SYSTEM_INSTRUCTION,
        responseJsonSchema: OUTPUT_SCHEMA,
        thinkingLevel: "low",
        timeoutMs: 20_000,
      })
    );
    if (!validModerationResult(geminiResult.data)) {
      throw new Error("SCHEMA_VIOLATION: invalid moderation verdict or confidence");
    }
    // Confidence in the model decision never changes a clean result into rejection.
    moderationResult = geminiResult.data;
  } catch (_err) {
    geminiStatus = "error";
    moderationResult = FALLBACK_RESULT;
  }

  const duration_ms = Date.now() - moderationStart;

  if (entity_id) {
    let updateQuery = serviceClient
      .schema("vote")
      .from("entities")
      .update({
        ai_moderation_status: moderationResult.label,
        ai_moderation_categories: moderationResult.categories_flagged,
        // A failed model call must not masquerade as a completed review.
        ai_moderation_at: geminiStatus === "success" ? new Date().toISOString() : null,
      })
      .eq("id", entity_id);
    // Recheck ownership in the UPDATE predicate to prevent a transfer race.
    if (!isAdmin) updateQuery = updateQuery.eq("created_by_user_id", userId);
    const { data: updated, error: updateError } = await updateQuery.select("id");
    if (updateError || updated?.length !== 1) {
      return jsonResponse(errorBody("DB_ERROR", "Could not save moderation status"), 503, req);
    }
  }

  // Public ai_runs requires agent_type and input_data; redact bio and image bytes.
  await insertAiRun(serviceClient, {
    user_id: userId,
    agent_name: "moderate-asset",
    agent_type: "general_concierge",
    input_data: { storage_path, entity_id: entity_id ?? null, has_bio: Boolean(bio) },
    duration_ms,
    status: geminiStatus,
    input_tokens: 0,
    output_tokens: 0,
  });

  return jsonResponse({ success: true, data: moderationResult }, 200, req);
});
