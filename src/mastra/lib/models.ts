import { google } from "@ai-sdk/google";
import { GEMINI_FLASH_MODEL_ID } from "@/lib/ai-model-ids";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * Development-phase default: **gemini-3.5-flash-lite** (all agents).
 *
 * The id itself lives in `src/lib/ai-model-ids.ts` so that call sites which
 * cannot import this module — `flash-route-classifier.ts` is reachable from the
 * client chat bundle, and this file reaches `node:async_hooks` through the
 * token-usage sink — still share one source of identity. Switching back to
 * `gemini-3.5-flash` is a one-line change there.
 *
 * Verified before changing rather than assumed from memory:
 *
 *   - `gemini-3.5-flash-lite` is a **stable** model id and served a live
 *     `generateContent` call (HTTP 200, `modelVersion: gemini-3.5-flash-lite`);
 *   - the official model page reports **function calling** and **structured
 *     outputs** as supported, which is what MDE's tools and `generateObject`
 *     call sites require. Image generation, Live API and audio generation are
 *     *not* supported by it — these agents do not use them.
 *
 * Wrapped with COST-001 token-usage tracking so every agent model call records
 * its Gemini token usage into the active per-turn sink (token-usage-middleware).
 * The wrapper is transparent — same LanguageModelV2 contract, no behavior change.
 *
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
 */
export const FLASH_MODEL = withTokenUsageTracking(
  google(GEMINI_FLASH_MODEL_ID),
);
export const PRO_MODEL = withTokenUsageTracking(
  google("gemini-3.1-pro-preview"),
);

/** Legacy aliases (my-mastra-app used string IDs; mdeapp uses AI SDK) */
export const CONCIERGE_MODEL = FLASH_MODEL;
export const REASONING_MODEL = FLASH_MODEL;
export const PLANNING_MODEL = FLASH_MODEL;
