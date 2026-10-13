"use client";

import { useEffect, useRef } from "react";
import { useRentalUi } from "@/components/chat/rental-ui-context";

/** SCREEN-008 — inline confirmation after schedule viewing submit. */
export function LeadConfirmationBanner() {
  const { leadConfirmation, clearLeadConfirmation } = useRentalUi();
  const bannerRef = useRef<HTMLDivElement>(null);

  // The renter submits from wherever they are on the page (often well below the banner), so bring
  // the confirmation into view. `nearest` leaves it alone when it is already visible, as in chat.
  useEffect(() => {
    if (leadConfirmation) bannerRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [leadConfirmation]);

  if (!leadConfirmation) return null;

  return (
    <div
      ref={bannerRef}
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
