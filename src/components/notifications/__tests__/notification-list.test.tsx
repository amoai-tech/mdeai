// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NotificationList,
  formatNotificationTimestamp,
} from "@/components/notifications/notification-list";
import {
  eventIdFromMetadata,
  type NotificationItem,
} from "@/lib/notifications/notification-item";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const EVENT_ID = "a1b2c3d4-0001-0001-0001-000000000003";
const NOW = new Date("2026-11-03T18:00:00.000Z");

/** Exactly the row the SAN-1620 ticket-availability trigger writes. */
const triggerItem: NotificationItem = {
  id: "5f0b1c4e-0000-4000-8000-000000000001",
  type: "event_ticket_available",
  title: "Tickets are available for Grand Finals 2026",
  body: "A new ticket option is on sale. Open the event to see it.",
  createdAt: "2026-11-03T16:00:00.000Z",
  eventId: EVENT_ID,
};

function render(items: NotificationItem[]): string {
  return renderToStaticMarkup(<NotificationList notifications={items} now={NOW} />);
}

describe("SAN-1620 S5 — a follower can finally read the update written for them", () => {
  it("links an update with metadata.event_id to that event", () => {
    const html = render([triggerItem]);
    expect(html).toContain(`href="/events/${EVENT_ID}"`);
    expect(html).toContain("Open event");
  });

  it("reads back the stored title and body verbatim, plus a timestamp", () => {
    const html = render([triggerItem]);
    expect(html).toContain("Tickets are available for Grand Finals 2026");
    expect(html).toContain("A new ticket option is on sale. Open the event to see it.");
    expect(html).toContain('dateTime="2026-11-03T16:00:00.000Z"');
    expect(html).toContain("2 hours ago");
  });

  it("never claims a purchase, a booking, or an issued pass", () => {
    const html = render([triggerItem]);
    for (const overclaim of ["purchased", "booked", "paid", "confirmed", "reserved"]) {
      expect(html.toLowerCase()).not.toContain(overclaim);
    }
  });

  it("renders the empty state for someone with no updates", () => {
    const html = render([]);
    expect(html).toContain("No updates yet.");
    expect(html).not.toContain("/events/");
  });

  it("omits the event link when metadata carries no usable event id", () => {
    const html = render([{ ...triggerItem, eventId: null }]);
    expect(html).toContain("Tickets are available for Grand Finals 2026");
    expect(html).not.toContain("/events/");
    expect(html).not.toContain("Open event");
  });
});

describe("SAN-1620 S5 — metadata and timestamps stay trustworthy", () => {
  it("accepts only a UUID-shaped event_id from the stored jsonb", () => {
    expect(eventIdFromMetadata({ event_id: EVENT_ID, ticket_id: "x" })).toBe(EVENT_ID);
    expect(eventIdFromMetadata({ event_id: "not-an-id" })).toBeNull();
    expect(eventIdFromMetadata({ event_id: 42 })).toBeNull();
    expect(eventIdFromMetadata({})).toBeNull();
    expect(eventIdFromMetadata(null)).toBeNull();
    expect(eventIdFromMetadata([EVENT_ID])).toBeNull();
  });

  it("uses relative wording for the last week and a fixed date beyond it", () => {
    expect(formatNotificationTimestamp("2026-11-03T17:59:30.000Z", NOW)).toBe("Just now");
    expect(formatNotificationTimestamp("2026-11-03T15:00:00.000Z", NOW)).toBe("3 hours ago");
    expect(formatNotificationTimestamp("2026-11-01T18:00:00.000Z", NOW)).toBe("2 days ago");
    expect(formatNotificationTimestamp("2026-10-01T18:00:00.000Z", NOW)).toBe(
      "Oct 1, 2026, 1:00 PM",
    );
    // A clock skew must not print a negative age.
    expect(formatNotificationTimestamp("2026-11-04T18:00:00.000Z", NOW)).toBe(
      "Nov 4, 2026, 1:00 PM",
    );
    expect(formatNotificationTimestamp("not-a-date", NOW)).toBe("");
  });
});
