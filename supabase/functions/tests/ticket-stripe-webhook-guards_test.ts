import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import Stripe from "npm:stripe@23.0.0";
import {
  expiredSessionMatchesOrder,
  webhookEventMatchesMode,
  webhookSecretsAreDistinct,
} from "../_shared/ticket-stripe-webhook-guards.ts";

// The same SDK and async signature verification used by the real Edge Function.
const stripe = new Stripe("rk_test_fixture_not_a_real_key", {
  apiVersion: "2026-09-30.endive",
  httpClient: Stripe.createFetchHttpClient(),
});
// Generate ephemeral fixture signing keys: never hardcode Stripe-shaped secrets.
// These values exist only during this unit test and never leave the test process.
const sandboxSecret = crypto.randomUUID();
const liveSecret = crypto.randomUUID();

async function signedEvent(livemode: boolean, signingSecret: string) {
  const payload = JSON.stringify({
    id: "evt_fixture",
    object: "event",
    type: "checkout.session.completed",
    livemode,
    data: { object: { id: livemode ? "cs_live_fixture" : "cs_test_fixture" } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    ),
  );
  const signature = Array.from(bytes).map((v) =>
    v.toString(16).padStart(2, "0")
  ).join("");
  const header = `t=${timestamp},v1=${signature}`;
  return { payload, header };
}

Deno.test("valid sandbox signature still requires sandbox livemode", async () => {
  const { payload, header } = await signedEvent(false, sandboxSecret);
  const event = await stripe.webhooks.constructEventAsync(
    payload,
    header,
    sandboxSecret,
  );
  assert(webhookEventMatchesMode("sandbox", event.livemode));
  assertEquals(webhookEventMatchesMode("live", event.livemode), false);
  await assertRejects(() =>
    stripe.webhooks.constructEventAsync(payload, header, liveSecret)
  );
});

Deno.test("valid live signature requires livemode true, even if secrets accidentally match", async () => {
  const { payload, header } = await signedEvent(true, liveSecret);
  const event = await stripe.webhooks.constructEventAsync(
    payload,
    header,
    liveSecret,
  );
  assert(webhookEventMatchesMode("live", event.livemode));
  assertEquals(webhookEventMatchesMode("sandbox", event.livemode), false);
  assertEquals(webhookSecretsAreDistinct(liveSecret, liveSecret), false);
  assertEquals(webhookSecretsAreDistinct(liveSecret, sandboxSecret), true);
});

Deno.test("signed sandbox event cannot pass the live-mode guard, including when both secrets match", async () => {
  const { payload, header } = await signedEvent(false, liveSecret);
  const event = await stripe.webhooks.constructEventAsync(
    payload,
    header,
    liveSecret,
  );
  assertEquals(webhookEventMatchesMode("live", event.livemode), false);
  assertEquals(webhookSecretsAreDistinct(liveSecret, liveSecret), false);
});

Deno.test("tampering with signed event payload is rejected", async () => {
  const { payload, header } = await signedEvent(false, sandboxSecret);
  await assertRejects(() =>
    stripe.webhooks.constructEventAsync(
      payload.replace("evt_fixture", "evt_modified"),
      header,
      sandboxSecret,
    )
  );
});

Deno.test("expiry only cancels matching persisted Session in the matching mode", () => {
  assert(expiredSessionMatchesOrder("cs_test_own", "cs_test_own", "sandbox"));
  assert(expiredSessionMatchesOrder("cs_live_own", "cs_live_own", "live"));
  for (const saved of ["cs_test_other", "cs_live_other", null, undefined]) {
    assertEquals(
      expiredSessionMatchesOrder(saved, "cs_test_own", "sandbox"),
      false,
    );
  }
  assertEquals(
    expiredSessionMatchesOrder("cs_test_own", "cs_test_own", "live"),
    false,
  );
  assertEquals(
    expiredSessionMatchesOrder("cs_live_own", "cs_live_own", "sandbox"),
    false,
  );
});
