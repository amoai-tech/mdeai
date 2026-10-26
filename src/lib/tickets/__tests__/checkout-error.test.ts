import { describe, expect, it } from "vitest";
import { classifyCheckoutError } from "../checkout-error";

describe("cancelled ticket checkout key", () => {
  it("does not offer retry with a burned idempotency key", () => {
    expect(classifyCheckoutError(
      "This checkout was cancelled; start a new checkout with a new key",
      "CHECKOUT_KEY_CANCELLED",
    )).toEqual({
      kind: "expired",
      heading: "Previous checkout cancelled",
      detail: "Close this checkout and start a new one for a new payment session.",
      canRetry: false,
    });
  });
  it("keeps an in-flight duplicate retriable", () => {
    expect(classifyCheckoutError(
      "Existing checkout is being prepared; retry shortly",
      "CHECKOUT_IN_PROGRESS",
    ).canRetry).toBe(true);
  });
});
