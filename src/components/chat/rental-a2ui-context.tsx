"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import { isRentalA2UIId } from "@/lib/rentals/a2ui-id";
import type { ConciergeWorkingMemory } from "@/lib/types";

type RentalRow = NonNullable<ConciergeWorkingMemory["lastRentalResults"]>[number];

/** IDs only: no untrusted titles, prices or instructions enter the prompt. */
export function rentalA2UIContextValue(rows: readonly RentalRow[] | undefined): string {
  return JSON.stringify(
    (rows ?? []).slice(0, 5).map((row) => row.id).filter(isRentalA2UIId),
  );
}

/**
 * The fast path writes lastRentalResults into client state, but the model does
 * not reliably see that object in working memory. Publish only the opaque IDs
 * and display labels as an untrusted hint; RentalCard still resolves the row
 * from the current authorized tool result and rejects anything else.
 */
export function rentalHintSource(
  toolResult: unknown | null,
  toolResults: readonly unknown[] | undefined,
): unknown | null {
  // Prefer the latest successful fast-path response. A failed search sets
  // toolResult=null but must not resurrect stale lastRentalResults as current.
  return toolResult ?? toolResults?.[0] ?? null;
}

export function RentalA2UIContext() {
  const { toolResult, toolResults } = useRentalFastPath();
  const latest = rentalHintSource(toolResult, toolResults);
  const envelopeRows = latest ? normalizeToolEnvelope(latest).results : undefined;
  const rows = (Array.isArray(envelopeRows) ? envelopeRows : undefined) as RentalRow[] | undefined;
  useAgentContext({
    description:
      "Most recent successful rental result IDs in display order; the first id is the top result. These may be historical after a newer failed search. When the user asks to render a rental card, use one exact id with render_ui. The card revalidates the id against authorized history and rejects anything else.",
    value: rentalA2UIContextValue(rows),
  });
  return null;
}
