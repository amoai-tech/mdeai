// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TicketDetailClient } from "@/components/tickets/ticket-detail-client";
import type { WalletOrderPayload } from "@/lib/tickets/wallet-types";

vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="qr-encoded-value" data-value={value} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href} {...props}>{children}</a>,
}));

const orderId = "11111111-1111-4111-8111-111111111111";
const attendee = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "MDE Test Guest",
  email: null,
  status: "active",
  qr_token: "test-attendee-qr-token",
};
const base: WalletOrderPayload = {
  order: {
    id: orderId, short_id: "MDE-QA", status: "paid",
    total_cents: 4000000, currency: "COP",
    buyer_name: "MDE Test Guest", buyer_email: null,
    quantity: 1, stripe_session_id: "cs_test_abc",
  },
  event: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "MDE Test Event", address: null, city: "Medellín",
    event_start_time: "2099-02-24T01:00:00+00:00",
    event_end_time: "2099-02-24T06:00:00+00:00",
  },
  attendees: [attendee],
};

const renderPayload = (payload: WalletOrderPayload) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(payload),
  }));
  return render(<TicketDetailClient orderId={orderId} accessToken="qa-capability-token" />);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ticket detail refunded/cancelled QR safety", () => {
  it("hides a fully refunded ticket QR and explains why entry is denied", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "refunded" },
      attendees: [{ ...attendee, status: "refunded" }],
    });
    const revoked = await screen.findByTestId("my-tickets-revoked");
    expect(revoked.textContent).toContain("Refunded — not valid for entry");
    expect(screen.queryByTestId("my-tickets-qr")).toBeNull();
    expect(screen.getByText("Refunded amount")).toBeTruthy();
  });

  it("hides the QR if a full refund completes before attendee state updates", async () => {
    renderPayload({ ...base, order: { ...base.order, status: "refunded" } });
    expect((await screen.findByTestId("my-tickets-revoked")).textContent)
      .toContain("Refunded");
    expect(screen.queryByTestId("my-tickets-qr")).toBeNull();
  });

  it("hides a cancelled admission", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "cancelled" },
      attendees: [{ ...attendee, status: "cancelled" }],
    });
    const revoked = await screen.findByTestId("my-tickets-revoked");
    expect(revoked.textContent).toContain("Cancelled — not valid for entry");
    expect(screen.queryByTestId("my-tickets-qr")).toBeNull();
  });

  it("keeps the remaining active QR after a partial refund", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "partial_refund", quantity: 2 },
      attendees: [
        { ...attendee, status: "refunded" },
        { ...attendee, id: "44444444-4444-4444-8444-444444444444", qr_token: "valid-second-ticket" },
      ],
    });
    const qr = await screen.findByTestId("my-tickets-qr");
    expect(qr.getAttribute("data-qr-state")).toBe("valid");
    expect(screen.getByTestId("qr-encoded-value").getAttribute("data-value")).toBe("valid-second-ticket");
    expect(screen.queryByTestId("my-tickets-revoked")).toBeNull();
  });

  it("keeps the original valid QR for a paid active ticket", async () => {
    renderPayload(base);
    const qr = await screen.findByTestId("my-tickets-qr");
    expect(qr.getAttribute("data-qr-state")).toBe("valid");
    expect(screen.queryByTestId("my-tickets-revoked")).toBeNull();
  });
});

describe("partial refund labels", () => {
  it("does not claim the entire order amount was refunded when no ticket remains active", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "partial_refund" },
      attendees: [{ ...attendee, status: "refunded" }],
    });
    await screen.findByTestId("my-tickets-revoked");
    expect(screen.queryByTestId("my-tickets-qr")).toBeNull();
    expect(screen.queryByText("Refunded amount")).toBeNull();
    expect(screen.getByText("TEST payment")).toBeTruthy();
  });
});

describe("revoked passes cannot be shared", () => {
  it("offers no Share action on a fully refunded ticket", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "refunded" },
      attendees: [{ ...attendee, status: "refunded" }],
    });
    await screen.findByTestId("my-tickets-revoked");
    expect(screen.queryByTestId("my-tickets-action-share")).toBeNull();
  });

  it("offers no Share action on a cancelled ticket", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "cancelled" },
      attendees: [{ ...attendee, status: "cancelled" }],
    });
    await screen.findByTestId("my-tickets-revoked");
    expect(screen.queryByTestId("my-tickets-action-share")).toBeNull();
  });

  it("keeps Share for a paid active ticket", async () => {
    renderPayload(base);
    await screen.findByTestId("my-tickets-qr");
    expect(screen.getByTestId("my-tickets-action-share")).toBeTruthy();
  });

  it("keeps Share for the remaining active ticket after a partial refund", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "partial_refund", quantity: 2 },
      attendees: [
        { ...attendee, status: "refunded" },
        { ...attendee, id: "44444444-4444-4444-8444-444444444444", qr_token: "valid-second-ticket" },
      ],
    });
    await screen.findByTestId("my-tickets-qr");
    expect(screen.getByTestId("my-tickets-action-share")).toBeTruthy();
  });
});

describe("refunded order with no attendee row", () => {
  it("still explains the refund instead of claiming no QR exists yet", async () => {
    renderPayload({
      ...base,
      order: { ...base.order, status: "refunded" },
      attendees: [],
    });
    expect((await screen.findByTestId("my-tickets-revoked")).textContent).toContain(
      "Refunded — not valid for entry",
    );
    expect(screen.queryByText("No QR available for this order yet.")).toBeNull();
    expect(screen.queryByTestId("my-tickets-action-share")).toBeNull();
  });
});
