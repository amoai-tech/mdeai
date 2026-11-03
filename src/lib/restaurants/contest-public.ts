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
  /** Clean, non-test audience ballots. The only input to a public place. */
  audienceAccepted: number;
  /** Development-test ballots. Reported separately, never added to accepted. */
  developmentTestTotal: number;
  /** Competition place; null when nobody has an accepted vote. */
  rank: number | null;
  /** Catalog coordinates, when the restaurant row carries a real pair. Null means "no map pin". */
  latitude: number | null;
  longitude: number | null;
};

/**
 * A tally field must be a non-negative safe integer.
 *
 * The SQL guards the normal path: it coalesces a count to 0, so a well-formed response always
 * carries a number, and zero means zero. This check exists for the other path — the RPC payload is
 * untrusted JSON crossing a process boundary, and a malformed value (null, negative, fractional, a
 * string) must fail the read rather than be published as a plausible-looking zero.
 */
function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

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

/** A map pin needs a real, finite pair inside the coordinate range; anything else is "no location". */
function asCoordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit
    ? value
    : null;
}

/**
 * Coordinates are deliberately not in the contest RPC payload: `contest_public_get` is a contest
 * read, and adding map fields would widen the public contest contract for a presentation detail.
 * One allowlisted read against `public.restaurants` supplies them instead.
 *
 * A failure here is contained on purpose — the pins disappear and the nominee cards keep working.
 * The design contract is explicit that a map outage must never block the ballot.
 */
async function attachNomineeCoordinates(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  nominees: PublicNominee[],
): Promise<void> {
  if (nominees.length === 0) return;
  const ids = Array.from(new Set(nominees.map((nominee) => nominee.restaurantId)));

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, latitude, longitude")
    .in("id", ids);
  if (error) {
    console.error("[contests] nominee coordinate read failed:", error.message);
    return;
  }
  if (!Array.isArray(data)) return;

  const byId = new Map<string, { latitude: number | null; longitude: number | null }>();
  for (const raw of data as Record<string, unknown>[]) {
    const id = asString(raw.id);
    if (!id) continue;
    byId.set(id, {
      latitude: asCoordinate(raw.latitude, 90),
      longitude: asCoordinate(raw.longitude, 180),
    });
  }

  for (const nominee of nominees) {
    const coordinates = byId.get(nominee.restaurantId);
    nominee.latitude = coordinates?.latitude ?? null;
    nominee.longitude = coordinates?.longitude ?? null;
  }
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

      const accepted = asCount(row.audience_accepted);
      const development = asCount(row.development_test_total);
      // Reachable only from a malformed payload, never from the coalesced SQL: if the transport
      // hands back something that is not a count, say the read failed instead of inventing a 0.
      if (accepted === null || development === null) {
        console.error("[contests] malformed tally on nominee " + entityId);
        return { status: "error" };
      }
      const rankRaw = row.rank;
      const rankIsValid =
        typeof rankRaw === "number" && Number.isSafeInteger(rankRaw) && rankRaw > 0;
      // A nominee with accepted votes must carry a place. Missing it means the read is broken —
      // silently showing "unranked" would hide a real defect behind a plausible empty rank.
      if (accepted > 0 && !rankIsValid) {
        console.error("[contests] accepted votes without a rank on nominee " + entityId);
        return { status: "error" };
      }
      const rank = rankIsValid ? (rankRaw as number) : null;
      nominees.push({
        entityId,
        restaurantId,
        name,
        neighborhood: asString(row.neighborhood),
        imageUrl: asString(row.image_url),
        category: asString(row.category),
        audienceAccepted: accepted,
        developmentTestTotal: development,
        rank,
        latitude: null,
        longitude: null,
      });
    }
  }

  await attachNomineeCoordinates(supabase, nominees);

  return { status: "found", contest, nominees };
}
