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

const DISCOVERY_NAMES = new Set<string>([
  ...Object.entries(MASTRA_COPILOT_TOOL_ACTIONS)
    .filter(([kind]) => !["venueBooking", "newProjects", "compareProjects"].includes(kind))
    .map(([, name]) => name),
  ...Object.entries(MASTRA_TOOL_IDS)
    .filter(([kind]) => !["venueBooking", "newProjects", "compareProjects"].includes(kind))
    .map(([, name]) => name),
]);

/**
 * A finished tool result is eligible only when its call belongs to the newest user turn.
 * Ignore late older results even when the old tool card is remounted by transcript virtualization.
 * User messages are an ordering boundary: while B is pending, A cannot rewrite B's UI.
 */
export function isCurrentDiscoveryToolCall(
  messages: readonly SearchMessage[],
  toolCallId: string,
): boolean {
  if (!toolCallId) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return false;
    if (message.role !== "assistant") continue;
    const calls = message.toolCalls ?? [];
    for (let j = calls.length - 1; j >= 0; j--) {
      const call = calls[j];
      if (!call.id || !DISCOVERY_NAMES.has(call.function?.name ?? "")) continue;
      return call.id === toolCallId;
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
