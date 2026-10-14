/**
 * Non-production signing fixture for the WhatsApp webhook tests.
 *
 * Codacy flags any literal HMAC key. This constant has no production value and never leaves
 * tests; the finding is an accepted, documented false positive for test fixtures.
 */
import { createHmac } from "node:crypto";

export const TEST_APP_SECRET = "mde-whatsapp-unit-test-app-secret";

export function signMetaBody(body: string, secret: string = TEST_APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
