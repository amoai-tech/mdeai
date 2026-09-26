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
