"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminGate } from "@/lib/auth/admin-gate";
import { createClient } from "@/lib/supabase/server";

export type AdminEventAction = "publish" | "unpublish" | "restore";

export type AdminEventActionResult =
  | { ok: true; status: string }
  | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "FAILED"; message: string };

const NEXT_STATE: Record<AdminEventAction, { status: string; is_active: boolean }> = {
  publish: { status: "published", is_active: true },
  unpublish: { status: "draft", is_active: false },
  restore: { status: "draft", is_active: true },
};

/**
 * SAN-515 — Super Admin event state change.
 *
 * The actor comes from the verified session through the shared admin gate; the
 * browser can never name it. Writes go through the user-scoped client so
 * `events_admin_update` RLS applies as a second check. Phase A has no business
 * approval prerequisite: publishing here is a technical state change only.
 *
 * There is no durable admin-event audit table yet, so every action emits a
 * structured server log line with actor, event and before/after state. That gap
 * is reported in the PR rather than papered over.
 */
export async function setAdminEventState(
  eventId: string,
  action: AdminEventAction,
): Promise<AdminEventActionResult> {
  if (!z.string().uuid().safeParse(eventId).success) {
    return { ok: false, code: "INVALID", message: "Unknown event id." };
  }
  const next = NEXT_STATE[action];
  if (!next) return { ok: false, code: "INVALID", message: "Unknown action." };

  const gate = await getAdminGate();
  if (gate.status !== "ok") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        gate.status === "guest"
          ? "Sign in to manage events."
          : "Admin access is required to change an event.",
    };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("events")
    .select("id, status, is_active")
    .eq("id", eventId)
    .maybeSingle();

  if (!before) {
    return { ok: false, code: "NOT_FOUND", message: "That event does not exist." };
  }

  const { data: after, error } = await supabase
    .from("events")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .select("id, status, is_active")
    .maybeSingle();

  if (error || !after) {
    console.error("[admin-events] state change failed:", error?.message);
    return { ok: false, code: "FAILED", message: "Could not change this event. Try again." };
  }

  console.info(
    JSON.stringify({
      audit: "admin.event.state",
      actor: gate.userId,
      event_id: eventId,
      action,
      before: { status: (before as { status: string }).status, is_active: (before as { is_active: boolean }).is_active },
      after: { status: (after as { status: string }).status, is_active: (after as { is_active: boolean }).is_active },
      at: new Date().toISOString(),
    }),
  );

  revalidatePath("/app/admin/events");
  revalidatePath("/app/events");
  revalidatePath("/host/events");
  revalidatePath("/events");
  return { ok: true, status: (after as { status: string }).status };
}
