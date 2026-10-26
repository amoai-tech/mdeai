import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("checkout=success"),
}));
vi.mock("@/components/tickets/checkout-wallet-link", () => ({
  CheckoutWalletLink: () => null,
  readWalletAccess: () => null,
}));

import { EventCheckoutNotice } from "../event-checkout-notice";

describe("Stripe return is not payment proof", () => {
  it("never claims payment or ticket delivery before wallet confirms a paid order", () => {
    const html = renderToStaticMarkup(<EventCheckoutNotice />);
    expect(html).toContain("Checking payment status — not yet confirmed.");
    expect(html).not.toContain("Payment received");
    expect(html).not.toContain("Payment confirmed");
    expect(html).toContain("A return from Stripe does not confirm payment.");
  });
});
