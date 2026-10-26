import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { deriveCheckoutAccessToken, duplicateCheckoutCode } from "../_shared/checkout-access-token.ts";

Deno.test("same checkout key and server secret always get the same unique reservation token", async () => {
  const first = await deriveCheckoutAccessToken("private-qr-signing-key", "same-request");
  const retry = await deriveCheckoutAccessToken("private-qr-signing-key", "same-request");
  assertEquals(first, retry);
  assertEquals(first.length, 64);
  assertNotEquals(first, await deriveCheckoutAccessToken("private-qr-signing-key", "other-request"));
  assertNotEquals(first, await deriveCheckoutAccessToken("another-secret", "same-request"));
});

Deno.test("a cancelled checkout key is terminal, pending or unknown may retry", () => {
  assertEquals(duplicateCheckoutCode("cancelled"), "CHECKOUT_KEY_CANCELLED");
  assertEquals(duplicateCheckoutCode("pending"), "CHECKOUT_IN_PROGRESS");
  assertEquals(duplicateCheckoutCode(null), "CHECKOUT_IN_PROGRESS");
});
