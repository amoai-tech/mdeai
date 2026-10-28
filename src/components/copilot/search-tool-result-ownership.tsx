"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import {
  MASTRA_COPILOT_TOOL_ACTIONS,
  MASTRA_TOOL_IDS,
} from "@/platform/copilot/mastra-tool-action-names";

type SearchMessage = {
  role?: string;
  toolCallId?: string;
  content?: unknown;
  toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
};

/** Keep canonical and legacy names for each search type together. */
const DISCOVERY_KINDS = new Map<string, string>(
  Object.entries(MASTRA_COPILOT_TOOL_ACTIONS)
    .filter(([kind]) => !["venueBooking", "newProjects", "compareProjects"].includes(kind))
    .flatMap(([kind, name]) => [
      [name, kind] as const,
      [MASTRA_TOOL_IDS[kind as keyof typeof MASTRA_TOOL_IDS], kind] as const,
    ]),
);

/**
 * A finished result belongs to the newest user turn and is the latest call of its search type.
 * Different tools in one turn (e.g. event rows plus web citations) can both contribute.
 * Older turns and superseded same-type calls cannot replay shared UI when remounted.
 */
export function isCurrentDiscoveryToolCall(
  messages: readonly SearchMessage[],
  toolCallId: string,
): boolean {
  if (!toolCallId) return false;
  const newerKinds = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return false;
    if (message.role !== "assistant") continue;
    const calls = message.toolCalls ?? [];
    for (let j = calls.length - 1; j >= 0; j--) {
      const call = calls[j];
      const kind = DISCOVERY_KINDS.get(call.function?.name ?? "");
      if (!call.id || !kind) continue;
      if (call.id === toolCallId) return !newerKinds.has(kind);
      newerKinds.add(kind);
    }
  }
  return false;
}

const SearchToolCallContext = createContext<string | null | undefined>(undefined);

/** Existing CopilotKit v2 render prop `toolCallId`; no new search/store lifecycle. */
export function SearchToolResultScope({
  toolCallId,
  children,
}: {
  toolCallId?: string;
  children?: ReactNode;
}) {
  return (
    <SearchToolCallContext.Provider value={toolCallId ?? null}>
      {children}
    </SearchToolCallContext.Provider>
  );
}

export function useCurrentSearchToolResult(): boolean {
  const toolCallId = useContext(SearchToolCallContext);
  const concierge = useOptionalConciergeCoAgent();
  // Fast-path cards or isolated render tests have no tool-call scope.
  if (toolCallId === undefined) return true;
  // A tool render without an actual id cannot claim to own shared map/result state.
  if (!toolCallId || !concierge?.agent) return false;
  return isCurrentDiscoveryToolCall(concierge.agent.messages, toolCallId);
}
