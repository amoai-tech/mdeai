import { createVoteCastHandler } from "./handler.ts";
import { getServiceClient, getUserId } from "../_shared/supabase-clients.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { verifyNonce } from "../_shared/nonce.ts";
import { allowRateDurable } from "../_shared/rate-limit.ts";

const service = getServiceClient();

Deno.serve(createVoteCastHandler({
  service,
  verifyTurnstile,
  verifyNonce,
  getUserId,
  allowRate: (key, max, windowSeconds) => allowRateDurable(service, key, max, windowSeconds, { failClosed: true }),
}));
