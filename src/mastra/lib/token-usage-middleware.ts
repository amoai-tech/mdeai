/**
 * COST-001 — records token usage from whichever AI SDK model spec is active.
 *
 * MDE runs a V3 Gemini model (`@ai-sdk/google` 3.x / `ai` 6) and a V2 NVIDIA
 * model (`@ai-sdk/openai-compatible` 1.x). Both expose the same two observable
 * methods (`doGenerate`, `doStream`), but their usage shapes differ:
 *
 * - V2: `{ inputTokens, outputTokens, totalTokens }`
 * - V3: `{ inputTokens: { total }, outputTokens: { total } }`
 *
 * This wrapper keeps the existing transparent Proxy so the V2 NVIDIA path is
 * unchanged, and normalizes V3 usage into the same per-turn sink. Aborts and
 * partial failures never emit a `finish` part, so the sink keeps its last total.
 */
import { addModelUsage } from "./token-usage-als";

/**
 * Structural boundary accepted by both AI SDK specs: Gemini V3 and NVIDIA V2.
 * Only the two methods this wrapper observes are part of the contract.
 */
type AnyLanguageModel = {
  specificationVersion: string;
  doGenerate: (...args: never[]) => PromiseLike<{ usage?: unknown }>;
  doStream: (...args: never[]) => PromiseLike<{ stream: ReadableStream<unknown> }>;
};
type AnyStreamPart = { type: string; usage?: unknown };

type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** Normalize V2 and V3 usage without depending on either provider package. */
function normalizeUsage(usage: unknown): NormalizedUsage {
  if (!usage || typeof usage !== "object") return {};
  const value = usage as {
    inputTokens?: number | { total?: number };
    outputTokens?: number | { total?: number };
    totalTokens?: number;
  };
  const input =
    typeof value.inputTokens === "number"
      ? value.inputTokens
      : value.inputTokens?.total;
  const output =
    typeof value.outputTokens === "number"
      ? value.outputTokens
      : value.outputTokens?.total;
  const total =
    typeof value.totalTokens === "number"
      ? value.totalTokens
      : (input ?? 0) + (output ?? 0);
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function recordUsage(usage: unknown): void {
  const normalized = normalizeUsage(usage);
  if (
    normalized.inputTokens === undefined &&
    normalized.outputTokens === undefined &&
    normalized.totalTokens === 0
  ) {
    return;
  }
  addModelUsage(normalized);
}

function recordFromStream(
  stream: ReadableStream<AnyStreamPart>,
): ReadableStream<AnyStreamPart> {
  const tap = new TransformStream<AnyStreamPart, AnyStreamPart>({
    transform(part, controller) {
      if (part.type === "finish") recordUsage(part.usage);
      controller.enqueue(part);
    },
  });
  return stream.pipeThrough(tap);
}

/** Wrap a V2 or V3 model so its token usage flows into the active turn's sink. */
export function withTokenUsageTracking<T extends AnyLanguageModel>(model: T): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === "doGenerate") {
        return async (...args: unknown[]) => {
          const result = (await Reflect.apply(target.doGenerate, target, args)) as {
            usage?: unknown;
          };
          recordUsage(result.usage);
          return result;
        };
      }
      if (prop === "doStream") {
        return async (...args: unknown[]) => {
          const result = (await Reflect.apply(target.doStream, target, args)) as {
            stream: ReadableStream<AnyStreamPart>;
          };
          return { ...result, stream: recordFromStream(result.stream) };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
