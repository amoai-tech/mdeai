/**
 * Gemini model ids — a module with **no imports at all**.
 *
 * Why this is not in `src/mastra/lib/models.ts`: that module constructs the
 * COST-001-wrapped model and therefore reaches `node:async_hooks` through the
 * token-usage sink (`token-usage-als.ts`). `src/lib/flash-route-classifier.ts`
 * is reachable from the client chat bundle — `concierge-send-user-message.ts`
 * imports it, and client components import that — so importing the id from
 * `models.ts` would drag a server-only module into the browser build. This file
 * is a plain string, safe to import from either side.
 *
 * Development phase: MDE runs **gemini-3.5-flash-lite**. Switching back to
 * `gemini-3.5-flash` when MDE leaves development is a one-line change here, and
 * every call site follows because they all reference this constant.
 *
 * Changing this value is a behaviour change, not just a rename. Verified for the
 * current id: it is a stable model id, it served a live `generateContent` call,
 * and the official model page reports function calling and structured outputs as
 * supported. `src/mastra/lib/models.test.ts` re-proves tool calling and
 * structured output against whatever id is set here, on demand.
 *
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
 */
export const GEMINI_FLASH_MODEL_ID = "gemini-3.5-flash-lite";

/**
 * SAN-1588 — server-side inference providers MDE can select between.
 *
 * Development keeps Gemini as the default; NVIDIA is opt-in through
 * `MDE_AI_PROVIDER=nvidia` so a provider outage can never strand the app.
 */
export type AiProvider = "gemini" | "nvidia";

export const DEFAULT_AI_PROVIDER: AiProvider = "gemini";

/** NVIDIA's direct API model id (`POST /v1/chat/completions`). */
export const NVIDIA_MODEL_ID = "nvidia/nemotron-3.5-super-vl-120b-a12b";

/**
 * Mastra's *model-router* id for the same model (`provider/model`):
 * `https://mastra.ai/models/providers/nvidia` lists it as
 * `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b`.
 *
 * Recorded rather than used: MDE's pinned `@mastra/core@1.74.0` ships a static
 * provider registry and generated `ModelRouterModelId` union that do **not**
 * include this model (`nvidia/nemotron-3.5-lightning-30b-a3b` is the newest
 * Nemotron in that build). A router string would fail typecheck today and would
 * also bypass COST-001 token tracking, which is typed to `LanguageModelV2`
 * model objects. MDE therefore builds the same model through the AI SDK
 * provider below; re-evaluate when Mastra's registry ships it.
 */
export const NVIDIA_MASTRA_ROUTER_MODEL_ID =
  "nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b";

/** OpenAI-compatible NVIDIA Build/NIM endpoint used by the AI SDK provider. */
export const NVIDIA_API_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Parse `MDE_AI_PROVIDER` without touching `process` (this module has no imports
 * and is safe in the browser bundle). Unset/blank keeps Gemini; an unknown value
 * fails loudly instead of silently running the wrong provider.
 */
export function parseAiProvider(
  value: string | undefined | null,
): AiProvider {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "gemini") return DEFAULT_AI_PROVIDER;
  if (normalized === "nvidia") return "nvidia";
  throw new Error(
    `Invalid MDE_AI_PROVIDER "${value ?? ""}". Expected "gemini" or "nvidia".`,
  );
}

/** The model id MDE sends to the selected provider's API. */
export function modelIdForProvider(provider: AiProvider): string {
  return provider === "nvidia" ? NVIDIA_MODEL_ID : GEMINI_FLASH_MODEL_ID;
}

/** Resolve the provider from a model id recorded in `ai_runs.model_name`. */
export function providerForModelId(
  modelId: string | null | undefined,
): AiProvider {
  const id = (modelId ?? "").trim().toLowerCase();
  return id.startsWith("nvidia/") ? "nvidia" : "gemini";
}

/**
 * The capabilities MDE's agents depend on, recorded per model id.
 *
 * Why this exists: the live proof in `src/mastra/lib/models.test.ts` needs a
 * Gemini key, and CI has none, so it skips there. A skipped test protects
 * nothing — a future model switch could drop function calling or structured
 * output and every check would stay green while every real turn failed.
 *
 * So the capability claim is recorded here as data, and a **CI-enforced** test
 * asserts the configured id has a record that declares both. Switching the model
 * therefore fails CI until someone has actually read the model's page and
 * written down what it supports. That does not replace the live proof; it makes
 * the verification a required step rather than an optional one.
 *
 * `basis` says how each row was established, so a reader can tell a documented
 * read from an inherited assumption.
 */
export type GeminiModelCapabilities = {
  functionCalling: boolean;
  structuredOutput: boolean;
  /** How, and when, this was established — not a claim to trust blindly. */
  basis: string;
};

/** Provider-neutral alias so NVIDIA records do not pretend to be Gemini. */
export type ModelCapabilities = GeminiModelCapabilities;

export const GEMINI_MODEL_CAPABILITIES: Record<string, GeminiModelCapabilities> = {
  "gemini-3.5-flash-lite": {
    functionCalling: true,
    structuredOutput: true,
    basis:
      "Official model page read 2026-09-26 (function calling + structured outputs both 'Supported'), " +
      "and re-proven live via generateObject + a real tool call on the same date.",
  },
  "gemini-3.5-flash": {
    functionCalling: true,
    structuredOutput: true,
    basis:
      "Incumbent production model before the 2026-09-26 switch: MDE ran tools and generateObject " +
      "through it successfully. Not re-proven live after the switch.",
  },
};

/**
 * SAN-1588 — NVIDIA Nemotron 3.5 Super VL capability record.
 *
 * `models.dev` (Mastra's model-data source) lists `tool_call: true`,
 * `reasoning: true`, 1,048,576-token context and 8,192-token output. NVIDIA's
 * OpenAI-compatible endpoint was also proven live on 2026-10-22 through this
 * repository's provider path: a tool call returned
 * `{neighborhood:"Laureles",minBedrooms:2,maxPricePerMonth:3000000}` and a
 * JSON-schema response returned valid structured slots. The live proof is
 * opt-in in `src/mastra/lib/nvidia-model.integration.test.ts`; this record is
 * what ordinary CI can enforce.
 */
export const NVIDIA_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  [NVIDIA_MODEL_ID]: {
    functionCalling: true,
    structuredOutput: true,
    basis:
      "models.dev catalog read 2026-10-22 (tool_call true, reasoning true, 1M context / 8K output); " +
      "live-proven 2026-10-22 via an NVIDIA chat/completions tool call and JSON-schema response.",
  },
};

/** Every model id MDE can select, keyed by the id sent to the provider. */
export const AI_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  ...GEMINI_MODEL_CAPABILITIES,
  ...NVIDIA_MODEL_CAPABILITIES,
};

/** Read `MDE_AI_PROVIDER` and return the model id that will actually be used. */
export function activeModelIdFromEnv(
  value: string | undefined | null = typeof process !== "undefined"
    ? process.env.MDE_AI_PROVIDER
    : undefined,
): string {
  return modelIdForProvider(parseAiProvider(value));
}
