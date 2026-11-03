/**
 * Shared Gemini API helpers.
 *
 * This module provides two surfaces:
 *
 * 1. **NEW (preferred):** native `@google/genai` SDK helpers
 *    - `callGeminiStructured` — single-shot structured output (G1-compliant)
 *    - `callGeminiAgent`      — function calling + tool combination (G7-compliant)
 *    - `withRetry`            — exponential backoff for 429/5xx
 *
 * 2. **LEGACY (deprecated, kept for ai-chat backwards compatibility):**
 *    - `fetchGemini` / `fetchGeminiStream` — OpenAI-compat fetch wrappers
 *    Will be removed once ai-chat is migrated to the native SDK in a follow-up PR.
 *
 * Critical rules from `.claude/skills/gemini/SKILL.md`:
 * - **G1:** every structured-output call MUST set both `responseMimeType: "application/json"`
 *   AND `responseJsonSchema`. The helper signature enforces this.
 * - **G2:** never set `temperature` below 1.0 on Gemini 3. The helper does not accept it.
 * - **G3:** combining `responseJsonSchema` with `googleSearch` is supported and recommended.
 * - **G4:** the SDK uses `x-goog-api-key` internally — no need to set it manually.
 * - **G5:** `groundingChunks` are extracted automatically and returned as `citations`.
 * - **G7:** `callGeminiAgent` sets `include_server_side_tool_invocations: true` automatically
 *   when both built-in tools and `functionDeclarations` are passed.
 */

import {
  GoogleGenAI,
  ThinkingLevel as GoogleThinkingLevel,
} from "npm:@google/genai@^1.0.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeminiModel =
  | "gemini-3.1-pro-preview"
  | "gemini-3-flash-preview"
  | "gemini-3.1-flash-lite-preview"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

// Google SDK uses uppercase enum values. Keep callers' existing lowercase API.
const THINKING_LEVEL_MAP: Record<ThinkingLevel, GoogleThinkingLevel> = {
  minimal: GoogleThinkingLevel.MINIMAL,
  low: GoogleThinkingLevel.LOW,
  medium: GoogleThinkingLevel.MEDIUM,
  high: GoogleThinkingLevel.HIGH,
};

export interface Citation {
  url: string;
  title: string;
}

export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
}

// Tool descriptors. We type as `Record<string, unknown>` rather than importing
// the SDK's `Tool` type because the SDK types churn between minor versions and
// we don't want to break compile on a non-functional change.
export type GeminiTool = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Client (singleton)
// ---------------------------------------------------------------------------

let _ai: GoogleGenAI | null = null;

// MDE production already provisions GOOGLE_GENERATIVE_AI_API_KEY for Mastra.
// Edge functions prefer GEMINI_API_KEY when explicitly configured, and reuse
// the existing key otherwise. Never expose either key in errors or logs.
export function getGeminiApiKey(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): string {
  const key = getEnv("GEMINI_API_KEY") ||
    getEnv("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!key) throw new Error("Gemini API key is not configured");
  return key;
}

export function geminiClient(): GoogleGenAI {
  if (_ai) return _ai;
  const key = getGeminiApiKey();
  _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

// ---------------------------------------------------------------------------
// callGeminiStructured — G1-enforcing single-shot helper
// ---------------------------------------------------------------------------

export interface CallGeminiStructuredArgs {
  /** Model ID. Pick from Quick Reference in the gemini skill. */
  model: GeminiModel;
  /** User prompt (text). For multimodal, use callGeminiAgent. */
  prompt: string;
  /** Optional system instruction. */
  systemInstruction?: string;
  /** Authorized media bytes; never use arbitrary caller-supplied URLs. */
  inlineImage?: { mimeType: string; data: string };
  /** **REQUIRED (G1).** JSON schema describing the output shape. */
  responseJsonSchema: Record<string, unknown>;
  /**
   * Reasoning depth. Pro defaults to `high`; Flash defaults to `high`;
   * Flash-Lite defaults to `minimal`. Set explicitly for cost tuning.
   */
  thinkingLevel?: ThinkingLevel;
  /** Optional grounding tools — googleSearch, googleMaps, urlContext, codeExecution. */
  tools?: GeminiTool[];
  /** Default 30s. */
  timeoutMs?: number;
  /** For ai_runs logging by callers. */
  agentName: string;
  // No `temperature` parameter — G2 forbids overriding for Gemini 3.
}

export interface CallGeminiResult<T = unknown> {
  /** Raw text from the model (the JSON string). */
  text: string;
  /** Parsed JSON. Validate with your Zod schema if you have one. */
  data: T;
  /** Citations from groundingChunks (G5). Empty if no Search/Maps/URL Context. */
  citations: Citation[];
  /** Token + duration accounting for ai_runs logging. */
  usage: UsageStats;
  duration_ms: number;
  model: GeminiModel;
}

export async function callGeminiStructured<T = unknown>(
  args: CallGeminiStructuredArgs,
): Promise<CallGeminiResult<T>> {
  const start = Date.now();
  const timeoutMs = args.timeoutMs ?? 30_000;

  const generationPromise = geminiClient().models.generateContent({
    model: args.model,
    contents: args.inlineImage
      ? [{ text: args.prompt }, { inlineData: args.inlineImage }]
      : args.prompt,
    config: {
      systemInstruction: args.systemInstruction,
      tools: args.tools as never,
      responseMimeType: "application/json", // G1
      responseJsonSchema: args.responseJsonSchema, // G1
      thinkingConfig: args.thinkingLevel
        ? { thinkingLevel: THINKING_LEVEL_MAP[args.thinkingLevel] }
        : undefined,
      // No temperature — G2.
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), timeoutMs)
  );

  const response = await Promise.race([generationPromise, timeoutPromise]);
  const duration_ms = Date.now() - start;
  const text = (response as { text?: string }).text ?? "";

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `SCHEMA_VIOLATION: Gemini returned non-JSON text (first 200 chars): ${
        text.slice(0, 200)
      }`,
    );
  }

  return {
    text,
    data,
    citations: extractCitations(response),
    usage: extractUsage(response),
    duration_ms,
    model: args.model,
  };
}

// ---------------------------------------------------------------------------
// callGeminiAgent — function calling + tool combination (G7)
// ---------------------------------------------------------------------------

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface FunctionCall {
  /** Function name the model wants to call. */
  name: string;
  /** Parsed arguments object the model produced. */
  args: Record<string, unknown>;
  /** Echo on tool response in multi-turn flows. */
  id?: string;
}

export interface CallGeminiAgentArgs {
  model: GeminiModel;
  /**
   * Multi-turn conversation history. Each entry is a Gemini-native `Content`:
   *   { role: "user" | "model", parts: [{ text: ... } | { functionCall: ... } | { functionResponse: ... }] }
   * For single-shot, pass `[{ role: "user", parts: [{ text: prompt }] }]`.
   */
  contents: Array<
    { role: "user" | "model"; parts: Array<Record<string, unknown>> }
  >;
  systemInstruction?: string;
  /** Custom function declarations the model can call. */
  functionDeclarations: FunctionDeclaration[];
  /** Built-in tools to combine (Search, Maps, Code Exec, URL Context). */
  builtInTools?: GeminiTool[];
  /**
   * `AUTO` = model decides; `ANY` = must call a function; `VALIDATED` = recommended
   * for tool combinations; `NONE` = disable function calling.
   */
  mode?: "AUTO" | "ANY" | "VALIDATED" | "NONE";
  /** Restrict which functions the model is allowed to call. */
  allowedFunctionNames?: string[];
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
  agentName: string;
}

export interface CallGeminiAgentResult {
  /** Plain text from the model (may be empty if it only called functions). */
  text: string;
  /** Function calls the model wants you to execute. */
  functionCalls: FunctionCall[];
  citations: Citation[];
  usage: UsageStats;
  duration_ms: number;
  model: GeminiModel;
  /**
   * Full SDK response. Preserve the model's `parts` (including `thoughtSignature`)
   * when feeding back into the next turn — the SDK manages signatures
   * automatically when you pass response.candidates back.
   */
  raw: unknown;
}

export async function callGeminiAgent(
  args: CallGeminiAgentArgs,
): Promise<CallGeminiAgentResult> {
  const start = Date.now();
  const timeoutMs = args.timeoutMs ?? 30_000;

  // Combine custom functions and built-in tools into one tools array.
  // Per skill §G7 + tool-combination.md: when both are present, the SDK
  // sets include_server_side_tool_invocations automatically.
  const tools: GeminiTool[] = [
    { functionDeclarations: args.functionDeclarations },
    ...(args.builtInTools ?? []),
  ];

  const toolConfig = args.mode || args.allowedFunctionNames
    ? {
      functionCallingConfig: {
        mode: args.mode ?? "AUTO",
        ...(args.allowedFunctionNames
          ? { allowedFunctionNames: args.allowedFunctionNames }
          : {}),
      },
    }
    : undefined;

  const generationPromise = geminiClient().models.generateContent({
    model: args.model,
    contents: args.contents as never,
    config: {
      systemInstruction: args.systemInstruction,
      tools: tools as never,
      toolConfig: toolConfig as never,
      thinkingConfig: args.thinkingLevel
        ? { thinkingLevel: THINKING_LEVEL_MAP[args.thinkingLevel] }
        : undefined,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), timeoutMs)
  );

  const response = await Promise.race([generationPromise, timeoutPromise]);
  const duration_ms = Date.now() - start;

  const text = (response as { text?: string }).text ?? "";

  // SDK exposes `functionCalls` getter on the response object.
  const sdkCalls =
    (response as { functionCalls?: Array<Record<string, unknown>> })
      .functionCalls ?? [];
  const functionCalls: FunctionCall[] = sdkCalls.map((c) => ({
    name: String(c.name ?? ""),
    args: (c.args as Record<string, unknown>) ?? {},
    id: c.id ? String(c.id) : undefined,
  }));

  return {
    text,
    functionCalls,
    citations: extractCitations(response),
    usage: extractUsage(response),
    duration_ms,
    model: args.model,
    raw: response,
  };
}

// ---------------------------------------------------------------------------
// withRetry — exponential backoff for 429 / 5xx
// ---------------------------------------------------------------------------

/**
 * Retry an async fn on transient errors (429, 500, 503).
 * Does NOT retry on 400/403/404 (client-side bugs).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status =
        (err as { status?: number; statusCode?: number })?.status ??
          (err as { statusCode?: number })?.statusCode;
      const message = err instanceof Error ? err.message : String(err);
      const transient = status === 429 ||
        (typeof status === "number" && status >= 500 && status < 600) ||
        message === "GEMINI_TIMEOUT";
      if (!transient) throw err;
      const delay = Math.min(8_000, Math.pow(2, i) * 1_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("withRetry: max retries exceeded");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractCitations(response: unknown): Citation[] {
  const responseData = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks =
    responseData.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks.flatMap((chunk) => {
    const web = chunk.web;
    return web?.uri ? [{ url: web.uri, title: web.title ?? "" }] : [];
  });
}

function extractUsage(response: unknown): UsageStats {
  const responseData = response as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const usageMetadata = responseData.usageMetadata ?? {};
  return {
    input_tokens: usageMetadata.promptTokenCount ?? 0,
    output_tokens: usageMetadata.candidatesTokenCount ?? 0,
    thoughts_tokens: usageMetadata.thoughtsTokenCount ?? 0,
    total_tokens: usageMetadata.totalTokenCount ?? 0,
  };
}

// ===========================================================================
// LEGACY: OpenAI-compat fetch helpers
// ---------------------------------------------------------------------------
// Used by ai-chat (~1054 lines, uses messages[] + tool_calls). Kept for
// backwards compatibility until ai-chat is migrated to the native SDK in a
// follow-up PR (per task 045 spec: "split refactor into 2 PRs if needed").
//
// **Do NOT use these in new code.** Use `callGeminiStructured` or
// `callGeminiAgent` above.
// ===========================================================================

const GEMINI_OPENAI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * @deprecated Use `callGeminiStructured` or `callGeminiAgent`.
 *
 * Fetch from Gemini's OpenAI-compat endpoint with timeout.
 */
export async function fetchGemini(
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<Response> {
  const key = getGeminiApiKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @deprecated Use `callGeminiAgent` for function calling, or wait for the
 * native streaming helper in the ai-chat migration PR.
 *
 * Fetch from Gemini's OpenAI-compat endpoint with streaming + timeout.
 */
export function fetchGeminiStream(
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<Response> {
  return fetchGemini({ ...body, stream: true }, timeoutMs);
}
