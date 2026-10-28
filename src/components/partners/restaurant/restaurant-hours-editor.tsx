"use client";

import { Label } from "@/components/ui/label";

import {
  HOURS_DAYS,
  type HoursDay,
  type OpeningHours,
} from "@/lib/restaurants/restaurant-owner-schema";

const DEFAULT_OPEN = "12:00";
const DEFAULT_CLOSE = "22:00";

/**
 * SAN-1541 — seven-day opening hours stored in `restaurants.hours_of_operation`.
 * A day that is not set stays unknown/closed; the editor never invents hours.
 */
export function RestaurantHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}) {
  function toggle(day: HoursDay, open: boolean) {
    const next = { ...value };
    if (open) next[day] = { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
    else delete next[day];
    onChange(next);
  }

  return (
    <div className="grid gap-2" data-testid="restaurant-hours-editor">
      {HOURS_DAYS.map((day) => {
        const hours = value[day];
        const open = Boolean(hours);
        return (
          <div
            key={day}
            className="grid grid-cols-[7.5rem_auto_1fr] items-center gap-2 rounded-lg border border-border px-3 py-2 sm:grid-cols-[8.5rem_auto_auto_auto]"
          >
            <label className="flex min-h-11 items-center gap-2 text-sm capitalize">
              <input
                type="checkbox"
                checked={open}
                disabled={disabled}
                onChange={(event) => toggle(day, event.target.checked)}
                aria-label={`${day} open`}
                data-testid={`hours-${day}-toggle`}
              />
              {day}
            </label>
            {open ? (
              <>
                <div className="grid gap-1">
                  <Label htmlFor={`hours-${day}-open`} className="text-xs text-muted-foreground">
                    Open
                  </Label>
                  <input
                    id={`hours-${day}-open`}
                    type="time"
                    value={hours?.open ?? DEFAULT_OPEN}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ ...value, [day]: { open: event.target.value, close: hours?.close ?? DEFAULT_CLOSE } })
                    }
                    className="min-h-11 rounded-md border border-border bg-background px-2 text-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`hours-${day}-close`} className="text-xs text-muted-foreground">
                    Close
                  </Label>
                  <input
                    id={`hours-${day}-close`}
                    type="time"
                    value={hours?.close ?? DEFAULT_CLOSE}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ ...value, [day]: { open: hours?.open ?? DEFAULT_OPEN, close: event.target.value } })
                    }
                    className="min-h-11 rounded-md border border-border bg-background px-2 text-sm"
                  />
                </div>
              </>
            ) : (
              <span className="col-span-2 text-sm text-muted-foreground">Not set</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
