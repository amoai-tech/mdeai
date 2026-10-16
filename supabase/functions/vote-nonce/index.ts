import { createVoteNonceHandler } from "./handler.ts";
import { getServiceClient, getUserId } from "../_shared/supabase-clients.ts";
import { issueNonce } from "../_shared/nonce.ts";
import { allowRateDurable } from "../_shared/rate-limit.ts";

const service = getServiceClient();

Deno.serve(createVoteNonceHandler({
  service,
  getUserId,
  issueNonce,
  allowRate: (key, max, windowSeconds) => allowRateDurable(service, key, max, windowSeconds, { failClosed: true }),
}));
