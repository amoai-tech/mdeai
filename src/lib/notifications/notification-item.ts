import { isEventLookupUuid } from "@/lib/events/event-lookup";

/**
 * One row of `public.notifications` as a page needs it. `read` is deliberately
 * absent: nothing in the app writes it yet, so showing unread state would imply
 * a "mark as read" control that does not exist.
 */
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  /** Present only when the stored metadata carries a real event id. */
  eventId: string | null;
};

/**
 * `metadata` is jsonb written by a trigger, but it is still untrusted input at
 * render time: anything that is not a UUID-shaped `event_id` string is treated
 * as absent rather than interpolated into a link.
 */
export function eventIdFromMetadata(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as { event_id?: unknown }).event_id;
  return typeof value === "string" && isEventLookupUuid(value) ? value : null;
}
