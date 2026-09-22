"use client";

import { useRentalUi } from "@/components/chat/rental-ui-context";

/** SCREEN-008 — inline confirmation after schedule viewing submit. */
export function LeadConfirmationBanner() {
  const { leadConfirmation, clearLeadConfirmation } = useRentalUi();

  if (!leadConfirmation) return null;

  return (
    <div
      className="mx-4 mb-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
      data-testid="lead-confirmation-card"
      data-showing-id={leadConfirmation.showingId}
      role="status"
    >
      {/* SAN-1203 — a committed request is not a confirmed viewing. */}
      <p className="font-medium text-primary">Viewing request received</p>
      <p className="mt-1 text-muted-foreground">{leadConfirmation.message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {leadConfirmation.listingTitle} · Ref {leadConfirmation.leadId.slice(0, 8)}
      </p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
        onClick={clearLeadConfirmation}
      >
        Dismiss
      </button>
    </div>
  );
}
