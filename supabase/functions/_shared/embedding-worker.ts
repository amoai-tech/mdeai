/**
 * SAN-1523 — pure helpers for the embedding worker (no imports, so they test under plain `deno test`).
 *
 * Model contract: kept identical to src/mastra/lib/query-embedding.ts by a unit test
 * (src/mastra/lib/__tests__/embedding-contract.test.ts). Documents and queries MUST share one model and
 * one dimension, or similarity scores are meaningless.
 */
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;
export const MAX_BATCH = 10;
export const DEFAULT_BATCH = 5;

export type EmbedOutcome =
  | { ok: true; values: number[] }
  | { ok: false; retryable: boolean; reason: string; fatal?: true };

/** Compare two secrets without leaking where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** 400 means this text will never embed; everything else (429, 5xx, network) is retried. Auth is handled by isAuthFailure first. */
export function isRetryableStatus(status: number): boolean {
  return status !== 400;
}

/**
 * The key (not the record) is the problem. Google reports a wrong or revoked key as HTTP 400 with reason
 * API_KEY_INVALID — not 401 — so the status alone would wrongly mark every job as permanently unembeddable.
 * Only the machine-readable reason is read from the body; the body itself is never stored or logged.
 */
export function isAuthFailure(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  const error = (body as { error?: { status?: string; details?: { reason?: string }[] } } | null)?.error;
  return error?.status === "UNAUTHENTICATED" || error?.status === "PERMISSION_DENIED" ||
    (error?.details ?? []).some((d) => d?.reason === "API_KEY_INVALID");
}

/** A reason that is safe to store and show: no response body, no key, no text of the record. */
export function sanitizeReason(reason: string): string {
  return reason.replace(/\s+/g, " ").slice(0, 200);
}

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_BATCH;
  return Math.min(Math.max(n, 1), MAX_BATCH);
}

/** The vector must be exactly EMBED_DIM finite numbers. Anything else is refused, never stored. */
export function validateEmbedding(values: unknown): EmbedOutcome {
  if (!Array.isArray(values) || values.length === 0) {
    return { ok: false, retryable: true, reason: "empty embedding in the response" };
  }
  if (values.length !== EMBED_DIM) {
    return { ok: false, retryable: false, reason: `embedding has ${values.length} values, expected ${EMBED_DIM}` };
  }
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return { ok: false, retryable: false, reason: "embedding contains a non-numeric value" };
  }
  return { ok: true, values: values as number[] };
}

/** One call to the Gemini embedContent API. The key travels in a header, never in the URL or a log line. */
export async function embedDocument(
  text: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<EmbedOutcome> {
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        // No taskType: the stored side must match the query side (src/mastra/lib/query-embedding.ts sets none).
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIM,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (isAuthFailure(res.status, body)) {
        return { ok: false, retryable: true, fatal: true, reason: `Gemini rejected the API key (HTTP ${res.status}) — check GOOGLE_GENERATIVE_AI_API_KEY` };
      }
      return { ok: false, retryable: isRetryableStatus(res.status), reason: `Gemini HTTP ${res.status}` };
    }
    const json = (await res.json()) as { embedding?: { values?: unknown } };
    return validateEmbedding(json.embedding?.values);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, retryable: true, reason: timedOut ? "Gemini request timed out" : "network error calling Gemini" };
  }
}
