"use client";

import { useMemo } from "react";
import { useAgentContext } from "@copilotkit/react-core/v2";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import type { ConciergeWorkingMemory } from "@/lib/types";

type RentalRow = NonNullable<ConciergeWorkingMemory["lastRentalResults"]>[number];

/** IDs only: no untrusted titles, prices or instructions enter the prompt. */
export function rentalA2UIContextValue(rows: readonly RentalRow[] | undefined): string {
  return JSON.stringify((rows ?? []).slice(0, 5).map((row) => row.id));
}

/**
 * The fast path writes lastRentalResults into client state, but the model does
 * not reliably see that object in working memory. Publish only the opaque IDs
 * and display labels as an untrusted hint; RentalCard still resolves the row
 * from the current authorized tool result and rejects anything else.
 */
export function RentalA2UIContext() {
  const { state } = useConciergeCoAgent();
  const { toolResult } = useRentalFastPath();
  const rows = useMemo(() => {
    const envelopeRows = toolResult
      ? normalizeToolEnvelope(toolResult).results
      : undefined;
    return (Array.isArray(envelopeRows) && envelopeRows.length > 0
      ? envelopeRows
      : state.lastRentalResults) as RentalRow[] | undefined;
  }, [state.lastRentalResults, toolResult]);
  useAgentContext({
    description:
      "Current authorized rental result IDs in display order; the first id is the top result. When the user asks to render a rental card, use one exact id with render_ui. The card revalidates the id against the current authorized tool result and rejects anything else.",
    value: rentalA2UIContextValue(rows),
  });
  return null;
}
