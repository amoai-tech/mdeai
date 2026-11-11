import type { TripItemRow } from "./trip-item-types";
import {
  DEFAULT_TRIP_TIMEZONE,
  resolveTripTimeZone,
} from "./timezone";

export { DEFAULT_TRIP_TIMEZONE } from "./timezone";

export type ItineraryDayGroup = {
  dayKey: string;
  label: string;
  items: TripItemRow[];
};

export type ScheduleOverlap = {
  id: string;
  dayKey: string;
  dayLabel: string;
  itemAId: string;
  itemBId: string;
  itemATitle: string;
  itemBTitle: string;
  message: string;
};

const UNSCHEDULED_KEY = "unscheduled";

function isValidInstant(iso: string): boolean {
  return Number.isFinite(new Date(iso).getTime());
}

/** Calendar date in the trip's timezone, not the browser's timezone. */
function dayKeyFromIso(iso: string, timeZone: string): string | null {
  if (!isValidInstant(iso)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function formatDayLabel(dayKey: string): string {
  if (dayKey === UNSCHEDULED_KEY) return "Unscheduled";
  const [year, month, day] = dayKey.split("-").map(Number);
  // Noon UTC avoids a date shift when the label is formatted.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function itemSortValue(item: TripItemRow): number {
  return item.start_at ? new Date(item.start_at).getTime() : Number.POSITIVE_INFINITY;
}

/** Deterministic order: scheduled time, then creation time, then id. */
export function compareTripItems(a: TripItemRow, b: TripItemRow): number {
  const timeDiff = itemSortValue(a) - itemSortValue(b);
  if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
  if (a.start_at === null && b.start_at !== null) return 1;
  if (a.start_at !== null && b.start_at === null) return -1;
  const createdDiff = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

/** Group trip_items by the trip-local calendar day. */
export function groupTripItemsByDay(
  items: TripItemRow[],
  timeZone: string = DEFAULT_TRIP_TIMEZONE,
): ItineraryDayGroup[] {
  const zone = resolveTripTimeZone(timeZone);
  const buckets = new Map<string, TripItemRow[]>();

  for (const item of items) {
    const key = item.start_at ? dayKeyFromIso(item.start_at, zone) : null;
    const bucketKey = key ?? UNSCHEDULED_KEY;
    const list = buckets.get(bucketKey) ?? [];
    list.push(item);
    buckets.set(bucketKey, list);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === UNSCHEDULED_KEY) return 1;
    if (b === UNSCHEDULED_KEY) return -1;
    return a.localeCompare(b);
  });

  return keys.map((dayKey) => ({
    dayKey,
    label: formatDayLabel(dayKey),
    items: (buckets.get(dayKey) ?? []).sort(compareTripItems),
  }));
}

function itemWindow(item: TripItemRow): { start: number; end: number } | null {
  if (!item.start_at) return null;
  const start = new Date(item.start_at).getTime();
  const end = item.end_at
    ? new Date(item.end_at).getTime()
    : start + 60 * 60 * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

/** Detect time overlaps among scheduled items on the same trip-local day. */
export function detectScheduleOverlaps(
  items: TripItemRow[],
  timeZone: string = DEFAULT_TRIP_TIMEZONE,
): ScheduleOverlap[] {
  const zone = resolveTripTimeZone(timeZone);
  const overlaps: ScheduleOverlap[] = [];
  const groups = groupTripItemsByDay(items, zone).filter(
    (group) => group.dayKey !== UNSCHEDULED_KEY,
  );

  for (const group of groups) {
    const scheduled = group.items.filter((item) => item.start_at);
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];
        const wa = itemWindow(a);
        const wb = itemWindow(b);
        if (!wa || !wb) continue;
        if (wa.start >= wb.end || wb.start >= wa.end) continue;

        overlaps.push({
          id: `${a.id}:${b.id}`,
          dayKey: group.dayKey,
          dayLabel: group.label,
          itemAId: a.id,
          itemBId: b.id,
          itemATitle: a.title,
          itemBTitle: b.title,
          message: `${formatTime(a.start_at!, zone)} ${a.title} overlaps ${formatTime(b.start_at!, zone)} ${b.title}`,
        });
      }
    }
  }

  return overlaps;
}

export function formatItemTimeRange(
  item: TripItemRow,
  timeZone: string = DEFAULT_TRIP_TIMEZONE,
): string {
  if (!item.start_at || !isValidInstant(item.start_at)) return "Time TBD";
  const zone = resolveTripTimeZone(timeZone);
  const start = formatTime(item.start_at, zone);
  if (!item.end_at || !isValidInstant(item.end_at)) return start;
  return `${start} – ${formatTime(item.end_at, zone)}`;
}

export function formatTripDateTime(
  iso: string,
  timeZone: string = DEFAULT_TRIP_TIMEZONE,
): string {
  const zone = resolveTripTimeZone(timeZone);
  const dayKey = dayKeyFromIso(iso, zone);
  if (!dayKey) return "Time TBD";
  return `${formatDayLabel(dayKey)} · ${formatTime(iso, zone)}`;
}

/** First scheduled item at or after `now`, ordered deterministically. */
export function getUpNextItem(
  items: TripItemRow[],
  now: Date = new Date(),
): TripItemRow | null {
  const nowMs = now.getTime();
  return (
    items
      .filter((item) => item.start_at && isValidInstant(item.start_at))
      .sort(compareTripItems)
      .find((item) => new Date(item.start_at!).getTime() >= nowMs) ?? null
  );
}

export function itemTypeLabel(type: TripItemRow["item_type"]): string {
  const labels: Record<TripItemRow["item_type"], string> = {
    event: "Event",
    restaurant: "Restaurant",
    venue: "Café / venue",
    rental: "Rental",
    poi: "Place",
    showing: "Viewing",
    booking: "Booking",
    custom_note: "Note",
    other: "Other",
  };
  return labels[type] ?? type;
}
