"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * SAN-1526 · contest start/end inputs.
 *
 * `datetime-local` speaks the admin local wall clock, while the database stores timestamptz.
 * Rendering a UTC slice showed an admin in UTC-5 a 05:00 start for a 00:00 contest, and
 * submitting that string as if it were local shifted the saved time again. This converts
 * UTC -> local for display and local -> UTC for submission, and leaves the original value
 * untouched when the field is not edited.
 *
 * Hydration: the server cannot know the browser timezone, so the first client render must match
 * the server. `useSyncExternalStore` gives a server snapshot of false and a client snapshot of
 * true, so the local value appears only after hydration without a setState-in-effect.
 */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

function utcSlice(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toUtcIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-md border border-border/60 bg-background px-3";

export function ContestDateFields({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const hydrated = useSyncExternalStore(subscribeNever, onClient, onServer);
  // `null` means "untouched", so an unchanged form resubmits the exact original timestamp.
  const [startEdit, setStartEdit] = useState<string | null>(null);
  const [endEdit, setEndEdit] = useState<string | null>(null);
  const [startUtc, setStartUtc] = useState(startsAt);
  const [endUtc, setEndUtc] = useState(endsAt);

  const startValue = startEdit ?? (hydrated ? toLocalInput(startsAt) : utcSlice(startsAt));
  const endValue = endEdit ?? (hydrated ? toLocalInput(endsAt) : utcSlice(endsAt));

  return (
    <>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Starts</span>
        <input
          className={INPUT_CLASS}
          type="datetime-local"
          required
          value={startValue}
          onChange={(event) => {
            setStartEdit(event.target.value);
            setStartUtc(toUtcIso(event.target.value));
          }}
        />
      </label>
      <input type="hidden" name="starts_at" value={startUtc} />
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Ends</span>
        <input
          className={INPUT_CLASS}
          type="datetime-local"
          required
          value={endValue}
          onChange={(event) => {
            setEndEdit(event.target.value);
            setEndUtc(toUtcIso(event.target.value));
          }}
        />
      </label>
      <input type="hidden" name="ends_at" value={endUtc} />
    </>
  );
}