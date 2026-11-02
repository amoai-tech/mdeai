import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCheckoutBuyer } from "../_shared/ticket-checkout-buyer.ts";

Deno.test("ticket buyer: absent or public keys stay anonymous", async () => {
  let calls = 0;
  const verify = async () => {
    calls++;
    return "unreachable";
  };
  for (const header of [null, "Bearer public_test", "Bearer anon_legacy"]) {
    assertEquals(
      await resolveCheckoutBuyer(header, "public_test", "anon_legacy", verify),
      { buyerUserId: null, invalidSession: false },
    );
  }
  assertEquals(calls, 0);
});

Deno.test("ticket buyer: authenticated JWT is verified, never decoded or trusted", async () => {
  const expected = "11111111-1111-4111-8111-111111111111";
  let seenHeader: string | null = null;
  const result = await resolveCheckoutBuyer(
    "Bearer signed-jwt",
    "public_test",
    "anon_legacy",
    async (authorization) => {
      seenHeader = authorization;
      return expected;
    },
  );
  assertEquals(seenHeader, "Bearer signed-jwt");
  assertEquals(result, { buyerUserId: expected, invalidSession: false });
});

Deno.test("ticket buyer: invalid or forged user JWT fails closed", async () => {
  const result = await resolveCheckoutBuyer(
    "Bearer forged-user-token",
    "public_test",
    "anon_legacy",
    async () => null,
  );
  assertEquals(result, { buyerUserId: null, invalidSession: true });
});
