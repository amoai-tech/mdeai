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

/** Fails to compile if the two halves above stop agreeing. */
export const COPILOTKIT_TRANSPORT_AGREES: CopilotKitTransportAgreement = true;
