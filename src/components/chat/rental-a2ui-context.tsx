"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import { isRentalA2UIId } from "@/lib/rentals/a2ui-id";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION, RENTAL_HINT_MAX, RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
type RentalIdRow = { id: string };

/** IDs only: no untrusted titles, prices or instructions enter the prompt. */
export function rentalA2UIContextValue<T extends RentalIdRow>(rows: readonly T[] | undefined): string {
  return JSON.stringify(
    (rows ?? []).slice(0, RENTAL_HINT_MAX).map((row) => row.id).filter(isRentalA2UIId),
  );
}

/** Keep the original ID array contract while publishing its full result count separately. */
export function rentalA2UIRenderedCountValue(rows: readonly RentalIdRow[] | undefined): string {
  return JSON.stringify(rows?.length ?? null);
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

export function RentalA2UIContext({ visibleRows }: { visibleRows?: readonly RentalIdRow[] } = {}) {
  const { toolResult, toolResults } = useRentalFastPath();
  const latest = rentalHintSource(toolResult, toolResults);
  const envelopeRows = latest ? normalizeToolEnvelope(latest).results : undefined;
  // On Rentals browse the actual visible cards are authoritative for ordinal
  // references. The fast-path envelope can be older/differently ordered during
  // streaming or hydration, making "first two" resolve to cards 2 and 3.
  // Other consumers continue using the existing fast-path fallback.
  const rows = visibleRows ?? (Array.isArray(envelopeRows) ? envelopeRows as RentalIdRow[] : undefined);
  useAgentContext({
    description: RENTAL_A2UI_CONTEXT_DESCRIPTION,
    value: rentalA2UIContextValue(rows),
  });
  useAgentContext({
    description: RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION,
    value: rentalA2UIRenderedCountValue(rows),
  });
  return null;
}
