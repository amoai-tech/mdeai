import {
  COPILOTKIT_BASE_PATH,
  COPILOTKIT_USE_SINGLE_ENDPOINT,
} from "@/lib/copilotkit-transport";

type CopilotAgentName = "conciergeAgent" | "hostEventAgent" | "hostOpsAgent";

/** Module-level empties — never inline `{}` on the provider; new refs each render retrigger connect. */
const STABLE_HEADERS: Record<string, string> = {};
const STABLE_PROPERTIES: Record<string, unknown> = {};
const STABLE_DEV_AGENTS: Record<string, never> = {};
const STABLE_SELF_MANAGED_AGENTS: Record<string, never> = {};

/**
 * Client props for every CopilotKit v2 surface: `<CopilotKitProvider>` only.
 *
 * `agentId` is the single agent identity. Until SAN-1378 Stage D the props also
 * carried a v1 `agent` duplicate, because the compatibility `<CopilotKit>`
 * wrapper read only that name (`agentId={props.agent ?? "default"}` in
 * 1.75.0). The last compatibility wrapper is gone, so the duplicate is gone too,
 * and the coupling test in `src/__tests__/api/copilotkit-v2-contract.test.ts`
 * fails if either comes back without the other.
 *
 * There is also no hosted-Cloud (`publicApiKey`) shape: MDE always uses the
 * same-origin runtime below.
 *
 * License (SAN-1330): `NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY` is passed as
 * `publicLicenseKey` when set. It is a LICENSE, not a hosting switch: in the
 * installed 1.75.0 provider `chatApiEndpoint = runtimeUrl ?? (key ? cloud : undefined)`,
 * so the same-origin `runtimeUrl` always wins and chat can never be redirected to
 * CopilotKit Cloud by this key. Never pass `publicApiKey` (legacy alias, UX-001).
 */
type CopilotKitClientProps = {
  agentId: CopilotAgentName;
  runtimeUrl: string;
  useSingleEndpoint: true;
  headers: Record<string, string>;
  properties: Record<string, unknown>;
  agents__unsafe_dev_only: Record<string, never>;
  selfManagedAgents: Record<string, never>;
  showDevConsole: false;
  /** CopilotKit public license key; omitted entirely when not configured. */
  publicLicenseKey?: string;
};

/**
 * Always use the same-origin Pattern-1 runtime ("/api/copilotkit").
 *
 * CopilotKit Cloud (the publicApiKey path) runs a v2 runtime that cannot reach
 * our in-process v1 Mastra agents, so production requests timed out before any
 * token and the client synthesized RUN_ERROR/INCOMPLETE_STREAM. Same-origin
 * routing keeps the agents in-process and lets ai_runs log each turn. See UX-001.
 * publicApiKey is intentionally NOT passed for now.
 *
 * `useSingleEndpoint: true` is the client half of a matched transport pair. The
 * server half is `mode: "single-route"` in
 * `src/app/api/copilotkit/[[...path]]/route.ts`. Both must stay explicit and
 * agree: a pinned client against a multi-route runtime sends an envelope that
 * matches no route, so the runtime 404s while `GET {basePath}/info` still returns
 * 200 and the app merely looks connected.
 */
export function getCopilotKitClientProps(agent: CopilotAgentName): CopilotKitClientProps {
  // showDevConsole=false — CopilotKit defaults to loading web-inspector on localhost;
  // after dev restarts a stale .next chunk causes ChunkLoadError for that bundle.
  const inspectorOff = { showDevConsole: false as const };
  // Direct `process.env.NEXT_PUBLIC_*` access so Next inlines it into the client bundle.
  const publicLicenseKey = process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_KEY?.trim();

  return {
    runtimeUrl: COPILOTKIT_BASE_PATH,
    useSingleEndpoint: COPILOTKIT_USE_SINGLE_ENDPOINT,
    agentId: agent,
    headers: STABLE_HEADERS,
    properties: STABLE_PROPERTIES,
    agents__unsafe_dev_only: STABLE_DEV_AGENTS,
    selfManagedAgents: STABLE_SELF_MANAGED_AGENTS,
    ...inspectorOff,
    ...(publicLicenseKey ? { publicLicenseKey } : {}),
  };
}
