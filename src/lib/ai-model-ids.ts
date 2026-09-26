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
