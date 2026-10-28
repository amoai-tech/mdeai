import { google } from "@ai-sdk/google";
import { GEMINI_FLASH_MODEL_ID, parseAiProvider, type AiProvider } from "@/lib/ai-model-ids";
import { createActiveLanguageModel } from "@/lib/ai-provider";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * Development-phase model owner for every Mastra agent and scorer.
 *
 * Default provider: **Gemini** (`gemini-3.5-flash-lite`). Set
 * `MDE_AI_PROVIDER=nvidia` to select Lightning for the existing Mastra agents
 * that consume ACTIVE_TEXT_MODEL. Gemini Flash remains the distinct, intentional
 * Concierge timeout fallback; it must not become a retry of the same primary.
 *
 * Why an AI SDK model object rather than Mastra's `model: "nvidia/..."` router
 * string: the pinned `@mastra/core@1.74.0` registry does not contain this model,
 * and COST-001 token tracking observes the concrete V2/V3 model contract. See
 * `src/lib/ai-provider.ts` for the full evidence.
 *
 * The model id lives in `src/lib/ai-model-ids.ts` (no imports) so call sites
 * that must stay browser-safe — `flash-route-classifier.ts` is reachable from
 * the client chat bundle — never import this module's `node:async_hooks`
 * dependency.
 *
 * Wrapped with COST-001 token-usage tracking so every model call records its
 * token usage into the active per-turn sink, regardless of provider. The wrapper
 * is transparent: same V2/V3 model contract, no behavior change.
 */
export const ACTIVE_AI_PROVIDER: AiProvider = parseAiProvider(
  process.env.MDE_AI_PROVIDER,
);

export const FLASH_MODEL = withTokenUsageTracking(google(GEMINI_FLASH_MODEL_ID));

/** Selected text model shared by Concierge, specialists and standalone AI workflows. */
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
/**
 * Nvidia occasionally stalls its first stream. Mastra's native model list moves
 * to the already-configured Gemini model when the primary exceeds its step
 * deadline. A user Stop/abort still cancels the entire run; do not add manual
 * retries that could replay tool side effects or duplicate chat messages.
 *
 * The 19s Mastra step deadline is below the adapter's 22s abort deadline.
 * Mastra needs to observe its OWN step timeout to invoke fallback; the model
 * adapter's AbortSignal.timeout alone ends the stream without fallback.
 */
// A fallback can only succeed if the outer agent stream outlives both model
// step deadlines. Keep a bounded margin for tool output and AG-UI finalization.
export const CONCIERGE_PRIMARY_STEP_TIMEOUT_MS = 19_000;
export const CONCIERGE_FALLBACK_STEP_TIMEOUT_MS = 45_000;
export const CONCIERGE_TURN_TIMEOUT_MS = ACTIVE_AI_PROVIDER === "nvidia"
  ? CONCIERGE_PRIMARY_STEP_TIMEOUT_MS + CONCIERGE_FALLBACK_STEP_TIMEOUT_MS + 10_000
  : 26_000;
export const CONCIERGE_AGENT_MODEL = ACTIVE_AI_PROVIDER === "nvidia"
  ? [
      { model: CONCIERGE_MODEL, maxRetries: 0, modelSettings: { timeout: { stepMs: CONCIERGE_PRIMARY_STEP_TIMEOUT_MS } } },
      { model: FLASH_MODEL, maxRetries: 0, modelSettings: { timeout: { stepMs: CONCIERGE_FALLBACK_STEP_TIMEOUT_MS } } },
    ]
  : CONCIERGE_MODEL;
export const REASONING_MODEL = ACTIVE_TEXT_MODEL;
export const PLANNING_MODEL = ACTIVE_TEXT_MODEL;
