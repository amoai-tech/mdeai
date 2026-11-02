"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { isFutureInstant, resolvePreferredAtInstant, LISTING_TIME_ZONE } from "@/lib/leads/schedule-viewing-time";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import { submitScheduleViewing } from "@/lib/leads/submit-schedule-viewing";
import { buildSchedulePrefill, type SchedulePrefill } from "@/lib/leads/schedule-prefill";
import { ScheduleViewingError } from "@/lib/leads/submit-schedule-viewing";
import type { ScheduleViewingErrorCode } from "@/lib/leads/schedule-viewing-schema";
import { createClient } from "@/lib/supabase/client";
import { useKeyboardInset } from "@/lib/hooks/use-chat-keyboard-height";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { contactReducer, INITIAL_CONTACT } from "./contact-fields";
import { ScheduleViewingRecovery } from "./schedule-viewing-recovery";

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

/** Calendar dates are date-only Medellín wall dates, never UTC timestamps. */
const dateOnly = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const localDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const medellinToday = (): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LISTING_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

/** SCREEN-008 / SAN-262 — local viewing draft → review → original atomic write. */
export const ScheduleViewingModal = () => {
  const { scheduleTarget, closeScheduleViewing, setLeadConfirmation } = useRentalUi();
  // SAN-1075 — iOS overlays the keyboard instead of shrinking the layout viewport.
  // Reserve its height so Cancel/Submit stay reachable while the renter types.
  const keyboardInset = useKeyboardInset();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(Boolean(scheduleTarget), closeScheduleViewing, panelRef);
  // SAN-1203 — `setSubmitting` is async, so a fast double-click could fire two
  // requests before the button disables. This ref is the synchronous lock.
  const submitLockRef = useRef(false);
  const [contact, dispatchContact] = useReducer(contactReducer, INITIAL_CONTACT);
  const [viewingDate, setViewingDate] = useState("");
  const [viewingTime, setViewingTime] = useState("");
  const [stage, setStage] = useState<"details" | "review">("details");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [draftOwner, setDraftOwner] = useState(scheduleTarget?.listingId);
  const preferredAt = viewingDate && viewingTime ? `${viewingDate}T${viewingTime}` : "";
  const today = medellinToday();
  // SAN-1059 — the message alone cannot tell the renter what to do next, so the failure carries
  // the typed code as well. It also carries the apartment it belongs to: opening a different
  // apartment must never inherit the previous one's "not accepting requests" error.
  const [failure, setFailure] = useState<{
    listingId: string;
    message: string;
    code: ScheduleViewingErrorCode | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOpen = Boolean(scheduleTarget);
  // Derive from changed listing identity during render (no cascading effect).
  if (scheduleTarget?.listingId !== draftOwner) {
    setDraftOwner(scheduleTarget?.listingId);
    setViewingDate("");
    setViewingTime("");
    setStage("details");
    setCalendarOpen(false);
    setDateError(null);
    setFailure(null);
  }
  // Derived, not stored: a failure is only ever shown for the apartment that produced it.
  const activeFailure =
    failure && scheduleTarget && failure.listingId === scheduleTarget.listingId ? failure : null;
  // Preserve the renter's filters; only the apartment changes. Rendered client-side only,
  // because this block needs a selected apartment.
  const resultsHref = `/rentals${typeof window === "undefined" ? "" : window.location.search}`;

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

  /**
   * The submit path, callable from the form and from "Refresh apartment". Re-running it is a
   * real re-check against the server: if the apartment came back, the request completes without
   * the renter retyping anything.
   */
  const submitRequest = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setFailure(null);
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
      setViewingDate("");
      setViewingTime("");
      setStage("details");
      setCalendarOpen(false);
    } catch (err) {
      // The modal stays open with the typed values intact so the renter can fix
      // the time or retry rather than losing the request.
      setFailure({
        listingId: scheduleTarget.listingId,
        message: err instanceof Error ? err.message : "Submit failed",
        code: err instanceof ScheduleViewingError ? err.code : null,
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === "details") {
      const instant = preferredAt ? resolvePreferredAtInstant(preferredAt) : null;
      if (!instant || !isFutureInstant(instant)) {
        setDateError(instant ? "Choose a viewing time in the future." : "Choose a valid viewing date and time.");
        return;
      }
      setDateError(null);
      setFailure(null);
      setStage("review");
      return;
    }
    await submitRequest();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      style={keyboardInset ? { paddingBottom: keyboardInset + 16 } : undefined}
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
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-4 shadow-lg"
        style={{ maxHeight: `calc(100dvh - 2rem - ${keyboardInset}px)` }}
      >
        <h2 id="schedule-viewing-title" className="text-lg font-semibold">
          Schedule a viewing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scheduleTarget.title} · {scheduleTarget.neighborhood}
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          {stage === "details" ? (
            <>
              <label className="block text-sm">
                <span className="font-medium">Your name</span>
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
                  name="name" autoComplete="name" required maxLength={120} value={contact.name.value}
                  onChange={(e) => dispatchContact({ type: "typed", field: "name", value: e.target.value })}
                  disabled={submitting} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Email</span>
                <input type="email" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
                  name="email" autoComplete="email" required maxLength={120} value={contact.email.value}
                  onChange={(e) => dispatchContact({ type: "typed", field: "email", value: e.target.value })}
                  disabled={submitting} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Phone (optional)</span>
                <input type="tel" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
                  name="phone" autoComplete="tel" value={contact.phone.value}
                  onChange={(e) => dispatchContact({ type: "typed", field: "phone", value: e.target.value })}
                  disabled={submitting} />
              </label>
              <div className="space-y-2">
                <p id="viewing-date-label" className="text-sm font-medium">Preferred viewing date (Medellín time)</p>
                <Button type="button" variant="outline" aria-expanded={calendarOpen}
                  aria-controls="viewing-day-calendar" data-testid="viewing-date-trigger"
                  className="min-h-11 w-full justify-start font-normal"
                  onClick={() => setCalendarOpen((value) => !value)} disabled={submitting}>
                  {viewingDate ? `Selected: ${viewingDate}` : "Choose a viewing date"}
                </Button>
                {calendarOpen ? (
                  <div id="viewing-day-calendar" data-testid="viewing-date-calendar" className="overflow-x-auto">
                    <Calendar mode="single" selected={viewingDate ? localDate(viewingDate) : undefined}
                      onSelect={(day) => {
                        setViewingDate(day ? dateOnly(day) : "");
                        setDateError(null);
                        if (day) setCalendarOpen(false);
                      }}
                      disabled={{ before: localDate(today) }}
                      className="mx-auto w-full max-w-full [--cell-size:2.5rem] min-[390px]:[--cell-size:2.75rem] [&_.rdp-month]:mx-auto"
                      aria-labelledby="viewing-date-label" />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground" data-testid="viewing-date-selection">
                  {viewingDate ? `Selected: ${viewingDate}` : "No date selected"}
                </p>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Preferred viewing time (Medellín time)</span>
                <input type="time" name="viewingTime" data-testid="viewing-time" step={900} required
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  value={viewingTime} onChange={(e) => { setViewingTime(e.target.value); setDateError(null); }}
                  disabled={submitting} />
              </label>
              <p className="text-xs text-muted-foreground">This is a request, not a confirmed appointment.</p>
              {dateError ? <p role="alert" data-testid="viewing-date-error" className="text-sm text-destructive">{dateError}</p> : null}
            </>
          ) : (
            <section data-testid="schedule-viewing-review" aria-label="Review your viewing request" className="space-y-3 text-sm">
              <h3 className="text-base font-semibold">Review your request</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-words">
                <dt className="text-muted-foreground">Apartment</dt><dd>{scheduleTarget.title}</dd>
                <dt className="text-muted-foreground">Name</dt><dd>{contact.name.value.trim()}</dd>
                <dt className="text-muted-foreground">Email</dt><dd>{contact.email.value.trim()}</dd>
                {contact.phone.value.trim() ? <><dt className="text-muted-foreground">Phone</dt><dd>{contact.phone.value.trim()}</dd></> : null}
                <dt className="text-muted-foreground">Requested time</dt><dd>{viewingDate} at {viewingTime} (Medellín)</dd>
              </dl>
              <p className="text-xs text-muted-foreground">Your requested time is not yet confirmed by the host.</p>
            </section>
          )}
          {activeFailure ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="schedule-viewing-error"
            >
              {activeFailure.message}
            </p>
          ) : null}
          {activeFailure?.code === "LISTING_UNAVAILABLE" ? (
            <ScheduleViewingRecovery
              submitting={submitting}
              resultsHref={resultsHref}
              onRecheck={submitRequest}
              onChooseAnother={closeScheduleViewing}
            />
          ) : null}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t bg-background px-4 py-3">
            <Button type="button" variant="outline" className="min-h-11"
              onClick={closeScheduleViewing} disabled={submitting}>Cancel</Button>
            {stage === "review" ? (
              <Button type="button" variant="outline" data-testid="schedule-viewing-edit" className="min-h-11"
                onClick={() => { setStage("details"); setFailure(null); }} disabled={submitting}>Edit</Button>
            ) : null}
            <Button type="submit" className="min-h-11"
              data-testid={stage === "review" ? "schedule-viewing-submit" : "schedule-viewing-review-button"}
              disabled={submitting}>
              {submitting ? "Submitting…" : stage === "review" ? "Request viewing" : "Review request"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
