"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import {
  VenueBookingHitlPanel, type VenueBookingHitlArgs,
} from "@/components/chat/venue-booking-hitl-panel";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import { useSession } from "@/hooks/use-session";
import { clearVenueBookingReview, restoreVenueBookingReview } from "./venue-booking-draft-store";
import { submitDirectVenueBooking } from "@/components/chat/venue-booking-direct-hitl-core";

type BookingDecision = "approved" | "rejected";
type VenueBookingDirectHitlContextValue = {
  openDirectHitl: (args: VenueBookingHitlArgs) => void;
  clearDirectHitl: () => void;
  args: VenueBookingHitlArgs | null;
  status: "inProgress" | "executing" | "complete";
  respond: (decision: BookingDecision, draft: VenueBookingHitlArgs) => Promise<void>;
};

const VenueBookingDirectHitlContext =
  createContext<VenueBookingDirectHitlContextValue | null>(null);

function useVenueBookingDirectHitlContext() {
  const ctx = useContext(VenueBookingDirectHitlContext);
  if (!ctx) throw new Error("VenueBookingDirectHitlContext missing — wrap with VenueBookingDirectHitlProvider");
  return ctx;
}

export function useVenueBookingDirectHitl() {
  const { openDirectHitl, clearDirectHitl } = useVenueBookingDirectHitlContext();
  return { openDirectHitl, clearDirectHitl };
}

export function VenueBookingDirectHitlPanel() {
  const { args, status, respond } = useVenueBookingDirectHitlContext();
  if (!args) return null;
  return (
    <div className="px-2 pb-3 sm:px-4">
      <VenueBookingHitlPanel args={args} status={status} respond={respond} />
    </div>
  );
}

/** A slot-complete direct proposal uses the same confirmed API path as the agent review. */
export function VenueBookingDirectHitlProvider({ children }: { children: ReactNode }) {
  const [args, setArgs] = useState<VenueBookingHitlArgs | null>(null);
  // executing is CopilotKit's "awaiting human input" status, not "request in flight".
  const [status, setStatus] = useState<"inProgress" | "executing" | "complete">("executing");
  const inFlight = useRef(false);
  const { user, loading } = useSession();
  const { setVenueBookingConfirmation } = useRentalUi();

  useEffect(() => {
    if (loading || !user || args) return;
    const draft = restoreVenueBookingReview();
    if (!draft) return;
    // sessionStorage is external to React; restore after hydration without
    // synchronously cascading state changes inside the effect.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setArgs((current) => current ?? draft);
    });
    return () => { cancelled = true; };
  }, [loading, user, args]);

  const clearDirectHitl = useCallback(() => {
    clearVenueBookingReview();
    setArgs(null);
    setStatus("executing");
    inFlight.current = false;
  }, []);

  const openDirectHitl = useCallback((next: VenueBookingHitlArgs) => {
    setArgs(next);
    setStatus("executing");
  }, []);

  const respond = useCallback(
    async (decision: BookingDecision, draft: VenueBookingHitlArgs): Promise<void> => {
      if (!args || inFlight.current || status !== "executing") return;
      if (decision === "rejected") {
        clearDirectHitl();
        return;
      }
      // Synchronous guard prevents repeated clicks racing before React renders.
      inFlight.current = true;
      setArgs(draft);
      setStatus("inProgress");
      try {
        const result = await submitDirectVenueBooking(draft);
        if (!result.ok) {
          throw result.error instanceof Error ? result.error : new Error("Could not send request.");
        }
        clearVenueBookingReview();
        setVenueBookingConfirmation(result.confirmation);
        setArgs(null);
        setStatus("complete");
      } catch (error) {
        setStatus("executing");
        // The panel catches and displays the error while preserving its editable draft.
        throw error;
      } finally {
        inFlight.current = false;
      }
    },
    [args, status, clearDirectHitl, setVenueBookingConfirmation],
  );

  const value = useMemo(
    () => ({ openDirectHitl, clearDirectHitl, args, status, respond }),
    [openDirectHitl, clearDirectHitl, args, status, respond],
  );

  return (
    <VenueBookingDirectHitlContext.Provider value={value}>
      {children}
    </VenueBookingDirectHitlContext.Provider>
  );
}
