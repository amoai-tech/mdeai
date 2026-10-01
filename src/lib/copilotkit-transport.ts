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
 * pairing cannot drift and the assertion at the bottom makes the matching a
 * compile-time fact rather than a convention.
 *
 * MDE pins the single-route pair deliberately. On 1.75.0 an omitted
 * `useSingleEndpoint` is `auto` (probed from `/info`, available since 1.70.2) and
 * that is the more robust choice if the handler mode ever changes — recorded here
 * as the considered alternative, not taken, because an explicit matched pair is
 * what this stage asserts.
 *
 * Capability note, read from the handler's own `info` payload at 1.75.0 rather
 * than from the docs. In single-route mode the top-level `threadEndpoints`
 * reports `list: false, inspect: false`, which looks like a lost capability but
 * is not — the same payload advertises it separately:
 *
 *     "threadEndpoints": { "list": false, "inspect": false, ... },
 *     "singleRoute": {
 *       "resourceOperations": true,
 *       "threadEndpoints": { "list": true, "inspect": true, ... }
 *     }
 *
 * So single-route carries thread list and inspect through resource operations.
 * Rich Threads are NOT lost by pinning this mode. A previous revision of this
 * file claimed the opposite from the truncated top-level flag alone; do not
 * reintroduce that claim without re-reading `singleRoute.threadEndpoints`.
 */

export const COPILOTKIT_BASE_PATH = "/api/copilotkit" as const;

/** Server half: `createCopilotRuntimeHandler({ mode })`. */
export const COPILOTKIT_HANDLER_MODE = "single-route" as const;

/** Client half: `<CopilotKit useSingleEndpoint />` / `CopilotKitProvider`. */
export const COPILOTKIT_USE_SINGLE_ENDPOINT = true as const;

/** Symmetric type equality that yields a real `false`, never `never`, on mismatch. */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type ModeIsSingleRoute = (typeof COPILOTKIT_HANDLER_MODE) extends "single-route" ? true : false;
type ClientIsPinned = (typeof COPILOTKIT_USE_SINGLE_ENDPOINT) extends true ? true : false;

/**
 * `true` only when both halves MATCH — the server is single-route exactly when
 * the client is pinned to the single endpoint. That is "both single-route +
 * pinned" (today) or "both multi-route + unpinned" (a deliberate move to the
 * other transport, which must change both constants). A change to one half
 * alone is the mismatch this rejects; it does not assert which pair MDE uses —
 * the contract test pins that separately.
 *
 * Every branch resolves to `true` or `false`, never `never`. That matters: a
 * previous revision built this from tuple elements that collapsed to `never` on
 * mismatch, and because `never` is assignable to `true`,
 * `[never, never] extends [true, true]` still resolved to `true` — the guard
 * compiled with the halves disagreeing and enforced nothing.
 */
export type CopilotKitTransportAgreement = Equals<ModeIsSingleRoute, ClientIsPinned>;

/**
 * Fails to compile if the two halves above stop agreeing, because `true` is not
 * assignable to `false`. A bare type alias would enforce nothing; only a value of
 * this type errors.
 *
 * Proven by mutation, not by the runtime test: setting `COPILOTKIT_HANDLER_MODE`
 * to `"multi-route"` makes `tsc --noEmit` fail on this line.
 */
export const COPILOTKIT_TRANSPORT_AGREES: CopilotKitTransportAgreement = true;
