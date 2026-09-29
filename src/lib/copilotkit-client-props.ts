import {
  COPILOTKIT_BASE_PATH,
  COPILOTKIT_USE_SINGLE_ENDPOINT,
} from "@/lib/copilotkit-transport";

type CopilotAgentName = "conciergeAgent" | "hostEventAgent" | "hostOpsAgent";

/** Module-level empties — never inline `{}` on <CopilotKit>; new refs each render retrigger connect. */
const STABLE_HEADERS: Record<string, string> = {};
const STABLE_PROPERTIES: Record<string, unknown> = {};
const STABLE_DEV_AGENTS: Record<string, never> = {};
const STABLE_SELF_MANAGED_AGENTS: Record<string, never> = {};

/**
 * Client identity contract for every CopilotKit surface.
 *
 * The agent is carried under BOTH names, and that is deliberate rather than
 * leftover. They are not synonyms at runtime:
 *
 * - `agentId` — the supported v2 provider prop (`CopilotKitProviderProps.agentId`).
 * - `agent`   — the v1 `<CopilotKit>` compatibility bridge's ONLY agent input.
 *
 * Verified against the pinned source at `@copilotkit/react-core@1.75.0`:
 * `packages/react-core/src/v1-deprecated/components/copilot-provider/copilotkit.tsx:816`
 * derives agent identity solely from the legacy prop:
 *
 *     <CopilotChatConfigurationProvider agentId={props.agent ?? "default"} …>
 *
 * `CopilotKitProps` extends `Omit<CopilotKitProviderProps, "children" | "onError">`,
 * so `agentId` TYPECHECKS on `<CopilotKit>` but is never read. Dropping `agent`
 * while any surface still renders `<CopilotKit>` would compile, lint and pass
 * `floor` while silently resolving every agent to the agent literally named
 * `"default"`.
 *
 * Therefore `agent` is proven NOT redundant and stays until the four
 * `<CopilotKit>` boundaries become `<CopilotKitProvider>` (SAN-1357 Steps 12-15).
 * Remove it in the same commit that swaps the last boundary, and let the coupling
 * test in `src/__tests__/api/copilotkit-v2-contract.test.ts` drive that: it fails
 * if `agent` is dropped while a v1 `<CopilotKit>` consumer remains, and also fails
 * if `agent` is kept after the last v1 consumer is gone.
 */
type CopilotKitClientProps =
  | {
      agentId: CopilotAgentName;
      agent: CopilotAgentName;
      runtimeUrl: string;
      useSingleEndpoint: true;
      headers: Record<string, string>;
      properties: Record<string, unknown>;
      agents__unsafe_dev_only: Record<string, never>;
      selfManagedAgents: Record<string, never>;
      publicApiKey?: never;
      showDevConsole: false;
    }
  | {
      agentId: CopilotAgentName;
      agent: CopilotAgentName;
      publicApiKey: string;
      runtimeUrl?: never;
      headers: Record<string, string>;
      properties: Record<string, unknown>;
      agents__unsafe_dev_only: Record<string, never>;
      selfManagedAgents: Record<string, never>;
      showDevConsole: false;
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

  return {
    runtimeUrl: COPILOTKIT_BASE_PATH,
    useSingleEndpoint: COPILOTKIT_USE_SINGLE_ENDPOINT,
    agentId: agent,
    agent,
    headers: STABLE_HEADERS,
    properties: STABLE_PROPERTIES,
    agents__unsafe_dev_only: STABLE_DEV_AGENTS,
    selfManagedAgents: STABLE_SELF_MANAGED_AGENTS,
    ...inspectorOff,
  };
}
