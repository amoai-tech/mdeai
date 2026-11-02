/**
 * event-photo-moderate — Gemini multimodal moderation for event assets.
 *
 * POST /functions/v1/event-photo-moderate
 *
 * Auth: Bearer JWT required (organizers + admins only).
 * Model: gemini-3-flash-preview with trusted Supabase Storage image bytes.
 *
 * Pure validator — returns verdict; caller decides what to persist.
 * Per-asset_type system prompts tune sensitivity for logos vs photos.
 *
 * Response envelope: { success: true, data: { verdict, flags, reasons, ai_moderation_score, model, duration_ms } }
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { errorBody, getCorsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  getServiceClient,
  getUserClient,
  getUserId,
} from "../_shared/supabase-clients.ts";
import { callGeminiStructured } from "../_shared/gemini.ts";
import { insertAiRun } from "../_shared/ai-runs.ts";
import { canAnalyzeEventAsset, isValidModerationResult } from "./policy.ts";

const AGENT_NAME = "event-photo-moderate";
const MODEL = "gemini-3-flash-preview" as const;

// Input schema
const requestSchema = z.object({
  asset_id: z.string().uuid(),
  // Legacy request fields remain accepted for old callers but are NEVER
  // authorization facts or image sources. Only persisted assets are analyzed.
  asset_type: z.string().max(80).optional(),
  storage_url: z.string().url().max(2000).optional(),
  context: z.object({
    event_name: z.string().max(200).optional(),
    event_type: z.string().max(80).optional(),
    organizer_id: z.string().uuid().optional(),
  }).optional(),
});

// Per-asset-type system prompts — tuned for event platform context
const SYSTEM_PROMPTS: Record<string, string> = {
  hero_photo:
    `You are a content moderator for mdeai.co, a Medellín-based events platform.
Review this event hero photo. Approve if it depicts a venue, crowd, performers, or event atmosphere.
Reject for: nudity, graphic violence, illegal substances visible, explicit drug paraphernalia.
Flag 'low_quality' if the image is clearly below 800px on the long edge or extremely blurry.
Flag 'text_heavy' if the image is primarily advertising text rather than a photo.`,

  gallery_photo:
    `You are a content moderator for mdeai.co, a Medellín events platform.
Review this gallery photo from an event. Approve professional event photography.
Reject for: nudity, graphic violence, minors in inappropriate contexts, illegal substances.
Minor blurriness or text overlays are acceptable for gallery photos.`,

  flyer: `You are a content moderator for mdeai.co, a Medellín events platform.
Review this event flyer. Flyers are EXPECTED to be text-heavy — do NOT flag for text.
Approve standard event promotional materials. Reject for: explicit nudity, graphic violence, illegal-substance glorification.
Brand logos and promotional imagery are acceptable.`,

  sponsor_logo:
    `You are a content moderator for mdeai.co, a Medellín events platform.
Review this sponsor brand logo. Logos are stylized brand marks — approve clean, professional marks.
Reject for: explicit imagery, offensive symbols, hate speech, or alcohol/tobacco brand marks conflicting with event policies.
Text-heavy brand logos are fine. Stylization, abstract art, and wordmarks are all acceptable.`,

  speaker_photo:
    `You are a content moderator for mdeai.co, a Medellín events platform.
Review this speaker/performer headshot. Approve professional photos of individuals.
Reject for: nudity, explicit content, imagery of illegal activity.
The photo should clearly show a person in a professional or semi-professional context.`,

  other: `You are a content moderator for mdeai.co, a Medellín events platform.
Review this event-related image. Approve standard event content.
Reject for: nudity, graphic violence, minors in inappropriate situations, explicit drug content.`,
};

// Structured output schema (G1-compliant)
const moderationSchema = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["approved", "rejected", "manual_review"],
      description: "Final moderation verdict",
    },
    flags: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "nudity",
          "minors",
          "gore",
          "drugs",
          "brand_conflict",
          "low_quality",
          "text_heavy",
          "other",
        ],
      },
      description: "Content flags found (empty array if none)",
    },
    reasons: {
      type: "array",
      items: { type: "string" },
      description:
        "Human-readable explanation for each flag or the approval decision",
    },
    ai_moderation_score: {
      type: "number",
      description: "Content safety score from 0.0 (unsafe) to 1.0 (clean)",
    },
  },
  required: ["verdict", "flags", "reasons", "ai_moderation_score"],
};

Deno.serve(async (req) => {
  const jr = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(body, status, req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jr(errorBody("METHOD_NOT_ALLOWED", "Use POST"), 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jr(errorBody("UNAUTHORIZED", "Bearer token required"), 401);
  }

  const userId = await getUserId(authHeader);
  if (!userId) {
    return jr(errorBody("UNAUTHORIZED", "Invalid or expired token"), 401);
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch (err) {
    return jr(
      errorBody(
        "VALIDATION_ERROR",
        "Invalid request body",
        err instanceof z.ZodError ? err.errors : String(err),
      ),
      400,
    );
  }

  // The caller has a valid JWT, but a JWT does not authorize arbitrary URLs
  // or other organizers' assets. Use trusted database relationships first.
  const serviceClient = getServiceClient();
  const { data: asset, error: assetErr } = await serviceClient
    .from("event_media_assets")
    .select(
      "id, event_id, asset_type, storage_bucket, storage_path, mime_type, size_bytes",
    )
    .eq("id", body.asset_id)
    .maybeSingle();
  if (assetErr) {
    console.error("event-photo-moderate asset lookup:", assetErr.message);
    return jr(errorBody("DB_ERROR", "Unable to load asset"), 500);
  }
  if (!asset) return jr(errorBody("ASSET_NOT_FOUND", "Asset not found"), 404);

  const { data: event, error: eventErr } = await serviceClient
    .from("events")
    .select("id, organizer_id, name")
    .eq("id", asset.event_id)
    .maybeSingle();
  if (eventErr) {
    console.error("event-photo-moderate event lookup:", eventErr.message);
    return jr(errorBody("DB_ERROR", "Unable to load event"), 500);
  }
  if (!event) return jr(errorBody("EVENT_NOT_FOUND", "Event not found"), 404);

  let isAdmin = false;
  if (event.organizer_id !== userId) {
    // public.is_admin() uses auth.uid() + trusted user_roles, not user metadata.
    const { data: permitted, error: roleErr } = await getUserClient(authHeader)
      .rpc("is_admin");
    if (roleErr) {
      console.error("event-photo-moderate admin auth check:", roleErr.message);
      return jr(errorBody("AUTH_ERROR", "Unable to verify access"), 500);
    }
    isAdmin = permitted === true;
  }
  if (!canAnalyzeEventAsset(userId, event, asset, isAdmin)) {
    return jr(errorBody("FORBIDDEN", "Cannot analyze this event asset"), 403);
  }

  // Prevent unexpected non-image files and costly oversized Gemini requests.
  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);
  if (
    !allowedTypes.has(asset.mime_type) || !asset.storage_bucket ||
    !asset.storage_path || asset.size_bytes > 10 * 1024 * 1024
  ) {
    return jr(
      errorBody("UNSUPPORTED_ASSET", "Unsupported or oversized event image"),
      415,
    );
  }

  // Fetch via a fixed Supabase Storage API, not from a supplied URL (SSRF).
  const { data: imageBlob, error: imageErr } = await serviceClient.storage
    .from(asset.storage_bucket)
    .download(asset.storage_path);
  if (imageErr || !imageBlob) {
    console.error("event-photo-moderate storage download:", imageErr?.message);
    return jr(errorBody("STORAGE_ERROR", "Unable to load stored image"), 502);
  }
  if (imageBlob.size > 10 * 1024 * 1024) {
    return jr(
      errorBody(
        "UNSUPPORTED_ASSET",
        "Stored image exceeds analysis size limit",
      ),
      413,
    );
  }
  const inlineImage = {
    mimeType: asset.mime_type as string,
    data: new Uint8Array(await imageBlob.arrayBuffer()).toBase64(),
  };
  const systemPrompt = SYSTEM_PROMPTS[asset.asset_type] ?? SYSTEM_PROMPTS.other;
  const userPrompt = "Event: " + event.name +
    ". Analyze the attached stored image. Asset type: " + asset.asset_type;

  const startTime = Date.now();
  try {
    const result = await callGeminiStructured<{
      verdict: "approved" | "rejected" | "manual_review";
      flags: string[];
      reasons: string[];
      ai_moderation_score: number;
    }>({
      model: MODEL,
      agentName: AGENT_NAME,
      systemInstruction: systemPrompt,
      prompt: userPrompt,
      inlineImage,
      responseJsonSchema: moderationSchema,
      thinkingLevel: "low",
      timeoutMs: 25_000,
    });

    if (!isValidModerationResult(result.data)) {
      throw new Error(
        "SCHEMA_VIOLATION: invalid or missing moderation score/verdict",
      );
    }
    const duration_ms = Date.now() - startTime;

    // Log ai_run (best-effort, never throws)
    await insertAiRun(serviceClient, {
      user_id: userId,
      agent_name: AGENT_NAME,
      agent_type: "event_curator",
      input_data: {
        asset_id: body.asset_id,
        asset_type: asset.asset_type,
        event_name: event.name,
      },
      output_data: result.data as Record<string, unknown>,
      duration_ms,
      status: "success",
      model_name: MODEL,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      total_tokens: result.usage.total_tokens,
    });

    return jr({
      success: true,
      data: {
        verdict: result.data.verdict,
        flags: result.data.flags,
        reasons: result.data.reasons,
        ai_moderation_score: result.data.ai_moderation_score,
        model: MODEL,
        duration_ms,
      },
    });
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.message === "GEMINI_TIMEOUT";
    const isSchemaError = err instanceof Error &&
      err.message.startsWith("SCHEMA_VIOLATION");
    const errMsg = err instanceof Error ? err.message : String(err);

    console.error(`${AGENT_NAME} error:`, errMsg);

    await insertAiRun(serviceClient, {
      user_id: userId,
      agent_name: AGENT_NAME,
      agent_type: "event_curator",
      input_data: { asset_id: body.asset_id, asset_type: asset.asset_type },
      duration_ms,
      status: isTimeout ? "timeout" : "error",
      model_name: MODEL,
      error_message: errMsg,
    });

    return jr(
      errorBody(
        isTimeout
          ? "TIMEOUT"
          : isSchemaError
          ? "INVALID_MODEL_RESULT"
          : "MODERATION_ERROR",
        isTimeout
          ? "Moderation timed out — try again."
          : "Moderation result unavailable.",
      ),
      isTimeout ? 504 : isSchemaError ? 502 : 500,
    );
  }
});
