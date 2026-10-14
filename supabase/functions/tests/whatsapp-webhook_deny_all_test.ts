// SAN-1443 containment regression test.
// Deliberately dependency-free (no jsr/npm imports): a security regression test must run
// with no network so it can be executed anywhere, including an offline reviewer's machine.
import { DENY_STATUS, handler } from "../whatsapp-webhook/handler.ts";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(message + " — expected " + String(expected) + ", got " + String(actual));
  }
}

function assertTrue(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

const FN_DIR = new URL("../whatsapp-webhook/", import.meta.url);

async function source(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(name, FN_DIR));
}

Deno.test("deny-all — POST is refused with 403 and a GONE code", async () => {
  const res = handler(new Request("https://x.test/whatsapp-webhook", {
    method: "POST",
    body: JSON.stringify({ results: [{ from: "+57", message: { text: "hi" } }] }),
  }));
  assertEqual(res.status, DENY_STATUS, "POST must be denied");
  const body = await res.json() as { error: { code: string } };
  assertEqual(body.error.code, "GONE", "deny body must carry the GONE code");
});

Deno.test("deny-all — GET is refused", () => {
  assertEqual(handler(new Request("https://x.test/whatsapp-webhook")).status, DENY_STATUS, "GET must be denied");
});

Deno.test("deny-all — OPTIONS preflight is 204 and adds no CORS wildcard", () => {
  const res = handler(new Request("https://x.test/whatsapp-webhook", { method: "OPTIONS" }));
  assertEqual(res.status, 204, "preflight must be 204");
  assertTrue(res.headers.get("access-control-allow-origin") === null, "no CORS origin may be added");
});

Deno.test("deny-all — no privileged capability in the deployed source", async () => {
  const combined = (await source("handler.ts")) + "\n" + (await source("index.ts"));
  const forbidden = [
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "createClient",
    "INFOBIP",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "Deno.env.get",
    "fetch(",
  ];
  for (const needle of forbidden) {
    assertTrue(
      !combined.includes(needle),
      "forbidden capability " + needle + " must not return to the retired endpoint",
    );
  }
  assertTrue(combined.includes("export function handler"), "the pure handler export must remain");
});
