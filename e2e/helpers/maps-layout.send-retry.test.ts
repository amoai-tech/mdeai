import { describe, expect, it, vi } from "vitest";
import {
  CONCIERGE_ACCEPT_GRACE_MS,
  submitConciergeMessageWithRetry,
  type ConciergeSubmitPort,
} from "./maps-layout";

/**
 * Deterministic regression tests for the concierge submit retry contract.
 *
 * These assert control flow only, so they never touch a browser, a clock, or the
 * network. The production behaviour they pin down:
 *
 *   first submit draws a reaction      → no retry
 *   first discarded, second reacts     → pass
 *   both discarded                     → throw (never silently continue)
 *
 * The acceptance signal is the app's own `/api/*` request. It is deliberately
 * NOT "the composer cleared": measured against the live site the composer never
 * clears, even for a send that rendered cards in 500ms, so gating on it made
 * every query look dropped and every query get submitted twice.
 */

function makePort(reactions: boolean[]) {
  const order: string[] = [];
  let call = 0;
  const armReactionWatch = vi.fn(() => {
    order.push("arm");
    const result = reactions.at(call) ?? false;
    call += 1;
    return Promise.resolve(result);
  });
  const submit = vi.fn(() => {
    order.push("submit");
    return Promise.resolve();
  });
  return {
    port: { armReactionWatch, submit } satisfies ConciergeSubmitPort,
    submit,
    armReactionWatch,
    order,
  };
}

describe("submitConciergeMessageWithRetry", () => {
  it("does not retry when the first submit draws a reaction", async () => {
    const { port, submit, armReactionWatch } = makePort([true]);

    await expect(
      submitConciergeMessageWithRetry(port, "suggest restaurants medellin"),
    ).resolves.toBeUndefined();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(armReactionWatch).toHaveBeenCalledTimes(1);
    expect(armReactionWatch).toHaveBeenCalledWith(CONCIERGE_ACCEPT_GRACE_MS);
  });

  it("passes when the first submit is discarded and the second reacts", async () => {
    const { port, submit, armReactionWatch } = makePort([false, true]);

    await expect(
      submitConciergeMessageWithRetry(port, "suggest restaurants medellin"),
    ).resolves.toBeUndefined();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(armReactionWatch).toHaveBeenCalledTimes(2);
  });

  it("throws when both submits are discarded", async () => {
    const { port, submit, armReactionWatch } = makePort([false, false]);

    await expect(
      submitConciergeMessageWithRetry(port, "suggest restaurants medellin"),
    ).rejects.toThrow(/not accepted after 2 attempts/i);

    // Exactly two attempts: a retry, not an unbounded loop.
    expect(submit).toHaveBeenCalledTimes(2);
    expect(armReactionWatch).toHaveBeenCalledTimes(2);
  });

  it("never performs a third submit, even when every submit is discarded", async () => {
    const { port, submit } = makePort([false, false, true]);

    await expect(
      submitConciergeMessageWithRetry(port, "good specialty coffee in Laureles"),
    ).rejects.toThrow();

    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("arms the reaction watch before every submit", async () => {
    // The reaction lands within milliseconds of an accepted submit, so a watch
    // armed afterwards would miss it and the helper would retry a live send.
    const { port, order } = makePort([true]);

    await submitConciergeMessageWithRetry(port, "anything");

    expect(order).toEqual(["arm", "submit"]);
  });

  it("arms before submitting on the retry as well", async () => {
    const { port, order } = makePort([false, true]);

    await submitConciergeMessageWithRetry(port, "anything");

    expect(order).toEqual(["arm", "submit", "arm", "submit"]);
  });

  it("names the discarded query and the missing reaction in the thrown error", async () => {
    const { port } = makePort([false, false]);
    const query = "suggest restaurants medellin";

    // `toThrow(string)` is a substring match, so no RegExp is built from data.
    await expect(submitConciergeMessageWithRetry(port, query)).rejects.toThrow(
      `Query: ${JSON.stringify(query)}`,
    );
    await expect(submitConciergeMessageWithRetry(port, query)).rejects.toThrow(
      /issued no\s+request/i,
    );
  });

  it("propagates a submit rejection instead of swallowing it", async () => {
    const order: string[] = [];
    const submit = vi.fn(() => {
      order.push("submit");
      return Promise.reject(new Error("composer detached"));
    });
    const armReactionWatch = vi.fn(() => {
      order.push("arm");
      return Promise.resolve(false);
    });

    await expect(
      submitConciergeMessageWithRetry({ armReactionWatch, submit }, "anything"),
    ).rejects.toThrow("composer detached");

    // A submit that could not even be attempted is not a retryable discard.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["arm", "submit"]);
  });

  it("honours an explicit grace window", async () => {
    const { port, armReactionWatch } = makePort([true]);

    await submitConciergeMessageWithRetry(port, "anything", 1_250);

    expect(armReactionWatch).toHaveBeenCalledWith(1_250);
  });
});
