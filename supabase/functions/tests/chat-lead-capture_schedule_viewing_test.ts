import { assertEquals } from "jsr:@std/assert@1";
import {
  createScheduleViewingBridge,
  isScheduleViewingRequest,
  parsePreferredShowingAt,
} from "../_shared/schedule-viewing-bridge.ts";

Deno.test("parsePreferredShowingAt — datetime-local Bogota", () => {
  const iso = parsePreferredShowingAt("2026-06-15T14:00");
  assertEquals(typeof iso, "string");
  assertEquals(iso?.includes("2026-06-15"), true);
});

Deno.test("parsePreferredShowingAt — canonical UTC milliseconds", () => {
  assertEquals(
    parsePreferredShowingAt("2026-10-15T14:00:00.000Z"),
    "2026-10-15T14:00:00.000Z",
  );
});

Deno.test("parsePreferredShowingAt — invalid", () => {
  assertEquals(parsePreferredShowingAt(""), null);
  assertEquals(parsePreferredShowingAt("not-a-date"), null);
});

Deno.test("isScheduleViewingRequest — rental + listing + preferred_at", () => {
  assertEquals(
    isScheduleViewingRequest(
      "rental",
      "750e8400-e29b-41d4-a716-446655440001",
      "2026-06-01T10:00",
    ),
    true,
  );
  assertEquals(isScheduleViewingRequest("host", "x", "2026-06-01T10:00"), false);
  assertEquals(isScheduleViewingRequest("rental", "x", ""), false);
});

Deno.test("createScheduleViewingBridge — one atomic RPC and no direct table mutation", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: {
          lead: { id: "11111111-1111-4111-8111-111111111111" },
          showing: { id: "22222222-2222-4222-8222-222222222222" },
          idempotent_replay: false,
        },
        error: null,
      });
    },
    from: () => {
      throw new Error("direct table access is forbidden");
    },
  } as unknown as Parameters<typeof createScheduleViewingBridge>[0];

  const result = await createScheduleViewingBridge(client, {
    listingId: "apt-laureles-001",
    preferredAt: "2026-10-15T14:00:00.000Z",
    idempotencyKey: "sv-test-atomic-123",
    userId: null,
    email: "camila@example.com",
    name: "Camila",
    phone: "+573001234567",
    source: "form",
    metadata: { neighborhood: "Laureles" },
  });

  assertEquals(result, {
    ok: true,
    result: {
      leadId: "11111111-1111-4111-8111-111111111111",
      showingId: "22222222-2222-4222-8222-222222222222",
      idempotentReplay: false,
    },
  });
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0]?.name, "p1_schedule_tour_atomic");
  assertEquals(rpcCalls[0]?.args.p_listing_id, "apt-laureles-001");
  assertEquals(rpcCalls[0]?.args.p_idempotency_key, "sv-test-atomic-123");
  assertEquals(rpcCalls[0]?.args.p_scheduled_at, "2026-10-15T14:00:00.000Z");
});

Deno.test("createScheduleViewingBridge — preserves idempotent replay result", async () => {
  const client = {
    rpc: () => Promise.resolve({
      data: {
        lead: { id: "11111111-1111-4111-8111-111111111111" },
        showing: { id: "22222222-2222-4222-8222-222222222222" },
        idempotent_replay: true,
      },
      error: null,
    }),
  } as unknown as Parameters<typeof createScheduleViewingBridge>[0];

  const result = await createScheduleViewingBridge(client, {
    listingId: "apt-laureles-001",
    preferredAt: "2026-10-15T14:00:00.000Z",
    idempotencyKey: "sv-test-replay-123",
    email: "camila@example.com",
  });

  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.result.idempotentReplay, true);
});

Deno.test("createScheduleViewingBridge — maps RPC validation errors", async () => {
  const client = {
    rpc: () => Promise.resolve({
      data: null,
      error: { code: "P0001", message: "p1_schedule_tour_atomic: listing is not requestable" },
    }),
  } as unknown as Parameters<typeof createScheduleViewingBridge>[0];

  const result = await createScheduleViewingBridge(client, {
    listingId: "inactive",
    preferredAt: "2026-10-15T14:00:00.000Z",
    idempotencyKey: "sv-test-error-123",
    email: "camila@example.com",
  });

  assertEquals(result, {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "p1_schedule_tour_atomic: listing is not requestable",
  });
});

Deno.test("createScheduleViewingBridge — rejects missing idempotency key before RPC", async () => {
  let called = false;
  const client = {
    rpc: () => {
      called = true;
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as Parameters<typeof createScheduleViewingBridge>[0];

  const result = await createScheduleViewingBridge(client, {
    listingId: "apt-laureles-001",
    preferredAt: "2026-10-15T14:00:00.000Z",
    email: "camila@example.com",
  });

  assertEquals(called, false);
  assertEquals(result, {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "idempotency_key is required",
  });
});

Deno.test("createScheduleViewingBridge — rejects incomplete RPC success payload", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: { lead: { id: "lead-only" } }, error: null }),
  } as unknown as Parameters<typeof createScheduleViewingBridge>[0];

  const result = await createScheduleViewingBridge(client, {
    listingId: "apt-laureles-001",
    preferredAt: "2026-10-15T14:00:00.000Z",
    idempotencyKey: "sv-test-incomplete-123",
    email: "camila@example.com",
  });

  assertEquals(result, {
    ok: false,
    code: "DB_ERROR",
    message: "Viewing request did not return committed records",
  });
});
