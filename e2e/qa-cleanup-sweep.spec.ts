import { test, expect } from "@playwright/test";
import { createThrowawayIdentity, getSupabaseAdmin, sweepThrowawayIdentities } from "./helpers/auth";

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
  const admin = await getSupabaseAdmin();
  // Seed a thread + message so row verification has something to prove.
  const threadId = `proof-${Date.now()}`;
  await admin.from("mastra_threads").insert({ id: threadId, resourceId: identity.userId, title: "proof" });
  await admin.from("mastra_messages").insert({ id: `${threadId}-m`, thread_id: threadId, role: "user", resourceId: identity.userId, content: JSON.stringify({ format: 2, parts: [{ type: "text", text: "proof" }] }) });

  const { orphans, problems } = await sweepThrowawayIdentities({
    prefix: "qa-san1298-",
    olderThan: new Date(Date.now() - 60 * 60_000),
    ownedIds: [identity.userId],
  });

  expect(problems).toEqual([]);
  expect(orphans).toBe(0);

  const { data: threads } = await admin.from("mastra_threads").select("id").eq("resourceId", identity.userId);
  const { data: messages } = await admin.from("mastra_messages").select("id").eq("thread_id", threadId);
  const { data: user } = await admin.auth.admin.getUserById(identity.userId);
  const gone = !user?.user || user.user.deleted_at !== undefined;
  const { data: profile } = await admin.from("profiles").select("id").eq("id", identity.userId);

  expect((threads ?? []).length).toBe(0);
  expect((messages ?? []).length).toBe(0);
  expect(gone || !user?.user, "the auth user is gone").toBe(true);
  expect((profile ?? []).length, "the profile row is gone").toBe(0);
});
