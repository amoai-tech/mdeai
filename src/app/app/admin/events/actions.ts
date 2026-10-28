"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminGate } from "@/lib/auth/admin-gate";
import { createClient } from "@/lib/supabase/server";

export type AdminEventAction = "publish" | "unpublish" | "restore";

export type AdminEventActionResult =
  | { ok: true; status: string }
  | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "FAILED"; message: string };

const VALID_ACTIONS = new Set<AdminEventAction>(["publish", "unpublish", "restore"]);

/**
 * SAN-515 — Super Admin event state change.
 *
 * The actor comes from the verified session through the shared admin gate; the
 * browser can never name it. The authenticated RPC rechecks public.is_admin()
 * and commits the event update and append-only audit in one DB transaction.
 * Phase A has no business approval prerequisite.
 */
export async function setAdminEventState(
  eventId: string,
  action: AdminEventAction,
): Promise<AdminEventActionResult> {
  if (!z.string().uuid().safeParse(eventId).success) {
    return { ok: false, code: "INVALID", message: "Unknown event id." };
  }
  if (!VALID_ACTIONS.has(action)) return { ok: false, code: "INVALID", message: "Unknown action." };

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
  const { data, error } = await supabase.rpc("admin_event_set_state", {
    p_event_id: eventId,
    p_action: action,
  });
  if (error) {
    console.error("[admin-events] atomic state/audit failed:", error.message);
    if (error.code === "P0002") {
      return { ok: false, code: "NOT_FOUND", message: "That event does not exist." };
    }
    if (error.code === "42501") {
      return { ok: false, code: "FORBIDDEN", message: "Admin access required." };
    }
    return { ok: false, code: "FAILED", message: "Could not save this event. Try again." };
  }
  const saved = data as { status?: string; audit_id?: string } | null;
  if (!saved?.status || !saved.audit_id) {
    return { ok: false, code: "FAILED", message: "Could not confirm the audited event update." };
  }

  revalidatePath("/app/admin/events");
  revalidatePath("/app/events");
  revalidatePath("/host/events");
  revalidatePath("/events");
  return { ok: true, status: saved.status };
}
