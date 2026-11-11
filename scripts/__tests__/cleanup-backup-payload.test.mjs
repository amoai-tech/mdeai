import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBackupPayload } from "../qa/cleanup-backup-payload.mjs";

// Synthetic markers stand in for what a real row holds.
const EVENT = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "[QA DELETE] Ana Perez — Calle 10 #40-20, call +57 300 123 4567",
  status: "draft",
  email: "ana.perez@example.com",
  phone: "+57 300 123 4567",
  description: "Ana's private event notes",
};
const IDENTITY = { id: "22222222-2222-2222-2222-222222222222", email: "qa-x@qa-isolation.mdeai.co" };

test("the artifact contains identifiers and counts only", () => {
  const payload = buildBackupPayload({
    createdAt: "2026-11-07T00:00:00.000Z",
    events: [EVENT],
    children: {
      event_attendees: [{ event_id: EVENT.id, name: "Luis Gomez", email: "luis@example.com" }],
      event_orders: [{ id: "33333333-3333-3333-3333-333333333333", event_id: EVENT.id }],
    },
    identities: [IDENTITY],
    impact: { profiles: 1, threads: 0, messages: 0 },
  });

  assert.equal(payload.status, "committed");
  assert.deepEqual(payload.events, [EVENT.id]);
  assert.deepEqual(payload.isolationIdentities, [IDENTITY.id]);

  // No free-form name, email, phone or description anywhere in the serialized artifact.
  const raw = JSON.stringify(payload);
  for (const marker of [
    "Ana Perez", "ana.perez@example.com", "+57 300 123 4567", "private event notes",
    "qa-x@qa-isolation.mdeai.co", "Luis Gomez", "luis@example.com",
  ]) {
    assert.equal(raw.includes(marker), false, `artifact leaked: ${marker}`);
  }
});

test("child rows fall back to event_id when the table has no id column", () => {
  const payload = buildBackupPayload({
    createdAt: "2026-11-07T00:00:00.000Z",
    events: [],
    children: {
      event_attendees: [{ event_id: "e-1" }, { event_id: "e-2" }],
      event_orders: [{ id: "o-1", event_id: "e-1" }],
    },
    identities: [],
    impact: { profiles: 0, threads: 0, messages: 0 },
  });

  assert.deepEqual(payload.childIds.event_attendees, ["e-1", "e-2"]);
  assert.deepEqual(payload.childIds.event_orders, ["o-1"]);
});
