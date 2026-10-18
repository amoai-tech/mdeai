import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * SAN-1526 · contest administration data layer.
 *
 * `vote` is a private schema (not in pgrst.db_schemas), so the browser cannot read or write it.
 * Every call here runs on the server against service-role-only RPCs, and each RPC re-checks that
 * the actor really is an admin. The caller must pass the user id it verified from the session —
 * never a value supplied by the browser.
 */

export type ContestStatus = "draft" | "live" | "closed" | "archived";

export type AdminContestSummary = {
  id: string;
  slug: string;
  title: string;
  status: ContestStatus;
  kind: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  entries: number;
  linked: number;
};

export type AdminContestEntry = {
  entity_id: string;
  restaurant_id: string | null;
  display_name: string;
  approved: boolean;
  ballots: number;
};

export type AdminContestAudit = {
  action: string;
  origin: string;
  actor: string;
  created_at: string;
  before: unknown;
  after: unknown;
};

export type AdminContestDetail = {
  contest: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    status: ContestStatus;
    kind: string;
    starts_at: string;
    ends_at: string;
    created_at: string;
    updated_at: string;
  };
  entries: AdminContestEntry[];
  audit: AdminContestAudit[];
};

export type CatalogRestaurant = { id: string; name: string; neighborhood: string | null };

export type ContestWriteOrigin = "manual" | "ai";

function service() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Supabase service client is not configured.");
  return client;
}

export async function listAdminContests(actorId: string): Promise<AdminContestSummary[]> {
  const { data, error } = await service().rpc("admin_contest_list", { p_actor: actorId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as unknown as AdminContestSummary[]) : [];
}

export async function getAdminContest(actorId: string, contestId: string): Promise<AdminContestDetail | null> {
  const { data, error } = await service().rpc("admin_contest_get", {
    p_actor: actorId,
    p_contest_id: contestId,
  });
  if (error) {
    if (error.code === "P0002") return null;
    throw new Error(error.message);
  }
  return (data as unknown as AdminContestDetail) ?? null;
}

export async function createAdminContest(
  actorId: string,
  input: {
    title: string;
    description?: string | null;
    startsAt?: string;
    endsAt?: string;
    requestId?: string | null;
    origin?: ContestWriteOrigin;
  },
): Promise<{ contest_id: string; slug: string; title: string; status: ContestStatus }> {
  const { data, error } = await service().rpc("admin_contest_create", {
    p_actor: actorId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_origin: input.origin ?? "manual",
    p_request_id: input.requestId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { contest_id: string; slug: string; title: string; status: ContestStatus };
}

export async function updateAdminContest(
  actorId: string,
  contestId: string,
  input: {
    title?: string | null;
    description?: string | null;
    status?: ContestStatus | null;
    startsAt?: string | null;
    endsAt?: string | null;
    origin?: ContestWriteOrigin;
    requestId?: string | null;
  },
): Promise<void> {
  const { error } = await service().rpc("admin_contest_update", {
    p_actor: actorId,
    p_contest_id: contestId,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_status: input.status ?? null,
    p_starts_at: input.startsAt ?? null,
    p_ends_at: input.endsAt ?? null,
    p_origin: input.origin ?? "manual",
    p_request_id: input.requestId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function linkAdminRestaurant(
  actorId: string,
  contestId: string,
  restaurantId: string,
  origin: ContestWriteOrigin = "manual",
): Promise<{ entity_id: string; already_linked?: boolean }> {
  const { data, error } = await service().rpc("admin_contest_link_restaurant", {
    p_actor: actorId,
    p_contest_id: contestId,
    p_restaurant_id: restaurantId,
    p_origin: origin,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { entity_id: string; already_linked?: boolean };
}

export async function unlinkAdminRestaurant(
  actorId: string,
  contestId: string,
  restaurantId: string,
  origin: ContestWriteOrigin = "manual",
): Promise<void> {
  const { error } = await service().rpc("admin_contest_unlink_restaurant", {
    p_actor: actorId,
    p_contest_id: contestId,
    p_restaurant_id: restaurantId,
    p_origin: origin,
  });
  if (error) throw new Error(error.message);
}

/** Active catalog restaurants, for the admin picker. Read-only. */
export async function listCatalogRestaurants(): Promise<CatalogRestaurant[]> {
  const { data, error } = await service()
    .from("restaurants")
    .select("id,name,neighborhood")
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogRestaurant[];
}