import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signJwtHs256 } from "../_shared/jwt.ts";

// Run recovered Edge handlers without a live DB, Stripe or Gemini network call.
// This exercises the actual HTTP handler and its Supabase fetch contract.
Deno.test("recovered event handlers: reject cross-user photos; scan through atomic audited RPC only", async () => {
  const oldFetch = globalThis.fetch;
  const oldServe = Deno.serve;
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STAFF_LINK_SECRET",
    "QR_SIGNING_SECRET",
    "GEMINI_API_KEY",
  ];
  const originals = keys.map((key) => Deno.env.get(key));
  const organizer = "11111111-1111-4111-8111-111111111111";
  const stranger = "22222222-2222-4222-8222-222222222222";
  const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const assetId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const secretStaff = "test-staff-secret-not-production";
  const secretQr = "test-qr-secret-not-production";
  const handlers: Array<(req: Request) => Promise<Response>> = [];
  let actingUser = stranger;
  let ownerlessEvent = false;
  let adminRole = false;
  let modelScore: number | null = 0.82;
  let currentStaffVersion = 0;
  const calls: Array<
    { path: string; body: string; authorization: string | null }
  > = [];
  try {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:59999");
    Deno.env.set("SUPABASE_ANON_KEY", "testing-publishable-key");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "testing-secret-key");
    Deno.env.set("STAFF_LINK_SECRET", secretStaff);
    Deno.env.set("QR_SIGNING_SECRET", secretQr);
    Deno.env.set("GEMINI_API_KEY", "TEST_KEY_NO_NETWORK");
    // Capture handler registration instead of opening a listener.
    Deno.serve = ((handler: (req: Request) => Promise<Response>) => {
      handlers.push(handler);
      return {} as Deno.HttpServer;
    }) as typeof Deno.serve;
    let scanResult = "consumed";
    globalThis.fetch = (async (
      input: Request | URL | string,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof Request
          ? input.url
          : String(input),
      );
      const body = String(init?.body ?? "");
      calls.push({
        path: url.pathname,
        body,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/auth/v1/user")) {
        return json({
          id: actingUser,
          aud: "authenticated",
          role: "authenticated",
        });
      }
      if (url.pathname.endsWith("/rest/v1/event_media_assets")) {
        return json({
          id: assetId,
          event_id: eventId,
          asset_type: "hero_photo",
          storage_bucket: "event-media",
          storage_path: "legitimate/photo.png",
          mime_type: "image/png",
          size_bytes: 32,
        });
      }
      if (url.pathname.endsWith("/rest/v1/events")) {
        if (url.searchParams.get("select")?.includes("organizer_id")) {
          return json({
            id: eventId,
            organizer_id: ownerlessEvent ? null : organizer,
            name: "Test event",
            staff_link_version: currentStaffVersion,
          });
        }
        return json({
          staff_link_version: currentStaffVersion,
          event_end_time: "2030-12-31",
          organizer_id: ownerlessEvent ? null : organizer,
        });
      }
      if (url.pathname.endsWith("/rest/v1/rpc/is_admin")) {
        return json(adminRole);
      }
      if (url.pathname.endsWith("/rest/v1/rpc/bump_staff_link_version")) {
        currentStaffVersion++;
        return json(currentStaffVersion);
      }
      if (
        url.pathname.endsWith("/rest/v1/rpc/ticket_validate_consume_audited")
      ) {
        const result = scanResult;
        scanResult = "already_used";
        return json({ result, details: {} });
      }
      if (url.pathname.endsWith("/rest/v1/event_check_ins")) return json([]);
      if (
        url.pathname.includes(
          "/storage/v1/object/event-media/legitimate/photo.png",
        )
      ) {
        return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]), {
          headers: { "Content-Type": "image/png" },
        });
      }
      if (url.hostname === "generativelanguage.googleapis.com") {
        const responseData = {
          verdict: "approved",
          flags: [],
          reasons: ["Test stored asset"],
          ...(modelScore === null ? {} : { ai_moderation_score: modelScore }),
        };
        return json({
          candidates: [{
            content: {
              role: "model",
              parts: [{ text: JSON.stringify(responseData) }],
            },
            finishReason: "STOP",
          }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        });
      }
      if (url.pathname.endsWith("/rest/v1/ai_runs")) return json({}, 201);
      throw new Error(
        "Unexpected outgoing fetch: " + url.origin + url.pathname,
      );
    }) as typeof fetch;

    // The scanner and photo handler each register one Deno.serve callback.
    await import("../ticket-validate/index.ts");
    await import("../event-photo-moderate/index.ts");
    await import("../event-staff-link-generator/index.ts");
    assertEquals(handlers.length, 3);

    // The scanner uses a custom staff JWT, but never permits an unsigned
    // request. The generator requires the authenticated caller's user JWT.
    const noAuthScan = await handlers[0](
      new Request("http://localhost/functions/v1/ticket-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_token: "invalid-qr-token-long-enough",
          scanner_event_id: eventId,
        }),
      }),
    );
    assertEquals(noAuthScan.status, 401);
    assertEquals((await noAuthScan.json()).error.code, "STAFF_TOKEN_INVALID");
    const noAuthLink = await handlers[2](
      new Request("http://localhost/functions/v1/event-staff-link-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, ttl_hours: 24 }),
      }),
    );
    assertEquals(noAuthLink.status, 401);
    assertEquals(
      calls.filter((c) =>
        c.path.endsWith("/rest/v1/rpc/bump_staff_link_version")
      ).length,
      0,
    );

    const photo = await handlers[1](
      new Request("http://localhost/functions/v1/event-photo-moderate", {
        method: "POST",
        headers: {
          Authorization: "Bearer qa-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_id: assetId,
          storage_url: "https://127.0.0.1:5432/private",
          context: { organizer_id: stranger },
        }),
      }),
    );
    assertEquals(photo.status, 403);
    const photoText = await photo.text();
    assertStringIncludes(photoText, "FORBIDDEN");
    assertEquals(calls.filter((c) => c.path.includes("storage/v1")).length, 0);
    assertEquals(
      calls.filter((c) => c.path.includes("generativelanguage")).length,
      0,
    );

    // Authorized source: trusted DB asset is downloaded from Supabase Storage
    // and Gemini receives inline bytes; the malicious caller URL is never used.
    actingUser = organizer;
    const ownedPhotoRequest = () =>
      new Request("http://localhost/functions/v1/event-photo-moderate", {
        method: "POST",
        headers: {
          Authorization: "Bearer qa-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_id: assetId,
          storage_url: "https://127.0.0.1:5432/private",
          context: { organizer_id: stranger },
        }),
      });
    const allowedPhoto = await handlers[1](ownedPhotoRequest());
    assertEquals(allowedPhoto.status, 200);
    const allowedPhotoBody = await allowedPhoto.json();
    assertEquals(allowedPhotoBody.data.ai_moderation_score, 0.82);
    assertEquals(
      calls.filter((c) => c.path.includes("/storage/v1/object/")).length,
      1,
    );
    const geminiCalls = calls.filter((c) => c.path.includes("generateContent"));
    assertEquals(geminiCalls.length, 1);
    assertStringIncludes(geminiCalls[0].body, "inlineData");
    // The stored 8-byte PNG fixture is encoded correctly regardless of Deno
    // runtime support for Uint8Array.prototype.toBase64().
    assertStringIncludes(geminiCalls[0].body, "iVBORwECAwQ=");
    assertEquals(geminiCalls[0].body.includes("127.0.0.1:5432"), false);

    // Even if the SDK returns a malformed score, the endpoint cannot
    // pretend that an image received a clean verdict.
    modelScore = null;
    const malformedPhoto = await handlers[1](ownedPhotoRequest());
    assertEquals(malformedPhoto.status, 502);
    assertStringIncludes(await malformedPhoto.text(), "INVALID_MODEL_RESULT");
    modelScore = 0.82;
    actingUser = stranger;

    // JWT authentication alone is insufficient: a different organizer is
    // rejected before a staff link can be minted.
    const linkRequest = () =>
      new Request("http://localhost/functions/v1/event-staff-link-generator", {
        method: "POST",
        headers: {
          Authorization: "Bearer qa-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_id: eventId, ttl_hours: 24 }),
      });
    const forbiddenLink = await handlers[2](linkRequest());
    assertEquals(forbiddenLink.status, 403);
    assertStringIncludes(await forbiddenLink.text(), "NOT_ORGANIZER");
    adminRole = true;
    const adminLink = await handlers[2](linkRequest());
    assertEquals(adminLink.status, 200);
    assertEquals((await adminLink.json()).success, true);
    ownerlessEvent = true;
    const ownerlessLink = await handlers[2](linkRequest());
    assertEquals(ownerlessLink.status, 200);
    const ownerlessToken = (await ownerlessLink.json()).data.jwt;
    // Issuer must be present even when the event has no owner.
    const { verifyJwtHs256 } = await import("../_shared/jwt.ts");
    const ownerlessDecoded = await verifyJwtHs256(ownerlessToken, secretStaff);
    assertEquals(ownerlessDecoded.valid, true);
    if (ownerlessDecoded.valid) {
      assertEquals(ownerlessDecoded.payload.issued_by, stranger);
      assertEquals(ownerlessDecoded.payload.organizer_id, null);
    }
    ownerlessEvent = false;
    adminRole = false;
    actingUser = organizer;
    const validLink = await handlers[2](linkRequest());
    assertEquals(validLink.status, 200);
    const linkBody = await validLink.json();
    assertEquals(linkBody.success, true);
    assertStringIncludes(
      linkBody.data.staff_link_url,
      "/staff/check-in/" + eventId,
    );
    assertEquals(linkBody.data.staff_link_version, 0);

    const staffToken = await signJwtHs256({
      role: "door_staff",
      event_id: eventId,
      organizer_id: organizer,
      staff_link_version: 0,
      exp: Math.floor(Date.now() / 1000) + 600,
    }, secretStaff);
    const qrToken = await signJwtHs256({
      event_id: eventId,
      attendee_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      exp: Math.floor(Date.now() / 1000) + 600,
    }, secretQr);
    const scanRequest = () =>
      new Request("http://localhost/functions/v1/ticket-validate", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + staffToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qr_token: qrToken, scanner_event_id: eventId }),
      });
    const accepted = await handlers[0](scanRequest());
    assertEquals(accepted.status, 200);
    assertEquals((await accepted.json()).success, true);
    const rejected = await handlers[0](scanRequest());
    assertEquals((await rejected.json()).error.code, "ALREADY_USED");
    assertEquals(
      calls.filter((c) =>
        c.path.endsWith("/rpc/ticket_validate_consume_audited")
      ).length,
      2,
    );
    assertEquals(
      calls.filter((c) => c.path.endsWith("/rpc/ticket_validate_consume"))
        .length,
      0,
    );
    assertEquals(
      calls.filter((c) => c.path.endsWith("/event_check_ins")).length,
      0,
    );
    // Revocation and invalid QR signature must have different audit results,
    // without ever consuming a ticket on either rejected request.
    currentStaffVersion = 1;
    const revoked = await handlers[0](scanRequest());
    assertEquals(revoked.status, 401);
    assertStringIncludes(await revoked.text(), "STAFF_TOKEN_REVOKED");
    const scanLogs = calls.filter((c) => c.path.endsWith("/event_check_ins"));
    assertEquals(scanLogs.length, 1);
    const revokedAudit = JSON.parse(scanLogs[0].body);
    assertEquals(revokedAudit.result, "staff_token_revoked");
    assertEquals(revokedAudit.details.reason, "staff_token_revoked");

    const forgedQrRequest = new Request(
      "http://localhost/functions/v1/ticket-validate",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + staffToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qr_token: "not-a-real-qr-signature-but-long-enough",
          scanner_event_id: eventId,
        }),
      },
    );
    const forged = await handlers[0](forgedQrRequest);
    assertEquals(forged.status, 200);
    assertEquals((await forged.json()).error.code, "INVALID_SIGNATURE");
    const failureAudits = calls.filter((c) =>
      c.path.endsWith("/event_check_ins")
    );
    assertEquals(failureAudits.length, 2);
    assertEquals(JSON.parse(failureAudits[1].body).result, "invalid_signature");
    assertEquals(
      failureAudits.filter((record) =>
        JSON.parse(record.body).result === "staff_token_revoked"
      ).length,
      1,
    );

    // Organizer and Super Admin must revoke through the JWT-scoped RPC.
    const revokeRequest = () =>
      new Request("http://localhost/functions/v1/event-staff-link-generator", {
        method: "POST",
        headers: {
          Authorization: "Bearer qa-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_id: eventId, revoke: true }),
      });
    actingUser = organizer;
    const ownerRevoked = await handlers[2](revokeRequest());
    assertEquals(ownerRevoked.status, 200);
    assertEquals((await ownerRevoked.json()).data.staff_link_version, 2);
    const revocation = calls.find((c) =>
      c.path.endsWith("/rest/v1/rpc/bump_staff_link_version")
    );
    assertEquals(revocation?.authorization, "Bearer qa-token");
    actingUser = stranger;
    adminRole = false;
    assertEquals((await handlers[2](revokeRequest())).status, 403);
    adminRole = true;
    ownerlessEvent = true;
    const adminRevoked = await handlers[2](revokeRequest());
    assertEquals(adminRevoked.status, 200);
    assertEquals((await adminRevoked.json()).data.staff_link_version, 3);
    assertEquals(
      calls.filter((c) =>
        c.path.endsWith("/rpc/ticket_validate_consume_audited")
      ).length,
      2,
    );
  } finally {
    globalThis.fetch = oldFetch;
    Deno.serve = oldServe;
    keys.forEach((key, i) => {
      const original = originals[i];
      if (original === undefined) Deno.env.delete(key);
      else Deno.env.set(key, original);
    });
  }
});
