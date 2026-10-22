import { google } from "@ai-sdk/google";
import { parseAiProvider, type AiProvider } from "@/lib/ai-model-ids";
import { createActiveLanguageModel } from "@/lib/ai-provider";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * Development-phase model owner for every Mastra agent and scorer.
 *
 * Default provider: **Gemini** (`gemini-3.5-flash-lite`). Set
 * `MDE_AI_PROVIDER=nvidia` to run the existing agents on
 * **NVIDIA Nemotron 3.5 Super VL** instead. No agent, tool, workflow, route or
 * frontend code changes when the provider switches — every agent imports
 * `FLASH_MODEL` from this file.
 *
 * Why an AI SDK model object rather than Mastra's `model: "nvidia/..."` router
 * string: the pinned `@mastra/core@1.74.0` registry does not contain this model,
 * and COST-001 token tracking is typed to `LanguageModelV2`. See
 * `src/lib/ai-provider.ts` for the full evidence.
 *
 * The model id lives in `src/lib/ai-model-ids.ts` (no imports) so call sites
 * that must stay browser-safe — `flash-route-classifier.ts` is reachable from
 * the client chat bundle — never import this module's `node:async_hooks`
 * dependency.
 *
 * Wrapped with COST-001 token-usage tracking so every model call records its
 * token usage into the active per-turn sink, regardless of provider. The wrapper
 * is transparent: same `LanguageModelV2` contract, no behavior change.
 */
export const ACTIVE_AI_PROVIDER: AiProvider = parseAiProvider(
  process.env.MDE_AI_PROVIDER,
);

export const FLASH_MODEL = withTokenUsageTracking(createActiveLanguageModel());

/**
 * Retained for callers that ask for the "pro" tier. NVIDIA currently has one
 * selected model, so it reuses the active model there instead of silently
 * calling Gemini without a Google key.
 */
export const PRO_MODEL =
  ACTIVE_AI_PROVIDER === "nvidia"
    ? FLASH_MODEL
    : withTokenUsageTracking(google("gemini-3.1-pro-preview"));

/** Legacy aliases (my-mastra-app used string IDs; mdeapp uses AI SDK) */
export const CONCIERGE_MODEL = FLASH_MODEL;
export const REASONING_MODEL = FLASH_MODEL;
export const PLANNING_MODEL = FLASH_MODEL;
