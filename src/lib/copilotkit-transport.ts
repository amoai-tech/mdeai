/**
 * The CopilotKit transport pair, owned in one place.
 *
 * CopilotKit requires the browser provider and the Runtime handler to agree on a
 * transport. The v2 handler defaults to `"multi-route"`, so leaving either half
 * implicit is how a client ends up sending an envelope the runtime cannot match:
 * the run route 404s while `GET {basePath}/info` still returns 200, and the app
 * merely looks connected.
 *
 * Both halves import these values instead of repeating the literals, so the
 * pairing cannot drift and `CopilotKitTransportAgreement` below makes the
 * matching a compile-time fact rather than a convention.
 *
 * MDE pins the single-route pair deliberately. On 1.75.0 an omitted
 * `useSingleEndpoint` is `auto` (probed from `/info`, available since 1.70.2) and
 * that is the more robust choice if the handler mode ever changes — recorded here
 * as the considered alternative, not taken, because an explicit matched pair is
 * what this stage asserts.
 */

export const COPILOTKIT_BASE_PATH = "/api/copilotkit" as const;

/** Server half: `createCopilotRuntimeHandler({ mode })`. */
export const COPILOTKIT_HANDLER_MODE = "single-route" as const;

/** Client half: `<CopilotKit useSingleEndpoint />` / `CopilotKitProvider`. */
export const COPILOTKIT_USE_SINGLE_ENDPOINT = true as const;

/**
 * `true` in both directions: single-route requires the pinned client, and the
 * pinned client requires a single-route handler.
 *
 * This exists so a future change to either constant fails to compile rather than
 * failing at runtime in production, where the symptom is a 404 on the run route
 * hidden behind a healthy `/info`.
 */
export type CopilotKitTransportAgreement = [
  (typeof COPILOTKIT_HANDLER_MODE) extends "single-route"
    ? (typeof COPILOTKIT_USE_SINGLE_ENDPOINT) extends true
      ? true
      : never
    : never,
  (typeof COPILOTKIT_USE_SINGLE_ENDPOINT) extends true
    ? (typeof COPILOTKIT_HANDLER_MODE) extends "single-route"
      ? true
      : never
    : never,
] extends [true, true]
  ? true
  : never;

/**
 * Compile-time assertion of the pair above.
 *
 * Type-only on purpose: it emits no runtime value, because nothing reads it at
 * runtime — its entire job is to make a mismatched pair fail the build. `tsc`
 * evaluates it because it is exported into the declaration emit.
 */
export type AssertTransportAgreement = CopilotKitTransportAgreement extends true
  ? true
  : never;

/**
 * ponytail: ceiling — single-route mode does not expose CopilotKit Rich Threads.
 *
 * Read from the handler's own `info` payload at 1.75.0, not inferred:
 *
 *     single-route -> threadEndpoints { list: false, inspect: false }
 *     multi-route  -> threadEndpoints { list: true,  inspect: true  }
 *
 * So CopilotKit's own thread list and inspect endpoints are unavailable here.
 * MDE does not need them: thread navigation is owned by `ThreadNavProvider` on
 * top of Supabase ownership and the `ai_runs` ledger, not by CopilotKit's thread
 * store. This is a recorded ceiling, not a defect.
 *
 * Upgrade path: switch `COPILOTKIT_HANDLER_MODE` to `"multi-route"` **and** drop
 * the client's pinned `useSingleEndpoint` in the same change, because single
 * route is only half of the pair — a partial move is the "looks connected"
 * failure the assertion above refuses to compile.
 */
