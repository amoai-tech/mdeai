"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import { isEventA2UIId } from "@/lib/events/a2ui-id";
import { EVENT_A2UI_CONTEXT_DESCRIPTION } from "@/lib/events/a2ui-context";
import { useEventFastPath } from "@/components/chat/event-fast-path-context";

type EventRow = { id?: unknown };

/** IDs only: no titles, prices or instructions enter the prompt. */
export function eventA2UIContextValue(rows: readonly EventRow[] | undefined): string {
  return JSON.stringify(
    (rows ?? [])
      .slice(0, 5)
      .map((row) => row.id)
      .filter(isEventA2UIId),
  );
}

export function eventHintSource(
  toolResult: unknown | null,
  toolResults: readonly unknown[] | undefined,
): unknown | null {
  // A failed search clears the current result; never resurrect a stale browser
  // state object as if it were the current result set.
  return toolResult ?? toolResults?.[0] ?? null;
}

export function EventA2UIContext() {
  const { toolResult, toolResults } = useEventFastPath();
  const latest = eventHintSource(toolResult, toolResults);
  const envelopeRows = latest ? normalizeToolEnvelope(latest).results : undefined;
  const rows = (Array.isArray(envelopeRows) ? envelopeRows : undefined) as EventRow[] | undefined;
  useAgentContext({
    description: EVENT_A2UI_CONTEXT_DESCRIPTION,
    value: eventA2UIContextValue(rows),
  });
  return null;
}
