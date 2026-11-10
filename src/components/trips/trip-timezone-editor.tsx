"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTripTimezone } from "@/app/trips/actions";
import { DEFAULT_TRIP_TIMEZONE } from "@/lib/trips/timezone";

const TIMEZONE_OPTIONS = [
  "America/Bogota",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function availableTimezones(current: string): string[] {
  return TIMEZONE_OPTIONS.includes(current)
    ? TIMEZONE_OPTIONS
    : [current, ...TIMEZONE_OPTIONS];
}

type TripTimezoneEditorProps = {
  tripId: string;
  timeZone: string;
};

export function TripTimezoneEditor({
  tripId,
  timeZone,
}: TripTimezoneEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState(timeZone || DEFAULT_TRIP_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const zones = availableTimezones(value);

  async function onChange(next: string) {
    if (pending) return;
    const previous = value;
    setValue(next);
    setError(null);
    setPending(true);
    try {
      const result = await updateTripTimezone({ tripId, timezone: next });
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      setValue(result.timezone);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-testid="trip-timezone-editor" className="mt-2">
      <label
        htmlFor="trip-timezone"
        className="mr-2 text-xs font-medium text-muted-foreground"
      >
        Itinerary timezone
      </label>
      <select
        id="trip-timezone"
        data-testid="trip-timezone-select"
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="ml-2 text-xs text-muted-foreground">Saving…</span>
      ) : null}
      {error ? (
        <p
          role="alert"
          data-testid="trip-timezone-error"
          className="mt-1 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
