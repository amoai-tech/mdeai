import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ContestStatus, PublicContest } from "@/lib/restaurants/contest-state";

/**
 * SAN-1524 · the public read path for restaurant contests.
 *
 * `vote` is not exposed to PostgREST, so nothing here can run in the browser. The only access is
 * two service-role functions that return an allowlisted shape — no voter rows, no audit rows, no
 * private contest columns.
 *
 * Presentation rules (effective state, dates) live in ./contest-state and are unit tested.
 */

export type { ContestState, ContestStatus, PublicContest } from "@/lib/restaurants/contest-state";
export { canVoteIn, contestDate, contestState, contestWindowLabel } from "@/lib/restaurants/contest-state";

export type PublicContestSummary = PublicContest & { nominees: number };

export type PublicNominee = {
  entityId: string;
  restaurantId: string;
  name: string;
  neighborhood: string | null;
  imageUrl: string | null;
  category: string | null;
};

export type ListResult =
  | { status: "ok"; contests: PublicContestSummary[] }
  | { status: "error" };

export type DetailResult =
  | { status: "found"; contest: PublicContest; nominees: PublicNominee[] }
  | { status: "not_found" }
  | { status: "error" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toContest(row: Record<string, unknown>): PublicContest | null {
  const id = asString(row.id);
  const slug = asString(row.slug);
  const title = asString(row.title);
  if (!id || !slug || !title) return null;
  const status = asString(row.status);
  return {
    id,
    slug,
    title,
    description: asString(row.description),
    status:
      status === "live" || status === "closed" || status === "archived" ? status : ("draft" as ContestStatus),
    startsAt: asString(row.starts_at),
    endsAt: asString(row.ends_at),
    coverUrl: asString(row.cover_url),
  };
}

export async function listPublicContests(): Promise<ListResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { status: "error" };

  const { data, error } = await supabase.rpc("contest_public_list");
  if (error) {
    console.error("[contests] contest_public_list failed:", error.message);
    return { status: "error" };
  }
  if (!Array.isArray(data)) return { status: "error" };

  const contests: PublicContestSummary[] = [];
  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    const contest = toContest(row);
    if (!contest) continue;
    const nominees = typeof row.nominees === "number" ? row.nominees : 0;
    contests.push({ ...contest, nominees });
  }
  return { status: "ok", contests };
}

export async function getPublicContest(ref: string): Promise<DetailResult> {
  const trimmed = ref.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return { status: "not_found" };
  if (!UUID_RE.test(trimmed) && !SLUG_RE.test(trimmed)) return { status: "not_found" };

  const supabase = createServiceRoleClient();
  if (!supabase) return { status: "error" };

  const { data, error } = await supabase.rpc("contest_public_get", { p_ref: trimmed });
  if (error) {
    console.error("[contests] contest_public_get failed:", error.message);
    return { status: "error" };
  }
  if (!data || typeof data !== "object") return { status: "not_found" };

  const payload = data as { contest?: Record<string, unknown>; nominees?: unknown };
  if (!payload.contest) return { status: "not_found" };
  const contest = toContest(payload.contest);
  if (!contest) return { status: "not_found" };

  const nominees: PublicNominee[] = [];
  if (Array.isArray(payload.nominees)) {
    for (const raw of payload.nominees) {
      const row = raw as Record<string, unknown>;
      const entityId = asString(row.entity_id);
      const restaurantId = asString(row.restaurant_id);
      const name = asString(row.restaurant_name);
      if (!entityId || !restaurantId || !name) continue;
      nominees.push({
        entityId,
        restaurantId,
        name,
        neighborhood: asString(row.neighborhood),
        imageUrl: asString(row.image_url),
        category: asString(row.category),
      });
    }
  }

  return { status: "found", contest, nominees };
}
