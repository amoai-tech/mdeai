import { z } from "zod";

/**
 * SAN-885 — pure input contract for editing one saved event.
 *
 * Kept free of Supabase/Next imports so the parsing rules and the optimistic
 * timestamp mapping can be unit-tested without a server action harness.
 */
export const eventUpdateInputSchema = z
  .object({
    eventId: z.string().uuid(),
    /** `events.updated_at` the editor loaded; used for stale-write rejection. */
    expectedUpdatedAt: z.string().min(1, "Missing revision"),
    name: z.string().trim().min(3, "Name needs at least 3 characters").max(140),
    description: z.string().trim().max(4000).optional().default(""),
    /** `datetime-local` value interpreted in America/Bogota. */
    eventStartTime: z.string().min(1, "Start time is required"),
    eventEndTime: z.string().optional().default(""),
    address: z.string().trim().max(240).optional().default(""),
    city: z.string().trim().max(80).optional().default("Medellín"),
  })
  .superRefine((value, ctx) => {
    const start = parseBogotaLocal(value.eventStartTime);
    if (Number.isNaN(start)) {
      ctx.addIssue({
        code: "custom",
        path: ["eventStartTime"],
        message: "Start time is not a valid date",
      });
    }
    if (value.eventEndTime) {
      const end = parseBogotaLocal(value.eventEndTime);
      if (Number.isNaN(end)) {
        ctx.addIssue({
          code: "custom",
          path: ["eventEndTime"],
          message: "End time is not a valid date",
        });
      } else if (!Number.isNaN(start) && end <= start) {
        ctx.addIssue({
          code: "custom",
          path: ["eventEndTime"],
          message: "End time must be after the start time",
        });
      }
    }
  });

export type EventUpdateInput = z.infer<typeof eventUpdateInputSchema>;

export type EventUpdateFieldErrors = Partial<
  Record<keyof EventUpdateInput, string>
>;

export type EventUpdateResult =
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      code: "UNAUTHENTICATED" | "INVALID" | "CONFLICT" | "NOT_FOUND" | "FAILED";
      message: string;
      fieldErrors?: EventUpdateFieldErrors;
    };

/** Colombia has no DST; the offset is a constant. Keeping it explicit avoids
 *  "works on my laptop" parses when the browser timezone is not Bogotá. */
export const BOGOTA_OFFSET = "-05:00";

/** Parse a `datetime-local` string as America/Bogota wall-clock time. */
export function parseBogotaLocal(value: string): number {
  if (!value) return Number.NaN;
  const normalized = value.length === 16 ? `${value}:00` : value;
  return Date.parse(`${normalized}${BOGOTA_OFFSET}`);
}

/** Render a stored timestamptz as a `datetime-local` value in Bogotá time. */
export function formatBogotaInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  // `hour` can render "24" at midnight in some ICU versions; normalize it.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** The exact `public.events` columns a manual edit is allowed to change. */
export function toEventUpdatePatch(input: EventUpdateInput, nowIso: string) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    event_start_time: new Date(parseBogotaLocal(input.eventStartTime)).toISOString(),
    event_end_time: input.eventEndTime
      ? new Date(parseBogotaLocal(input.eventEndTime)).toISOString()
      : null,
    address: input.address?.trim() ? input.address.trim() : null,
    city: input.city?.trim() ? input.city.trim() : null,
    updated_at: nowIso,
  };
}
