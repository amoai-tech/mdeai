"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eventUpdateInputFromFormData } from "@/lib/events/update-event-form";
import {
  toEventUpdatePatch,
  type EventUpdateFieldErrors,
  type EventUpdateInput,
  type EventUpdateResult,
} from "@/lib/events/update-event-core";

/** Field-level errors keep the submitted values and name the exact problem. */
function invalidResult(fieldErrors: EventUpdateFieldErrors): EventUpdateResult {
  return {
    ok: false,
    code: "INVALID",
    message: "Check the highlighted fields and try again.",
    fieldErrors,
  };
}

function collectFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): EventUpdateFieldErrors {
  const fieldErrors: EventUpdateFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key as keyof EventUpdateFieldErrors]) {
      fieldErrors[key as keyof EventUpdateFieldErrors] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * SAN-885 — save a manual edit to the organizer's own event.
 *
 * Guards, in order:
 *  1. authenticated caller;
 *  2. valid input (Bogotá wall-clock times, end after start);
 *  3. the row is owned by the caller (`organizer_id`) — also enforced by RLS;
 *  4. optimistic concurrency: the row must still carry the revision the editor
 *     loaded, otherwise the caller gets CONFLICT and never overwrites silently.
 *
 * It never inserts: an edit can only update the original event id.
 */
async function applyEventUpdate(input: EventUpdateInput): Promise<EventUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Sign in again to save." };
  }

  const { data: ownedOrAdminVisible, error: readError } = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", input.eventId)
    .maybeSingle();
  if (readError) {
    return { ok: false, code: "FAILED", message: "Could not check event access." };
  }
  if (!ownedOrAdminVisible) {
    return { ok: false, code: "NOT_FOUND", message: "This event is not yours to edit." };
  }
  const owner = ownedOrAdminVisible.organizer_id === user.id;
  // Admin privileges must be re-checked server-side, never from form values.
  if (!owner) {
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || isAdmin !== true) {
      return { ok: false, code: "NOT_FOUND", message: "This event is not yours to edit." };
    }
  }
  let update = supabase
    .from("events")
    .update(toEventUpdatePatch(input, new Date().toISOString()))
    .eq("id", input.eventId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (owner) update = update.eq("organizer_id", user.id);
  const { data, error } = await update.select("id, updated_at").maybeSingle();

  if (error) {
    console.error("[update-host-event] update failed:", error.message);
    return { ok: false, code: "FAILED", message: "Could not save this event. Try again." };
  }

  if (!data) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Newer changes were saved in another tab. Reload before saving again.",
    };
  }

  revalidatePath(`/app/events/${input.eventId}`);
  revalidatePath("/app/events");
  revalidatePath("/host/events");
  return { ok: true, updatedAt: String((data as { updated_at: string }).updated_at) };
}

/**
 * `useActionState` entry point. It accepts the browser form directly, so the
 * form still works without hydration and every field is validated server-side.
 */
export async function updateHostEventForm(
  _previous: EventUpdateResult | null,
  formData: FormData,
): Promise<EventUpdateResult> {
  const parsed = eventUpdateInputFromFormData(formData);
  if (!parsed.success) return invalidResult(collectFieldErrors(parsed.error.issues));
  return applyEventUpdate(parsed.data);
}
