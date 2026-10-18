"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * SAN-1526 · contest start/end inputs.
 *
 * `datetime-local` speaks the admin local wall clock; the database stores timestamptz. Rendering
 * a UTC slice showed an admin in UTC-5 a 05:00 start for a 00:00 contest, and submitting that
 * string as if it were local shifted the saved time again. This converts UTC -> local for
 * display and local -> UTC for submission.
 *
 * Parsing is explicit (year/month/day/hour/minute) rather than relying on `new Date(string)`:
 * the engine rule differs between date-time and date-only forms, and a schedule is not a place
 * to depend on that nuance.
 *
 * Hydration: the server cannot know the browser timezone, so the first client render must match
 * the server. `useSyncExternalStore` gives a server snapshot of false and a client snapshot of
 * true, so the local value appears only after hydration without a setState-in-effect.
 */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

export function parseLocalInput(local: string): LocalParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

/** Local wall clock -> UTC ISO. Empty when the value is not a date-time. */
export function toUtcIso(local: string): string {
  const parts = parseLocalInput(local);
  if (!parts) return "";
  const date = new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function utcSlice(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

/** UTC ISO -> local wall clock, for the visible input. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-md border border-border/60 bg-background px-3";

export function ContestDateFields({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const hydrated = useSyncExternalStore(subscribeNever, onClient, onServer);
  // Only the edited value is state. Everything else derives from props, so a server revalidation
  // can never leave a stale timestamp in the hidden field.
  const [startEdit, setStartEdit] = useState<string | null>(null);
  const [endEdit, setEndEdit] = useState<string | null>(null);

  const startValue = startEdit ?? (hydrated ? toLocalInput(startsAt) : utcSlice(startsAt));
  const endValue = endEdit ?? (hydrated ? toLocalInput(endsAt) : utcSlice(endsAt));
  const startHidden = startEdit === null ? startsAt : toUtcIso(startEdit);
  const endHidden = endEdit === null ? endsAt : toUtcIso(endEdit);

  return (
    <>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Starts</span>
        <input
          className={INPUT_CLASS}
          type="datetime-local"
          required
          value={startValue}
          onChange={(event) => setStartEdit(event.target.value)}
        />
      </label>
      <input type="hidden" name="starts_at" value={startHidden} />
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Ends</span>
        <input
          className={INPUT_CLASS}
          type="datetime-local"
          required
          value={endValue}
          onChange={(event) => setEndEdit(event.target.value)}
        />
      </label>
      <input type="hidden" name="ends_at" value={endHidden} />
    </>
  );
}