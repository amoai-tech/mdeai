"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { resolveTripSource } from "@/lib/trips/resolve-trip-source";
import { isValidTimeZone } from "@/lib/trips/timezone";

const addTripItemSchema = z.object({
  tripId: z.string().uuid(),
  pinId: z.string().min(1).max(256),
  category: z.string().max(64).optional(),
  placeId: z.string().min(1).max(256).optional(),
  startAt: z.string().min(1).max(64).nullable().optional(),
  endAt: z.string().min(1).max(64).nullable().optional(),
});

const updateTripTimezoneSchema = z.object({
  tripId: z.string().uuid(),
  timezone: z.string().min(1).max(64),
});

export type UpdateTripTimezoneResult =
  | { ok: true; timezone: string }
  | { ok: false; error: string };

export type AddTripItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

export type TripOption = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

export type ListTripOptionsResult =
  | { ok: true; trips: TripOption[] }
  | { ok: false; error: string };

function safeTimestamp(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function userFacingRpcError(message: string): string {
  if (/not authenticated/i.test(message)) return "Sign in to add places to a trip.";
  if (/trip not found or not owned/i.test(message)) return "That trip is not available for this account.";
  if (/source entity not found/i.test(message)) return "That place is no longer available. Refresh and try another.";
  if (/unsupported item_type/i.test(message)) return "That kind of place cannot be added to a trip yet.";
  return "Could not add this place to the trip. Please try again.";
}

export async function listTripOptions(): Promise<ListTripOptionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to add places to a trip." };

  const { data, error } = await supabase
    .from("trips")
    .select("id, title, start_date, end_date")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .limit(20);

  if (error) return { ok: false, error: "Could not load your trips. Try again." };

  return {
    ok: true,
    trips: (data ?? []).map((trip) => ({
      id: trip.id,
      title: trip.title,
      startDate: trip.start_date,
      endDate: trip.end_date,
    })),
  };
}

export async function updateTripTimezone(
  input: unknown,
): Promise<UpdateTripTimezoneResult> {
  const parsed = updateTripTimezoneSchema.safeParse(input);
  if (!parsed.success || !isValidTimeZone(parsed.data.timezone)) {
    return { ok: false, error: "Choose a valid IANA timezone." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to change the trip timezone." };

  const { data, error } = await supabase
    .from("trips")
    .update({ timezone: parsed.data.timezone })
    .eq("id", parsed.data.tripId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("id, timezone")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Could not update this trip. Please try again." };
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { ok: true, timezone: data.timezone };
}

export async function addTripItem(input: unknown): Promise<AddTripItemResult> {
  const parsed = addTripItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid trip request." };

  const startAt = safeTimestamp(parsed.data.startAt);
  const endAt = safeTimestamp(parsed.data.endAt);
  if (startAt === undefined || endAt === undefined) {
    return { ok: false, error: "Enter valid start and end times." };
  }
  if (startAt && endAt && Date.parse(startAt) > Date.parse(endAt)) {
    return { ok: false, error: "The end time must be after the start time." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to add places to a trip." };

  const resolved = await resolveTripSource(supabase, {
    pinId: parsed.data.pinId,
    category: parsed.data.category,
    placeId: parsed.data.placeId,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const { data, error } = await supabase.rpc("insert_trip_item_for_user", {
    p_trip_id: parsed.data.tripId,
    p_item_type: resolved.source.itemType,
    p_source_id: resolved.source.sourceId,
    ...(startAt ? { p_start_at: startAt } : {}),
    ...(endAt ? { p_end_at: endAt } : {}),
  });

  if (error) {
    return { ok: false, error: userFacingRpcError(error.message) };
  }
  if (typeof data !== "string" || !z.string().uuid().safeParse(data).success) {
    return { ok: false, error: "The trip save returned no item. Please try again." };
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { ok: true, itemId: data };
}
