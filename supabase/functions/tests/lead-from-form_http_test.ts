// SAN-1623 — Opt-in HTTP proof against the *local* Supabase Edge runtime and database.
// Run the local stack and serve this function, then set CONTACT_HOST_HTTP_TEST_LOCAL=1,
// CONTACT_HOST_HTTP_TEST_APARTMENT_ID and CONTACT_HOST_HTTP_TEST_SERVICE_ROLE_KEY.
// Never point this test at a remote or production Supabase project.
import { assert, assertEquals } from "jsr:@std/assert@1";

const enabled = Deno.env.get("CONTACT_HOST_HTTP_TEST_LOCAL") === "1";

Deno.test({
  name: "lead-from-form local HTTP: save once, replay, reject a reused ID and clean up",
  ignore: !enabled,
  fn: async () => {
    const base = Deno.env.get("CONTACT_HOST_HTTP_TEST_LOCAL_URL") ??
      "http://127.0.0.1:54621";
    const origin = new URL(base);
    assert(
      origin.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
      "This test must never contact the remote/production backend",
    );
    const apartmentId = Deno.env.get("CONTACT_HOST_HTTP_TEST_APARTMENT_ID");
    const serviceKey = Deno.env.get("CONTACT_HOST_HTTP_TEST_SERVICE_ROLE_KEY");
    assert(apartmentId && serviceKey, "Local apartment ID and local service key are required");

    const requestId = crypto.randomUUID();
    const payload = {
      apartment_id: apartmentId,
      request_id: requestId,
      name: "Contact Host QA",
      email: "san1623-contact@example.test",
      move_when: "soon",
      message: "Local integration test, remove after verification",
    };
    const headers = { "content-type": "application/json" };
    const serviceHeaders = {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    };
    const inboxUrl = new URL("/rest/v1/landlord_inbox", origin);
    inboxUrl.searchParams.set("form_request_id", `eq.${requestId}`);
    inboxUrl.searchParams.set("select", "id,form_request_id");

    const submit = async (body: typeof payload) => {
      const response = await fetch(new URL("/functions/v1/lead-from-form", origin), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    try {
      const first = await submit(payload);
      assertEquals(first.status, 201, "first request should persist");
      const savedId = first.body?.data?.lead_id;
      assert(typeof savedId === "string" && savedId.length > 0);

      const replay = await submit(payload);
      assertEquals(replay.status, 200, "retry must return the original inquiry");
      assertEquals(replay.body.data.lead_id, savedId);
      assertEquals(replay.body.data.replayed, true);

      const conflict = await submit({
        ...payload,
        email: "another-renter@example.test",
      });
      assertEquals(conflict.status, 409, "request identity must be immutable");

      const rows = await fetch(inboxUrl, { headers: serviceHeaders });
      assertEquals(rows.status, 200);
      const stored: Array<{ id: string }> = await rows.json();
      assertEquals(stored.map((row) => row.id), [savedId], "exactly one inbox row");
    } finally {
      // Cleanup even on assertion/network failure, and verify there is no residue.
      const cleanup = await fetch(inboxUrl, {
        method: "DELETE",
        headers: serviceHeaders,
      });
      assertEquals(cleanup.status, 204, "test row must be removed");
      const readback = await fetch(inboxUrl, { headers: serviceHeaders });
      assertEquals(readback.status, 200);
      assertEquals(await readback.json(), [], "no test inquiry may remain");
    }
  },
});
