// SAN-1498: vote protection must fail closed.
// Deliberately dependency-free (no jsr/npm imports) so it runs anywhere, including offline.
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { verifyNonce, issueNonce } from "../_shared/nonce.ts";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(message + " — expected " + String(expected) + ", got " + String(actual));
  }
}

Deno.test("turnstile fails closed when the secret is missing outside dev/test", async () => {
  const prev = Deno.env.get("ENVIRONMENT");
  Deno.env.delete("ENVIRONMENT");
  Deno.env.delete("TURNSTILE_SECRET_KEY");
  assertEqual(await verifyTurnstile("any-token"), "misconfigured", "missing secret must not pass");
  if (prev !== undefined) Deno.env.set("ENVIRONMENT", prev);
});

Deno.test("turnstile only skips when explicitly in dev/test", async () => {
  Deno.env.set("ENVIRONMENT", "test");
  Deno.env.delete("TURNSTILE_SECRET_KEY");
  assertEqual(await verifyTurnstile(undefined), "ok", "dev/test may skip Turnstile");
  Deno.env.delete("ENVIRONMENT");
});

Deno.test("nonce fails closed when the secret is missing outside dev/test", async () => {
  Deno.env.delete("ENVIRONMENT");
  Deno.env.delete("VOTE_NONCE_SECRET");
  const r = await verifyNonce("a.b.c", "c1");
  assertEqual(r.valid, false, "missing nonce secret must not pass");
  assertEqual(r.reason, "nonce_not_configured", "reason must be explicit");
});

Deno.test("nonce is signed, binds contest and user, and rejects unsigned tokens", async () => {
  Deno.env.set("VOTE_NONCE_SECRET", "test-secret");
  const token = await issueNonce("c1", "user-1");
  assertEqual((await verifyNonce(token, "c1", "user-1")).valid, true, "valid nonce accepted");
  assertEqual((await verifyNonce(token, "other", "user-1")).valid, false, "contest mismatch rejected");
  assertEqual((await verifyNonce(token, "c1", "user-2")).valid, false, "another account cannot use the nonce");
  assertEqual((await verifyNonce("a.b.unsigned", "c1", "user-1")).valid, false, "unsigned token rejected");
  assertEqual((await verifyNonce(undefined, "c1", "user-1")).valid, false, "missing nonce rejected");
  Deno.env.delete("VOTE_NONCE_SECRET");
});
