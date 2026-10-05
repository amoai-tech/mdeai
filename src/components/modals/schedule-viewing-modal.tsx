"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import { submitScheduleViewing } from "@/lib/leads/submit-schedule-viewing";
import { buildSchedulePrefill, type SchedulePrefill } from "@/lib/leads/schedule-prefill";
import { createClient } from "@/lib/supabase/client";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { contactReducer, INITIAL_CONTACT } from "./contact-fields";

/**
 * Look up the signed-in user + profile and build their contact prefill.
 * Returns `null` when signed out (caller clears the form in that case).
 * Best-effort: any lookup failure resolves to `null` rather than throwing.
 */
const loadPrefillForCurrentUser = async (): Promise<SchedulePrefill | null> => {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .maybeSingle();
    return buildSchedulePrefill(user, profile);
  } catch {
    // Prefill is best-effort; a failed lookup just leaves fields blank.
    return null;
  }
};

/** SCREEN-008 — schedule viewing modal → POST /api/leads/schedule-viewing (G2). */
export const ScheduleViewingModal = () => {
  const { scheduleTarget, closeScheduleViewing, setLeadConfirmation } = useRentalUi();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(Boolean(scheduleTarget), closeScheduleViewing, panelRef);
  // SAN-1203 — `setSubmitting` is async, so a fast double-click could fire two
  // requests before the button disables. This ref is the synchronous lock.
  const submitLockRef = useRef(false);
  const [contact, dispatchContact] = useReducer(contactReducer, INITIAL_CONTACT);
  const [preferredAt, setPreferredAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOpen = Boolean(scheduleTarget);

  // When the modal opens, look up the signed-in user and seed blank contact fields from their
  // profile + auth account. The reducer decides ownership (see contact-fields.ts), so a slow
  // lookup never overwrites or erases what the renter typed.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    (async () => {
      const prefill = await loadPrefillForCurrentUser();
      if (!cancelled) dispatchContact({ type: "lookup", prefill });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!scheduleTarget) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await submitScheduleViewing({
        listingId: scheduleTarget.listingId,
        listingTitle: scheduleTarget.title,
        neighborhood: scheduleTarget.neighborhood,
        name: contact.name.value.trim(),
        email: contact.email.value.trim(),
        phone: contact.phone.value.trim() || undefined,
        preferredAt,
      });
      // SAN-1203 — reaching here proves leadId + showingId are both committed.
      setLeadConfirmation({
        leadId: result.leadId,
        showingId: result.showingId,
        message: result.message,
        listingTitle: scheduleTarget.title,
      });
      closeScheduleViewing();
      dispatchContact({ type: "reset" });
      setPreferredAt("");
    } catch (err) {
      // The modal stays open with the typed values intact so the renter can fix
      // the time or retry rather than losing the request.
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      data-testid="schedule-viewing-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeScheduleViewing();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-viewing-title"
        className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-lg"
      >
        <h2 id="schedule-viewing-title" className="text-lg font-semibold">
          Schedule a viewing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scheduleTarget.title} · {scheduleTarget.neighborhood}
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm">
            <span className="font-medium">Your name</span>
            <input
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              name="name"
              autoComplete="name"
              required
              value={contact.name.value}
              onChange={(e) => dispatchContact({ type: "typed", field: "name", value: e.target.value })}
              disabled={submitting}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              name="email"
              autoComplete="email"
              required
              value={contact.email.value}
              onChange={(e) => dispatchContact({ type: "typed", field: "email", value: e.target.value })}
              disabled={submitting}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone (optional)</span>
            <input
              type="tel"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              name="phone"
              autoComplete="tel"
              value={contact.phone.value}
              onChange={(e) => dispatchContact({ type: "typed", field: "phone", value: e.target.value })}
              disabled={submitting}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Preferred time (Medellín time)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              name="preferredAt"
              required
              value={preferredAt}
              onChange={(e) => setPreferredAt(e.target.value)}
              disabled={submitting}
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="schedule-viewing-error"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeScheduleViewing}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="schedule-viewing-submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
