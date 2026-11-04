import Link from "next/link";
import { EmptyState } from "@/components/empty/empty-state";
import { EVENT_TIME_ZONE } from "@/lib/events/format-event";
import type { NotificationItem } from "@/lib/notifications/notification-item";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past a week, "6 days ago" stops being more useful than the calendar date. */
const RELATIVE_WINDOW_MS = 7 * DAY_MS;

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function absoluteLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(date);
}

/**
 * Recent updates read better as "2 hours ago"; anything older (or in the future,
 * where a clock skew would otherwise print a negative age) gets a fixed date.
 */
export function formatNotificationTimestamp(
  createdAt: string,
  now: Date = new Date(),
): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";

  const elapsed = now.getTime() - created.getTime();
  if (elapsed < 0 || elapsed >= RELATIVE_WINDOW_MS) return absoluteLabel(created);
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return RELATIVE.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return RELATIVE.format(-Math.floor(elapsed / HOUR_MS), "hour");
  return RELATIVE.format(-Math.floor(elapsed / DAY_MS), "day");
}

type NotificationListProps = {
  notifications: NotificationItem[];
  /** Injected so the rendered timestamps are deterministic in tests. */
  now?: Date;
};

/**
 * SAN-1620 S5 — the reader for rows the ticket-availability trigger already
 * writes. It shows the stored title and body verbatim and adds nothing: an
 * update about tickets is not a purchase, a booking, or an issued pass.
 */
// skipcq: JS-0067 - shared server component
export function NotificationList({ notifications, now = new Date() }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        testId="notifications-empty"
        title="No updates yet."
        description="Follow an event and we will tell you here when tickets go on sale."
      />
    );
  }

  return (
    <ul data-testid="notifications-list" className="space-y-3">
      {notifications.map((notification) => (
        <li
          key={notification.id}
          data-testid="notification-row"
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {notification.title}
            </p>
            <time
              dateTime={notification.createdAt}
              className="text-xs text-muted-foreground"
            >
              {formatNotificationTimestamp(notification.createdAt, now)}
            </time>
          </div>
          {notification.body ? (
            <p className="mt-2 text-sm text-muted-foreground">{notification.body}</p>
          ) : null}
          {notification.eventId ? (
            <Link
              href={`/events/${notification.eventId}`}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open event
              <span aria-hidden className="ml-1">
                →
              </span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
