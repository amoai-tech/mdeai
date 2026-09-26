/**
 * COST-001 — single source of truth for Gemini token pricing.
 *
 * No price literals anywhere else in the codebase. Rates are USD per 1M tokens.
 * Unknown models fall back to the highest known rate and are flagged, so a new
 * model never silently logs $0.
 *
 * **Source of every rate below.** Read from the official pricing page on
 * 2026-09-26, "Standard" tier, quoted verbatim:
 *
 *   Gemini 3.5 Flash       `gemini-3.5-flash`
 *     Input price    $1.50
 *     Output price (including thinking tokens)  $9.00
 *   Gemini 3.5 Flash-Lite  `gemini-3.5-flash-lite`
 *     Input price    $0.30 (text / image / video / audio)
 *     Output price (including thinking tokens)  $2.50
 *   Gemini 3.1 Flash-Lite  `gemini-3.1-flash-lite`
 *     Input price    $0.25 (text / image / video) $0.50 (audio)
 *     Output price (including thinking tokens)  $1.50
 *   Gemini 3.1 Pro Preview `gemini-3.1-pro-preview`
 *     Input price    $2.00, prompts <= 200k tokens   $4.00, prompts > 200k tokens
 *     Output price   $12.00, prompts <= 200k tokens  $18.00, prompts > 200k
 *
 * Re-checking corrected three stale entries that understated cost by ~3–5x; the
 * old "flash" figures were in fact Gemini 2.5 Flash-Lite's. `model-cost.test.ts`
 * pins these exact numbers against this citation, so an accidental edit fails
 * rather than silently changing what the dashboard reports.
 *
 * Rates are keyed by the literal model id and must **never** be keyed by
 * `GEMINI_FLASH_MODEL_ID`: a price belongs to one specific model, so the table
 * must not follow a constant that is meant to be switched. Where a model has
 * modality tiers, the text rate is used — MDE's calls are text.
 *
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */

export interface ModelRate {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPerMillion: number;
}

/** Keyed by the model id reported by the AI SDK (`google("<id>")`). */
const MODEL_RATES: Record<string, ModelRate> = {
  "gemini-3.5-flash": { inputPerMillion: 1.5, outputPerMillion: 9 },
  "gemini-3.5-flash-lite": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "gemini-3.1-flash-lite": { inputPerMillion: 0.25, outputPerMillion: 1.5 },
  "gemini-3.1-pro-preview": { inputPerMillion: 2, outputPerMillion: 12 },
};

/**
 * Used when a model id is not in {@link MODEL_RATES} — never returns 0 silently.
 *
 * Derived as the **highest** rate in the table rather than a fixed pick. The
 * previous hard-coded Flash rate was neither the current default (Lite) nor the
 * most expensive (Pro), so it was an arbitrary point in between. Deriving it
 * keeps one rule that cannot go stale as models are added, and takes the
 * direction that matters for cost control: an unrecognised id must never look
 * cheap. `rateFallback: true` is what marks the number as an approximation.
 *
 * Deliberate trade-off: this over-states an unknown *cheap* model. Pricing the
 * fallback at the current default instead would read better for the common case
 * (a model was just switched before its rate was added) but would silently
 * under-report spend if the new model were expensive, which is the error that
 * goes unnoticed.
 */
const FALLBACK_RATE: ModelRate = Object.values(MODEL_RATES).reduce((max, rate) =>
  rate.inputPerMillion + rate.outputPerMillion >
  max.inputPerMillion + max.outputPerMillion
    ? rate
    : max,
);

export interface ModelCostInput {
  modelName: string | null | undefined;
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
}

export interface ModelCostResult {
  estimatedCostUsd: number;
  /** True when the model id was unknown and FALLBACK_RATE was used. */
  rateFallback: boolean;
}

function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Compute the estimated USD cost of one model call. Rounded to 6 decimals so a
 * cheap turn never rounds to exactly 0 (Flash input ≈ $0.0000003/token).
 */
export function calculateModelCost(input: ModelCostInput): ModelCostResult {
  const id = (input.modelName ?? "").trim();
  const rate = MODEL_RATES[id];
  const resolved = rate ?? FALLBACK_RATE;
  const inputTokens = nonNegative(input.inputTokens);
  const outputTokens = nonNegative(input.outputTokens);
  const raw =
    (inputTokens / 1_000_000) * resolved.inputPerMillion +
    (outputTokens / 1_000_000) * resolved.outputPerMillion;
  return {
    estimatedCostUsd: Math.round(raw * 1_000_000) / 1_000_000,
    rateFallback: !rate,
  };
}

/** Exposed for tests / dashboards that need the raw rate table. */
export function getModelRate(modelName: string | null | undefined): ModelRate {
  return MODEL_RATES[(modelName ?? "").trim()] ?? FALLBACK_RATE;
}
