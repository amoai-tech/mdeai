import { describe, expect, it } from "vitest";
import { scheduleViewingInputSchema } from "@/lib/leads/schedule-viewing-schema";
import {
  buildAttendeePayload,
  ticketCheckoutInputSchema,
} from "@/lib/tickets/ticket-checkout-schema";

describe("scheduleViewingInputSchema", () => {
  const base = {
    listingId: "apt-123",
    listingTitle: "2BR Laureles",
    neighborhood: "Laureles",
    name: "Camila Test",
    email: "camila@example.com",
    preferredAt: "2099-06-01T10:00",
  };

  it("accepts valid rental lead payload", () => {
    const parsed = scheduleViewingInputSchema.parse(base);
    expect(parsed.listingId).toBe("apt-123");
  });

  it("rejects missing email", () => {
    expect(() =>
      scheduleViewingInputSchema.parse({ ...base, email: "not-an-email" }),
    ).toThrow();
  });

  // SAN-1203 — a viewing request is only meaningful with a future time.
  it("rejects a missing preferredAt", () => {
    expect(() =>
      scheduleViewingInputSchema.parse({ ...base, preferredAt: undefined }),
    ).toThrow();
  });

  it("rejects a past preferredAt", () => {
    expect(() =>
      scheduleViewingInputSchema.parse({ ...base, preferredAt: "2020-01-01T10:00" }),
    ).toThrow();
  });

  it("rejects a malformed preferredAt", () => {
    expect(() =>
      scheduleViewingInputSchema.parse({ ...base, preferredAt: "next tuesday" }),
    ).toThrow();
  });
});

describe("ticketCheckoutInputSchema", () => {
  const base = {
    eventId: "22222222-2222-2222-2222-000000000001",
    ticketId: "33333333-3333-3333-3333-000000000001",
    quantity: 2,
    buyerEmail: "andres@example.com",
    buyerName: "Andres Test",
    idempotencyKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    returnPath: "/events/reina-de-antioquia-2026-finals",
  };

  it("accepts valid checkout payload", () => {
    expect(ticketCheckoutInputSchema.parse(base).quantity).toBe(2);
  });

  it("buildAttendeePayload mirrors quantity", () => {
    const rows = buildAttendeePayload("a@b.co", "Andres", 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.full_name).toBe("Andres");
  });
});
