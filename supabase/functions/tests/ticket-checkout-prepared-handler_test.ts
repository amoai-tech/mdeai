import { assertEquals } from "jsr:@std/assert@1";

// Import the real Edge function with its HTTP listener disabled for this test.
// Stripe and database operations are supplied by local test doubles.
async function loadCompletion() {
  const original = Deno.serve;
  try {
    Deno.serve =
      (() => ({ finished: Promise.resolve() })) as unknown as typeof Deno.serve;
    const module = await import("../ticket-checkout/index.ts");
    return module.completePreparedCheckout;
  } finally {
    Deno.serve = original;
  }
}

function makeDoubles(error: unknown, sessionId: string | null = null) {
  const rpcCalls: string[] = [];
  const chain = {
    select(_c: string) {
      return chain;
    },
    eq(_c: string, _v: string) {
      return chain;
    },
    maybeSingle: () => ({
      data: { status: "pending", stripe_session_id: sessionId },
      error: null,
    }),
  };
  const service = {
    from(_name: string) {
      return chain;
    },
    rpc(name: string) {
      rpcCalls.push(name);
      return { error: null };
    },
  };
  let createCount = 0;
  const stripe = {
    checkout: {
      sessions: {
        create() {
          createCount += 1;
          throw error;
        },
      },
    },
  };
  const prepared = {
    state: "prepared" as const,
    request_hash: "hash",
    order_id: "22222222-2222-4222-8222-222222222222",
    short_id: "MDE-TEST",
    access_token: "fixture",
    created_at_ms: Date.now(),
    stripe_params: { mode: "payment" as const },
  };
  return {
    rpcCalls,
    service,
    stripe,
    prepared,
    get createCount() {
      return createCount;
    },
  };
}

Deno.test("real handler: lost response then 401/403 with no saved Session must not cancel seats", async () => {
  const complete = await loadCompletion();
  for (const statusCode of [401, 403]) {
    const d = makeDoubles({ statusCode, type: "StripeAuthenticationError" });
    const result = await complete(
      new Request("https://www.mdeai.co"),
      d.service as never,
      d.stripe as never,
      "same-key",
      d.prepared as never,
    );
    assertEquals(result.status, 503);
    assertEquals(
      (await result.json()).error.code,
      "CHECKOUT_SESSION_RECONCILIATION_REQUIRED",
    );
    assertEquals(d.rpcCalls, []);
    assertEquals(d.createCount, 1);
  }
});
Deno.test("real handler: clear validation error on first attempt releases seats", async () => {
  const complete = await loadCompletion();
  const d = makeDoubles({ statusCode: 400, type: "StripeInvalidRequestError" });
  const result = await complete(
    new Request("https://www.mdeai.co"),
    d.service as never,
    d.stripe as never,
    "same-key",
    d.prepared as never,
    true,
  );
  assertEquals((await result.json()).error.code, "STRIPE_REJECTED");
  assertEquals(d.rpcCalls, ["ticket_checkout_cancel"]);
});

Deno.test("real handler: replayed 400, bound Session, or first 401 never releases seats", async () => {
  const complete = await loadCompletion();
  const cases: Array<[boolean, string | null, unknown]> = [
    [false, null, { statusCode: 400, type: "StripeInvalidRequestError" }],
    [true, "cs_bound", { statusCode: 400, type: "StripeInvalidRequestError" }],
    [true, null, { statusCode: 401, type: "StripeAuthenticationError" }],
  ];
  for (const [initial, sessionId, error] of cases) {
    const d = makeDoubles(error, sessionId);
    const result = await complete(
      new Request("https://www.mdeai.co"),
      d.service as never,
      d.stripe as never,
      "same-key",
      d.prepared as never,
      initial,
    );
    assertEquals(
      (await result.json()).error.code,
      "CHECKOUT_SESSION_RECONCILIATION_REQUIRED",
    );
    assertEquals(d.rpcCalls, []);
  }
});

Deno.test("real handler: lost response preserves reservation for same-key retry", async () => {
  const complete = await loadCompletion();
  const d = makeDoubles(new Error("connection lost"));
  const result = await complete(
    new Request("https://www.mdeai.co"),
    d.service as never,
    d.stripe as never,
    "same-key",
    d.prepared as never,
  );
  assertEquals((await result.json()).error.code, "CHECKOUT_RETRYABLE");
  assertEquals(d.rpcCalls, []);
});
