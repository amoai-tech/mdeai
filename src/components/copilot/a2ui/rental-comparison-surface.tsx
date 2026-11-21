"use client";

import { GenerativeUISurface, useGenerativeUIRuntime } from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

/** The Rentals browse page does not mount the full chat transcript. Give the
 * same official Table a real page target; the full /chat keeps target="chat".
 * No new data or rendering library is introduced. */
export const RENTAL_COMPARISON_TARGET = "rental-comparison";
export const RENTAL_COMPARISON_COMPONENTS = ["Column", "Table", "Text", "RentalComparisonActions"] as const;

export function RentalComparisonSurface() {
  const runtime = useGenerativeUIRuntime();
  const coAgent = useOptionalConciergeCoAgent();
  if (!runtime || !coAgent) return null;

  return (
    <GenerativeUISurface
      id={RENTAL_COMPARISON_TARGET}
      ui={mdeUI}
      components={[...RENTAL_COMPARISON_COMPONENTS]}
      description="Accurate side-by-side comparison of two to five already displayed rentals. The server supplies the Table, factual summary, and ID-only Details and viewing actions. Never generate prices or a second search."
      className="mb-4 min-w-0 max-w-full rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4"
      fallback={null}
      autoScroll={false}
    />
  );
}
