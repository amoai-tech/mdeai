/** CopilotKit / AG-UI may pass tool output as object or JSON string. */
export type WebGroundingEnvelope = {
  citations?: Array<{ title: string; url: string; snippet?: string | null }>;
  metadata?: Record<string, unknown>;
};

/** Unwrap CopilotKit v2 tool payloads that may be JSON-string encoded one or more times. */
export function decodeToolJson(result: unknown): unknown {
  let value = result;
  while (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  return value;
}

type AgUiToolResultPart = {
  type?: string;
  result?: unknown;
};

/** CopilotKit v2 passes `toolMessage.content` — often AG-UI `[{ type: "tool-result", result }]`. */
export function unwrapAgUiToolPayload(result: unknown): unknown {
  let value = decodeToolJson(result);
  if (value == null) return value;

  if (Array.isArray(value)) {
    const part = value.find(
      (item): item is AgUiToolResultPart =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as AgUiToolResultPart).type === "tool-result" &&
        "result" in (item as object),
    );
    if (part) value = decodeToolJson(part.result);
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (
      "result" in obj &&
      !("results" in obj) &&
      !("total" in obj) &&
      !("citations" in obj)
    ) {
      const inner = decodeToolJson(obj.result);
      if (inner && typeof inner === "object") value = inner;
    }
  }

  return value;
}

/** An AG-UI message part (`{ type: "text" | "tool-result" | … }`), as opposed to a result row. */
function isAgUiContentPart(item: unknown): boolean {
  return Boolean(item) && typeof item === "object" && typeof (item as { type?: unknown }).type === "string";
}

/**
 * True once the tool output has actually arrived: the fully unwrapped payload is an object, not a
 * missing value, half-streamed JSON, an AG-UI message that is not a result yet, or an AG-UI wrapper
 * whose inner `result` is still empty. (An empty `results: []` is a finished answer; a
 * `{ result: null }` wrapper is not.)
 *
 * `rowArray` accepts a bare array of result rows as a finished payload — only the grounded places
 * tool returns that shape (see `parseGroundedToolResult`).
 */
export function isFinishedToolPayload(
  result: unknown,
  { rowArray = false }: { rowArray?: boolean } = {},
): boolean {
  const value = unwrapAgUiToolPayload(result);
  if (Array.isArray(value)) return rowArray && !value.some(isAgUiContentPart);
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    !("result" in payload) || "results" in payload || "total" in payload || "citations" in payload
  );
}

/** Normalize AG-UI / CopilotKit v2 tool payloads into card envelope fields. */
export function normalizeToolEnvelope(result: unknown): {
  results?: unknown[];
  total?: number;
  source?: string;
  hybridUsed?: boolean;
  rankExplanation?: Array<{ factor: string; score: number; note: string }>;
  webGrounding?: WebGroundingEnvelope;
} {
  const value = unwrapAgUiToolPayload(result);
  if (!value || typeof value !== "object") return {};
  const envelope = value as {
    results?: unknown[];
    total?: number;
    source?: string;
    hybridUsed?: boolean;
    rankExplanation?: Array<{ factor: string; score: number; note: string }>;
    webGrounding?: WebGroundingEnvelope;
  };
  return {
    results: Array.isArray(envelope.results) ? envelope.results : [],
    total: envelope.total,
    source: envelope.source,
    hybridUsed: envelope.hybridUsed,
    rankExplanation: envelope.rankExplanation,
    webGrounding: envelope.webGrounding,
  };
}
