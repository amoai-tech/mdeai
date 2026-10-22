import type { SupabaseClient } from "@supabase/supabase-js";

import type { RequestedThread } from "@/lib/copilotkit-thread-ownership";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Internal metadata key written only by this server-side guard. */
export const PARTNER_THREAD_METADATA_KEY = "mdePartnerId";

type ThreadRow = { metadata: unknown };

function boundPartner(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[PARTNER_THREAD_METADATA_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function forbidden(message: string): Response {
  return Response.json({ error: message }, { status: 403 });
}

async function readBoundPartner(
  service: SupabaseClient<Database>,
  threadId: string,
): Promise<{ partnerId: string | null; error: boolean }> {
  const { data, error } = await service
    .from("mastra_threads")
    .select("metadata")
    .eq("id", threadId)
    .maybeSingle();
  if (error) return { partnerId: null, error: true };
  return { partnerId: boundPartner((data as ThreadRow | null)?.metadata), error: false };
}

/**
 * SAN-705 / SAN-706 — a thread may only be used with the business it was
 * created for.
 *
 * Thread ownership is already checked by `authorizeCopilotKitRequest`. This
 * second guard prevents a same-user cross-business replay: a thread created for
 * Café A cannot be sent with Restaurant B's selected context.
 *
 * The binding lives in the existing `mastra_threads.metadata`; no new table,
 * service, or authorization system is introduced.
 */
export async function enforcePartnerThreadBinding(
  thread: RequestedThread,
  userId: string,
  partnerId: string | null,
  service: SupabaseClient<Database> | null = createServiceRoleClient(),
): Promise<Response | null> {
  if (thread.kind === "none") {
    return partnerId
      ? forbidden("A partner conversation requires an explicit thread")
      : null;
  }

  // A new general thread needs no metadata write, so it does not need storage.
  if (thread.kind === "new" && !partnerId) return null;

  if (!service) {
    return Response.json({ error: "Thread storage unavailable" }, { status: 503 });
  }

  if (thread.kind === "existing") {
    const existing = await readBoundPartner(service, thread.threadId);
    if (existing.error) {
      return Response.json({ error: "Thread storage unavailable" }, { status: 503 });
    }
    if (partnerId) {
      if (existing.partnerId !== partnerId) {
        return forbidden("This conversation belongs to a different business");
      }
      return null;
    }
    // A general Concierge request must not replay a partner conversation.
    if (existing.partnerId) {
      return forbidden("This conversation belongs to a business");
    }
    return null;
  }

  // New partner thread: write the binding before the agent can persist a message.
  const now = new Date().toISOString();
  const { error } = await service.from("mastra_threads").insert({
    id: thread.threadId,
    resourceId: userId,
    title: "",
    metadata: { [PARTNER_THREAD_METADATA_KEY]: partnerId },
    createdAt: now,
    updatedAt: now,
  });

  if (!error) return null;
  if (error.code !== "23505") {
    return Response.json({ error: "Thread storage unavailable" }, { status: 503 });
  }

  // A concurrent first turn won the insert. Verify the winner wrote the same
  // business rather than assuming the conflict is safe.
  const raced = await readBoundPartner(service, thread.threadId);
  if (raced.error) {
    return Response.json({ error: "Thread storage unavailable" }, { status: 503 });
  }
  return raced.partnerId === partnerId
    ? null
    : forbidden("This conversation belongs to a different business");
}
