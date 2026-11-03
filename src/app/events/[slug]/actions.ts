"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { interestOutcome, isEventId, type InterestResult } from "@/lib/events/event-interest";

/**
 * Follow or unfollow one event for the signed-in visitor.
 *
 * Idempotent by construction: the table has a unique (event_id, user_id) pair, so a
 * repeated click leaves exactly one row, and unfollow deletes only the caller's row.
 */
export async function setEventInterest(eventId: string, follow: boolean): Promise<InterestResult> {
  if (!isEventId(eventId)) return { ok: false, error: "invalid-event" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-signed-in" };

  if (follow) {
    const { error } = await supabase
      .from("event_interest_subscriptions")
      .insert({ event_id: eventId, user_id: user.id });
    const result = interestOutcome(true, error);
    if (result.ok) revalidatePath(`/events/${eventId}`);
    return result;
  }

  const { error } = await supabase
    .from("event_interest_subscriptions")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  const result = interestOutcome(false, error);
  if (result.ok) revalidatePath(`/events/${eventId}`);
  return result;
}
