"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import type { HostEventOption } from "@/lib/events/load-host-event-options";

type Props = {
  options: readonly HostEventOption[];
  selectedId: string;
  /** Canonical route this picker scopes, e.g. `/app/events/tickets`. */
  basePath: string;
  testId: string;
  label?: string;
};

/**
 * SAN-983 / 982 / 984 — one organizer-scoped event picker shared by tickets,
 * attendees and check-in. Selecting navigates with `?event=<id>` so every page
 * reads the same real event id and the URL survives a refresh.
 */
export function EventScopePicker({
  options,
  selectedId,
  basePath,
  testId,
  label = "Event",
}: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1 sm:max-w-md">
      <Label htmlFor={`${testId}-select`} className="text-xs uppercase text-muted-foreground">
        {label}
      </Label>
      <select
        id={`${testId}-select`}
        data-testid={testId}
        defaultValue={selectedId}
        onChange={(change) => {
          const next = change.target.value;
          if (next) router.push(`${basePath}?event=${encodeURIComponent(next)}`);
        }}
        className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name} — {option.status}
          </option>
        ))}
      </select>
    </div>
  );
}
