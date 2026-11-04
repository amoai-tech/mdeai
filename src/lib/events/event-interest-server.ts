import { createClient } from "@/lib/supabase/server";

export type EventInterest = { signedIn: boolean; following: boolean };

/** Whether the current visitor follows this event. Guests are simply "not following". */
export async function getEventInterest(eventId: string): Promise<EventInterest> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, following: false };
  const { data } = await supabase
    .from("event_interest_subscriptions")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  return { signedIn: true, following: Boolean(data) };
}
