"use client";

import { RentalResults } from "@/components/copilot/search-tool-renders";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";

/**
 * Failed searches do not replace real apartments with an invented empty state.
 * This notice lives beside the existing fast-path cards; Retry runs the same
 * canonical /api/rentals/search request, never a new agent or search service.
 */
export function RentalSearchRecoveryNotice() {
  const { searchFailure, toolResult, retryFailedSearch } = useRentalFastPath();
  if (!searchFailure) return null;
  const hasPrevious = (normalizeToolEnvelope(toolResult).results?.length ?? 0) > 0;

  return (
    <div
      role="alert"
      data-testid="rental-search-recovery"
      data-status={searchFailure.status ?? "network"}
      data-error-code={searchFailure.code}
      className="mx-2 mb-3 rounded-lg border border-border bg-muted/50 px-3 py-3 text-sm sm:mx-4"
    >
      <p>
        Rental search is temporarily unavailable.{" "}
        {hasPrevious
          ? "Showing your previous apartment results."
          : "No new search results were returned."}
      </p>
      {searchFailure.retryable ? (
        <button
          type="button"
          onClick={retryFailedSearch}
          className="mt-2 min-h-11 rounded-md border border-border bg-background px-4 py-2 font-medium hover:bg-accent"
        >
          Retry search
        </button>
      ) : null}
    </div>
  );
}

/** Inline rental cards from fast-path search (no CopilotKit tool render). */
export function RentalFastPathPanel() {
  const { toolResult, searchMeta } = useRentalFastPath();
  if (!toolResult) return null;

  return (
    <div data-testid="rental-fast-path-panel" className="px-2 pb-3 sm:px-4">
      <RentalResults result={toolResult} searchMeta={searchMeta ?? undefined} />
    </div>
  );
}
