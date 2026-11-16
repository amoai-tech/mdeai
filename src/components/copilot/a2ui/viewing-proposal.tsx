"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isFutureInstant, resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";

/**
 * SAN-1658 — an editable viewing proposal shown by the AI.
 *
 * It owns one small draft (date + time) and nothing else. The AI may seed the
 * draft, but once the renter edits a field the AI can no longer change it, so a
 * later render of the same node never clobbers an edit. "Continue" reads the
 * latest draft at click time, validates it, and hands it to the existing
 * ScheduleViewingModal. This component never calls the API: the modal's own
 * "Request viewing" is the only write.
 */
export type ViewingProposalViewProps = {
  title: string;
  neighborhood: string;
  /** The AI's proposed date (YYYY-MM-DD) and time (HH:mm), both optional. */
  initialDate?: string;
  initialTime?: string;
  /** False when the apartment cannot take a request here; Continue is then unavailable. */
  canRequest: boolean;
  onContinue: (preferredAt: string) => void;
};

export type ViewingDraftCheck = "ok" | "missing" | "invalid" | "past";

/** One validation for the proposal; the modal re-validates again at review. */
export function checkViewingDraft(date: string, time: string): ViewingDraftCheck {
  if (!date || !time) return "missing";
  const instant = resolvePreferredAtInstant(`${date}T${time}`);
  if (!instant) return "invalid";
  return isFutureInstant(instant) ? "ok" : "past";
}

const MESSAGES: Record<Exclude<ViewingDraftCheck, "ok">, string> = {
  missing: "Choose a date and a time.",
  invalid: "Choose a valid date and time.",
  past: "Choose a viewing time in the future.",
};

export function ViewingProposalView({
  title,
  neighborhood,
  initialDate = "",
  initialTime = "",
  canRequest,
  onContinue,
}: ViewingProposalViewProps) {
  const [draft, setDraft] = useState({ date: initialDate, time: initialTime });
  const [seed, setSeed] = useState({ date: initialDate, time: initialTime });
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The AI may refine its proposal only until the renter touches a field.
  if (!edited && (seed.date !== initialDate || seed.time !== initialTime)) {
    setSeed({ date: initialDate, time: initialTime });
    setDraft({ date: initialDate, time: initialTime });
  }

  const change = (field: "date" | "time", value: string) => {
    setEdited(true);
    setError(null);
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const handleContinue = () => {
    const check = checkViewingDraft(draft.date, draft.time);
    if (check !== "ok") {
      setError(MESSAGES[check]);
      return;
    }
    onContinue(`${draft.date}T${draft.time}`);
  };

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card p-3 text-sm"
      data-testid="a2ui-viewing-proposal"
    >
      <div>
        <p className="font-medium">Viewing request</p>
        <p className="text-muted-foreground">
          {title} · {neighborhood}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">Preferred date</span>
          <input
            type="date"
            data-testid="viewing-proposal-date"
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
            value={draft.date}
            onChange={(event) => change("date", event.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-medium">Preferred time (Medellín)</span>
          <input
            type="time"
            step={900}
            data-testid="viewing-proposal-time"
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
            value={draft.time}
            onChange={(event) => change("time", event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">This requests a time; it is not confirmed.</p>
      {error ? (
        <p role="alert" data-testid="viewing-proposal-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {canRequest ? null : (
        <p role="status" data-testid="viewing-proposal-unavailable" className="text-xs text-muted-foreground">
          This apartment is not taking viewing requests here.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          className="min-h-11"
          data-testid="viewing-proposal-continue"
          disabled={!canRequest}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
