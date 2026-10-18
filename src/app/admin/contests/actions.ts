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

/** Upper bound for one submission; adding the whole catalog is ~43. */
const MAX_BULK_LINK = 60;

/**
 * Add one or many catalog restaurants in a single submission.
 *
 * Each link is isolated. Linking is idempotent per (contest, restaurant), so a partial run is
 * safe to re-submit — but only if the admin is told it was partial. One failing restaurant must
 * never replace the page with an error while the ones before it are already committed.
 */
export async function linkRestaurantsAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  if (!contestId) throw new Error("Missing contest.");

  const { ids, rejected } = normalizeRestaurantIds(formData.getAll("restaurant_ids").map(String));
  if (ids.length === 0) {
    throw new Error(
      rejected > 0 ? "None of those restaurant ids were valid." : "Choose at least one restaurant.",
    );
  }
  if (ids.length > MAX_BULK_LINK) {
    throw new Error("Add at most " + MAX_BULK_LINK + " restaurants at a time.");
  }

  let added = 0;
  let already = 0;
  let failed = 0;
  for (const restaurantId of ids) {
    try {
      const result = await linkAdminRestaurant(actorId, contestId, restaurantId);
      if (result.already_linked) already += 1;
      else added += 1;
    } catch (error) {
      // Keep going: the earlier links are already committed, so the admin needs the whole
      // picture (and a re-submit is safe) rather than a crash page.
      failed += 1;
      console.error(
        "[admin] link failed for restaurant",
        restaurantId,
        error instanceof Error ? error.message : error,
      );
    }
  }

  revalidatePath("/admin/contests/" + contestId);
  redirect(
    "/admin/contests/" +
      contestId +
      "?added=" + added + "&already=" + already + "&failed=" + failed + "&rejected=" + rejected,
  );
}

export async function unlinkRestaurantAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  const restaurantId = text(formData, "restaurant_id");
  if (!contestId || !restaurantId) throw new Error("Missing entry.");

  await unlinkAdminRestaurant(actorId, contestId, restaurantId, "manual", text(formData, "request_id") || null);
  revalidatePath("/admin/contests/" + contestId);
}