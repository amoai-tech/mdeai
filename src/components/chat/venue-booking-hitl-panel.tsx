"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { saveVenueBookingReview } from "./venue-booking-draft-store";
import { formatMedellinBookingTime, medellinIsoToLocal, medellinLocalToIso } from "@/lib/venues/venue-booking-time";
import type { VenueBookingKind } from "@/lib/venues/venue-booking-form-schema";

export type VenueBookingHitlArgs = {
  venueKind: VenueBookingKind;
  placeId?: string | null;
  restaurantId?: string | null;
  requestedAt: string;
  partySize: number;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  notes?: string;
  venueTitle?: string;
};

type VenueBookingHitlPanelProps = {
  args: VenueBookingHitlArgs;
  status: "inProgress" | "executing" | "complete";
  respond: (decision: "approved" | "rejected", draft: VenueBookingHitlArgs) => Promise<void> | void;
};

export function VenueBookingHitlPanel({ args, status, respond }: VenueBookingHitlPanelProps) {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const [draft, setDraft] = useState(args);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const venueLabel = draft.venueTitle?.trim() || draft.placeId || draft.restaurantId || "Restaurant";
  const returnPath = encodeURIComponent(pathname || "/chat");
  const storeForLogin = () => saveVenueBookingReview(draft);

  const send = async (decision: "approved" | "rejected") => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await respond(decision, draft);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-2 my-3 max-w-lg border-primary/30 sm:mx-4" data-testid="venue-booking-hitl-card">
      <CardHeader>
        <CardTitle>Send booking request?</CardTitle>
        <CardDescription>
          Review the details. This sends a pending request — not a confirmed reservation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="font-medium">Venue:</span> {venueLabel}</p>
        {editing ? (
          <div className="space-y-3" data-testid="venue-booking-hitl-edit-fields">
            <label className="block">Date and time (Medellín)
              <input className="mt-1 w-full rounded border p-2" type="datetime-local"
                value={medellinIsoToLocal(draft.requestedAt)}
                onChange={(e) => {
                  try { setDraft({ ...draft, requestedAt: medellinLocalToIso(e.target.value) }); }
                  catch { setError("Choose a valid Medellín date and time."); }
                }} />
            </label>
            <label className="block">Guests
              <input className="mt-1 w-full rounded border p-2" type="number" min={1} max={50}
                value={draft.partySize} onChange={(e) => setDraft({ ...draft, partySize: Number(e.target.value) })} />
            </label>
            <label className="block">Name
              <input className="mt-1 w-full rounded border p-2" required value={draft.contactName}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
            </label>
            <label className="block">Email
              <input className="mt-1 w-full rounded border p-2" type="email" required value={draft.contactEmail}
                onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })} />
            </label>
            <label className="block">Notes (optional)
              <textarea className="mt-1 w-full rounded border p-2" value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Done editing
            </Button>
          </div>
        ) : (
          <>
            <p><span className="font-medium">When:</span> {formatMedellinBookingTime(draft.requestedAt)}</p>
            <p><span className="font-medium">Party:</span> {draft.partySize}</p>
            <p><span className="font-medium">Contact:</span> {draft.contactName} · {draft.contactEmail}</p>
            {draft.contactPhone && <p><span className="font-medium">Phone:</span> {draft.contactPhone}</p>}
            {draft.notes && <p><span className="font-medium">Notes:</span> {draft.notes}</p>}
          </>
        )}
        {loading && <p className="text-muted-foreground">Checking session…</p>}
        {!loading && !user && (
          <div className="rounded-lg border bg-muted/40 p-3" data-testid="venue-booking-hitl-sign-in">
            <p className="font-medium">Sign in to send this request</p>
            <p className="mt-1">
              <Link href={`/login?next=${returnPath}`} onClick={storeForLogin} className="text-primary underline">Sign in</Link>
              {" · "}
              <Link href={`/signup?next=${returnPath}`} onClick={storeForLogin} className="text-primary underline">Sign up</Link>
            </p>
          </div>
        )}
        {error && <p role="alert" data-testid="venue-booking-hitl-error" className="text-destructive">{error} Retry after correcting the problem.</p>}
      </CardContent>
      {status === "executing" && (
        <CardFooter className="flex flex-wrap gap-2">
          {user && !editing && (
            <Button type="button" disabled={busy} data-testid="venue-booking-hitl-approve"
              onClick={() => void send("approved")}>{busy ? "Sending…" : "Send request"}</Button>
          )}
          {user && (
            <Button type="button" variant="outline" disabled={busy} data-testid="venue-booking-hitl-edit"
              onClick={() => { setEditing(!editing); setError(null); }}>
              {editing ? "Review" : "Edit details"}
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} data-testid="venue-booking-hitl-reject"
            onClick={() => void send("rejected")}>Cancel</Button>
        </CardFooter>
      )}
    </Card>
  );
}
