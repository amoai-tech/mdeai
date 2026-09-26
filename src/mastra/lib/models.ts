import { google } from "@ai-sdk/google";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * Development-phase default: **gemini-3.5-flash-lite** (all agents).
 *
 * MDE is still in development, and every agent routes through this one constant
 * (`CONCIERGE_MODEL` / `REASONING_MODEL` / `PLANNING_MODEL` all alias it), so
 * pointing it at the Lite model is the whole switch.
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
 * Switch back to `gemini-3.5-flash` when MDE leaves development; keeping this a
 * single model id is what makes that a one-line change.
 *
 * Not yet reflected in `model-cost.ts`: no verified official price exists for the
 * Lite model yet, so cost accounting falls back to the Flash rate and flags
 * `rateFallback` — the module's documented, deliberately conservative default.
 * Add the rate there once the real number is confirmed.
 *
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
 */
export const FLASH_MODEL = withTokenUsageTracking(
  google("gemini-3.5-flash-lite"),
);
export const PRO_MODEL = withTokenUsageTracking(
  google("gemini-3.1-pro-preview"),
);

/** Legacy aliases (my-mastra-app used string IDs; mdeapp uses AI SDK) */
export const CONCIERGE_MODEL = FLASH_MODEL;
export const REASONING_MODEL = FLASH_MODEL;
export const PLANNING_MODEL = FLASH_MODEL;
