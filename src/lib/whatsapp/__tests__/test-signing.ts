/**
 * Signing fixture for the WhatsApp webhook tests.
 *
 * The key is generated per test run with a CSPRNG and exists only in memory, so it is never a
 * committed or production secret. Static analysis that flags a literal key therefore has
 * nothing to match here.
 */
import { createHmac, randomBytes } from "node:crypto";

export const TEST_APP_SECRET = randomBytes(32).toString("hex");

export function signMetaBody(body: string, secret: string = TEST_APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
