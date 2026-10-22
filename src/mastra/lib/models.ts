import { google } from "@ai-sdk/google";
import { GEMINI_FLASH_MODEL_ID, parseAiProvider, type AiProvider } from "@/lib/ai-model-ids";
import { createActiveLanguageModel } from "@/lib/ai-provider";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * Development-phase model owner for every Mastra agent and scorer.
 *
 * Default provider: **Gemini** (`gemini-3.5-flash-lite`). Set
 * `MDE_AI_PROVIDER=nvidia` enables Lightning only for the concierge in PR #509.
 * Other agents keep the existing Gemini model until separately verified.
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

export const FLASH_MODEL = withTokenUsageTracking(google(GEMINI_FLASH_MODEL_ID));

/** PR #509: opt in only the existing concierge (and rental extraction) to NVIDIA. */
export const ACTIVE_TEXT_MODEL =
  ACTIVE_AI_PROVIDER === "nvidia"
    ? withTokenUsageTracking(createActiveLanguageModel())
    : FLASH_MODEL;

/**
 * Pro tier stays on Gemini regardless of MDE_AI_PROVIDER. No NVIDIA pro-tier
 * model is selected in this PR, so this still needs a Google key even when the
 * concierge runs on Lightning.
 */
export const PRO_MODEL = withTokenUsageTracking(google("gemini-3.1-pro-preview"));

/** Legacy aliases (my-mastra-app used string IDs; mdeapp uses AI SDK) */
export const CONCIERGE_MODEL = ACTIVE_TEXT_MODEL;
export const REASONING_MODEL = FLASH_MODEL;
export const PLANNING_MODEL = FLASH_MODEL;
