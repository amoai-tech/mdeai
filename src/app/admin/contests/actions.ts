"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminContest,
  linkAdminRestaurant,
  unlinkAdminRestaurant,
  updateAdminContest,
  type ContestStatus,
} from "@/lib/restaurants/contest-admin";
import { normalizeRestaurantIds } from "@/lib/restaurants/contest-admin-ids";
import {
  applyLinks,
  checkBulkSelection,
  describeLinkError,
  type LinkFailure,
} from "@/lib/restaurants/apply-links";

const STATUSES: readonly ContestStatus[] = ["draft", "live", "closed", "archived"];

/**
 * Every action re-checks the session and the admin role server-side. The browser can never
 * choose the actor: it comes from the verified Supabase session, and the RPC re-checks it too.
 */
async function requireAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in as an admin to manage contests.");
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) throw new Error("Admin access required.");
  return user.id;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createContestAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const title = text(formData, "title");
  if (!title) throw new Error("A contest title is required.");

  const created = await createAdminContest(actorId, {
    title,
    description: text(formData, "description") || null,
    requestId: text(formData, "request_id") || null,
  });

  revalidatePath("/admin/contests");
  redirect("/admin/contests/" + created.contest_id);
}

export async function updateContestAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  if (!contestId) throw new Error("Missing contest.");

  const status = text(formData, "status");
  const startsAt = text(formData, "starts_at");
  const endsAt = text(formData, "ends_at");
  if (!startsAt || !endsAt) throw new Error("Start and end dates are required.");

  const startsMs = Date.parse(startsAt);
  const endsMs = Date.parse(endsAt);
  if (Number.isNaN(startsMs) || Number.isNaN(endsMs)) throw new Error("Enter valid start and end dates.");
  if (endsMs <= startsMs) throw new Error("The contest must end after it starts.");

  await updateAdminContest(actorId, contestId, {
    title: text(formData, "title") || null,
    description: formData.has("description") ? text(formData, "description") : null,
    status: STATUSES.includes(status as ContestStatus) ? (status as ContestStatus) : null,
    startsAt,
    endsAt,
  });

  revalidatePath("/admin/contests/" + contestId);
  revalidatePath("/admin/contests");
}

/** What the picker shows after a submission. Never a claim the database did not make. */
export type BulkLinkState = {
  status: "idle" | "success" | "partial" | "error";
  added: number;
  already: number;
  failed: LinkFailure[];
  rejected: number;
  message?: string;
};

function toBulkState(
  added: number,
  already: number,
  failed: LinkFailure[],
  rejected: number,
): BulkLinkState {
  const status = failed.length === 0 ? "success" : added + already > 0 ? "partial" : "error";
  return { status, added, already, failed, rejected };
}

/**
 * Add one or many catalog restaurants, returning a truthful result instead of redirecting.
 *
 * A structured result lets the UI name the restaurants that failed. Putting those ids in the URL
 * would let anyone rewrite the "success" message, so the outcome stays on the server action.
 */
export async function linkRestaurantsAction(
  _prev: BulkLinkState,
  formData: FormData,
): Promise<BulkLinkState> {
  try {
    const actorId = await requireAdminId();
    const contestId = text(formData, "contest_id");
    if (!contestId) return { status: "error", added: 0, already: 0, failed: [], rejected: 0, message: "Missing contest." };

    const { ids, rejected } = normalizeRestaurantIds(formData.getAll("restaurant_ids").map(String));
    const selection = checkBulkSelection(ids);
    if (!selection.ok) {
      return { status: "error", added: 0, already: 0, failed: [], rejected, message: selection.error };
    }

    const result = await applyLinks(selection.ids, (restaurantId) =>
      linkAdminRestaurant(actorId, contestId, restaurantId),
    );
    for (const failure of result.failed) {
      console.error("[admin] link failed for restaurant", failure.id, failure.reason);
    }

    revalidatePath("/admin/contests/" + contestId);
    return toBulkState(result.added.length, result.already.length, result.failed, rejected);
  } catch (error) {
    // Authorization, a missing session, or an unexpected failure: say so, never crash the page.
    return { status: "error", added: 0, already: 0, failed: [], rejected: 0, message: describeLinkError(error) };
  }
}

export async function unlinkRestaurantAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  const restaurantId = text(formData, "restaurant_id");
  if (!contestId || !restaurantId) throw new Error("Missing entry.");

  await unlinkAdminRestaurant(actorId, contestId, restaurantId, "manual", text(formData, "request_id") || null);
  revalidatePath("/admin/contests/" + contestId);
}