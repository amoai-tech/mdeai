/**
 * SAN-1588 — server-only construction of MDE's selected inference model.
 *
 * Why this module exists instead of a Mastra model-router string:
 *
 * - MDE's pinned `@mastra/core@1.74.0` static provider registry and generated
 *   `ModelRouterModelId` union do **not** contain
 *   `nvidia/nemotron-3.5-super-vl-120b-a12b`, so `model: "nvidia/..."` fails
 *   typecheck on this repository today.
 * - COST-001 wraps a `LanguageModelV2` model object
 *   (`src/mastra/lib/token-usage-middleware.ts`). A Mastra router model has a
 *   different `doGenerate` contract, so routing through it would silently stop
 *   recording `ai_runs` token usage.
 *
 * Both problems disappear when the same NVIDIA endpoint is built through the
 * AI SDK's official OpenAI-compatible provider, which is already the transport
 * Mastra's router uses internally. The model object is interchangeable with the
 * Gemini one for agents, `generateObject`, and the token middleware.
 *
 * Never import this module from client code: `NVIDIA_API_KEY` is server-only.
 * The id/URL/provider helpers live in `ai-model-ids.ts`, which has no imports.
 */
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import {
  GEMINI_FLASH_MODEL_ID,
  NVIDIA_API_BASE_URL,
  NVIDIA_MODEL_ID,
  NVIDIA_SUPER_VL_MODEL_ID,
  parseAiProvider,
  type AiProvider,
} from "@/lib/ai-model-ids";

export type JsonProviderOptions = Record<string, { chat_template_kwargs: { enable_thinking: boolean } }>;

/** The provider selected for this server process. */
export function activeAiProvider(): AiProvider {
  return parseAiProvider(process.env.MDE_AI_PROVIDER);
}

/** The model id the selected provider will receive. */
export function activeAiModelId(): string {
  return activeAiProvider() === "nvidia"
    ? NVIDIA_MODEL_ID
    : GEMINI_FLASH_MODEL_ID;
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/lib/ai-provider.ts is server-only; importing it into a client bundle would expose provider keys.",
    );
  }
}

function nvidiaApiKey(): string {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "MDE_AI_PROVIDER=nvidia requires NVIDIA_API_KEY. " +
        "Set it in the server environment (never NEXT_PUBLIC_*) or unset MDE_AI_PROVIDER to use Gemini.",
    );
  }
  return apiKey;
}

let cachedNvidia:
  | { apiKey: string; provider: ReturnType<typeof createOpenAICompatible> }
  | undefined;

function nvidiaProvider(apiKey: string) {
  if (cachedNvidia?.apiKey !== apiKey) {
    cachedNvidia = {
      apiKey,
      provider: createOpenAICompatible({
        name: "nvidia",
        baseURL: NVIDIA_API_BASE_URL,
        apiKey,
        // `response_format: json_schema` is what generateObject needs.
        supportsStructuredOutputs: true,
        // Without this the streaming response carries no usage chunk and
        // COST-001 would record zero tokens for every streamed turn.
        includeUsage: true,
      }),
    };
  }
  return cachedNvidia.provider;
}

/**
 * Retained Super VL setting, separate from Lightning's chat_template_kwargs.
 * PR #509 disables Lightning thinking for fast text and rental extraction.
 */
export type NvidiaReasoningEffort = "none" | "low" | "high";

export function nvidiaReasoningEffort(): NvidiaReasoningEffort {
  const raw = process.env.MDE_NVIDIA_REASONING_EFFORT?.trim().toLowerCase();
  if (!raw) return "none";
  if (raw === "none" || raw === "low" || raw === "high") {
    return raw;
  }
  throw new Error(
    `Invalid MDE_NVIDIA_REASONING_EFFORT "${raw}". Expected none, low or high.`,
  );
}

/** Bound every NVIDIA generation and its streamed response to a single call clock.
 * This does not replace a shared deadline for multiple sequential agent calls.
 */
export function nvidiaCallAbortSignal(
  callerSignal?: AbortSignal,
  timeoutMs = 22_000,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

type CallOptionsWithProviderOptions = {
  providerOptions?: Record<string, Record<string, unknown>>;
  abortSignal?: AbortSignal;
};

/**
 * Merge default provider options into every model call. The provider's own
 * namespace is the part before the dot in its name ("nvidia" for `nvidia.chat`);
 * the openai-compatible provider reads options from that key, not from
 * `openaiCompatible`.
 */
function withDefaultProviderOptions(
  model: LanguageModelV2,
  providerOptions: Record<string, Record<string, unknown>>,
): LanguageModelV2 {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === "doGenerate" || prop === "doStream") {
        const original = Reflect.get(target, prop, receiver) as (
          options: CallOptionsWithProviderOptions,
        ) => unknown;
        return (options: CallOptionsWithProviderOptions) => {
          const merged: Record<string, Record<string, unknown>> = {
            ...(options.providerOptions ?? {}),
          };
          for (const [namespace, values] of Object.entries(providerOptions)) {
            // Explicit call-site options win over MDE's defaults.
            merged[namespace] = { ...values, ...(merged[namespace] ?? {}) };
          }
          return original.call(target, {
            ...options,
            providerOptions: merged,
            abortSignal: nvidiaCallAbortSignal(options.abortSignal),
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Lightning for text; optionally construct the pre-existing Super VL model. */
export function createNvidiaLanguageModel(
  apiKey: string,
  modelId: typeof NVIDIA_MODEL_ID | typeof NVIDIA_SUPER_VL_MODEL_ID = NVIDIA_MODEL_ID,
): LanguageModelV2 {
  assertServerRuntime();
  const key = apiKey.trim();
  if (!key) {
    throw new Error("createNvidiaLanguageModel requires a non-empty NVIDIA API key.");
  }
  const model = nvidiaProvider(key)(modelId);
  return withDefaultProviderOptions(model, {
    nvidia: modelId === NVIDIA_MODEL_ID
      ? { chat_template_kwargs: { enable_thinking: false } }
      : { reasoningEffort: nvidiaReasoningEffort() },
  });
}

/** Build the model selected by `MDE_AI_PROVIDER` (Gemini when unset). */
export function createActiveLanguageModel(): LanguageModelV2 {
  assertServerRuntime();
  const provider = activeAiProvider();
  if (provider === "nvidia") return createNvidiaLanguageModel(nvidiaApiKey());
  return google(GEMINI_FLASH_MODEL_ID);
}

/**
 * Lightning's enable_thinking flag is different from Super VL's reasoningEffort.
 * Keep the structured extraction request consistent with its model default.
 */
export function structuredOutputProviderOptions(
  provider: AiProvider = activeAiProvider(),
): JsonProviderOptions | undefined {
  if (provider !== "nvidia") return undefined;
  return { nvidia: { chat_template_kwargs: { enable_thinking: false } } };
}

/**
 * With Lightning thinking disabled, 1,024 tokens bounds small rental schemas.
 */
export const STRUCTURED_OUTPUT_MAX_TOKENS = 1024;
