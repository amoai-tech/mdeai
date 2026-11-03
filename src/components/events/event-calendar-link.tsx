import { CalendarPlus } from "lucide-react";
import { eventCalendarPath } from "@/lib/events/event-calendar";

/**
 * "Add to calendar" download link for the public event page.
 *
 * A plain anchor, not `next/link`: the target is a route handler that returns an
 * `attachment; filename=…` calendar file, so client-side page navigation would be wrong.
 * The link is presentation-only — it never claims attendance or a booking.
 */
export function EventCalendarLink({
  event,
  className,
}: {
  event: { id: string; slug: string | null };
  className?: string;
}) {
  return (
    <a
      href={eventCalendarPath(event)}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      }
    >
      <CalendarPlus aria-hidden className="size-4" />
      Add to calendar
    </a>
  );
}
