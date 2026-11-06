import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  sweepThrowawayIdentities,
} from "./helpers/auth";

/**
 * A4 · the interrupted-run sweep must DELETE, not merely count.
 *
 * A count of zero is only meaningful if the rows behind it are gone: an account can
 * be deleted while its threads, messages or profile survive, and an auth-only check
 * would call that clean. This seeds a real thread and message for a disposable
 * identity, sweeps it as an OWNED identity, and verifies the auth user AND the rows.
 *
 * Opt-in, because it writes to the production Supabase project and cleans up after
 * itself. Run with MDE_SAN1298_CROSS_SCREEN=1 like the journey it supports.
 */
const enabled = Boolean(process.env.PROD_SMOKE_BASE_URL?.trim()) &&
  process.env.MDE_SAN1298_CROSS_SCREEN === "1";
test.skip(!enabled, "Opt-in only: set PROD_SMOKE_BASE_URL and MDE_SAN1298_CROSS_SCREEN=1");
test.use({ screenshot: "off", trace: "off", video: "off" });

test("an owned identity is deleted with its thread, messages and profile", async () => {
  const identity = await createThrowawayIdentity("qa-san1298-proof");
  // This test is ABOUT cleanup, so it must not leak when its own assertions fail:
  // a broken seed aborts before the sweep runs, and without this the identity and
  // its rows would survive the run (which is exactly how one was left behind).
  try {
  const admin = await getSupabaseAdmin();
  const threadId = `proof-${Date.now()}`;
  const messageId = `${threadId}-m`;
  const now = new Date().toISOString();

  // Seed REAL rows. Mastra's tables require createdAt, and a message needs a live
  // thread (FK). Ignoring these results is how a "rows are gone" assertion can pass
  // over rows that never existed, so every write is checked and read back.
  const threadInsert = await admin
    .from("mastra_threads")
    .insert({ id: threadId, resourceId: identity.userId, title: "proof", createdAt: now, updatedAt: now });
  expect(threadInsert.error, `seed thread inserted: ${threadInsert.error?.message ?? ""}`).toBeNull();

  const messageInsert = await admin.from("mastra_messages").insert({
    id: messageId,
    thread_id: threadId,
    resourceId: identity.userId,
    role: "user",
    type: "text",
    content: JSON.stringify({ format: 2, parts: [{ type: "text", text: "proof" }] }),
    createdAt: now,
  });
  expect(messageInsert.error, `seed message inserted: ${messageInsert.error?.message ?? ""}`).toBeNull();

  // Prove the fixtures exist BEFORE sweeping, otherwise the deletion checks below
  // are vacuous.
  const seededThread = await admin.from("mastra_threads").select("id").eq("id", threadId);
  expect(seededThread.error, "seed thread readable").toBeNull();
  expect((seededThread.data ?? []).length, "seed thread exists before the sweep").toBe(1);
  const seededMessage = await admin.from("mastra_messages").select("id").eq("id", messageId);
  expect(seededMessage.error, "seed message readable").toBeNull();
  expect((seededMessage.data ?? []).length, "seed message exists before the sweep").toBe(1);

  const { orphans, problems } = await sweepThrowawayIdentities({
    prefix: "qa-san1298-",
    olderThan: new Date(Date.now() - 60 * 60_000),
    ownedIds: [identity.userId],
  });

  expect(problems).toEqual([]);
  expect(orphans).toBe(0);

  const threads = await admin.from("mastra_threads").select("id").eq("resourceId", identity.userId);
  expect(threads.error, "threads readable after the sweep").toBeNull();
  expect((threads.data ?? []).length, "the seeded thread is gone").toBe(0);

  const messages = await admin.from("mastra_messages").select("id").eq("thread_id", threadId);
  expect(messages.error, "messages readable after the sweep").toBeNull();
  expect((messages.data ?? []).length, "the seeded message is gone").toBe(0);

  // A live user can return `deleted_at: null`, so only an ABSENT user (or a 404)
  // proves deletion; `deleted_at !== undefined` would pass for a live account.
  const userAfter = await admin.auth.admin.getUserById(identity.userId);
  const userGone = !userAfter.data?.user || userAfter.error?.status === 404;
  expect(userGone, "the auth user is gone").toBe(true);

  const profile = await admin.from("profiles").select("id").eq("id", identity.userId);
  expect(profile.error, "profile readable after the sweep").toBeNull();
  expect((profile.data ?? []).length, "the profile row is gone").toBe(0);
  } finally {
    await deleteThrowawayIdentity(identity).catch(() => undefined);
  }
});
