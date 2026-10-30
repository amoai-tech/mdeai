import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { applyAvailabilityFilters } from "@/lib/rentals/availability-filter";
import { RentalSearchUnavailableError } from "./rental-search-unavailable";
import {
  embedQueryTextDetailed,
  vectorLiteral,
  type EmbedFailureReason,
} from "./query-embedding";
import type { EmbedStatus, RankExplanationEntry } from "./search-logs";
import {
  type Rental,
  type RentalQuery,
  monthlyBudgetFromQuery,
  nightlyPriceFrom,
  rentalAvailabilityDate,
  rentalBudgetPredicate,
  rowToRental,
  readRentalDevelopmentPhase,
  sortForMonthlyStay,
} from "../tools/search-rentals";

export type RentalIntelligenceSlots = {
  neighborhood?: string;
  wantsNomad?: boolean;
  wantsQuiet?: boolean;
  wantsGym?: boolean;
  wantsCafe?: boolean;
  wantsMonthly?: boolean;
};

type HybridListingRow = {
  id: string;
  title: string;
  description: string | null;
  neighborhood: string | null;
  city: string | null;
  price_monthly: number | string | null;
  /** The apartment's own currency, so a COP listing is never rendered as USD. */
  currency: string | null;
  bedrooms: number | null;
  bathrooms: number | string | null;
  rating: number | string | null;
  images: string[] | null;
  amenities: string[] | null;
  pet_friendly: boolean | null;
  furnished: boolean | null;
  status: string | null;
  similarity: number | null;
};

type RentalSignalRow = {
  apartment_id: string;
  digital_nomad_score: number | null;
  walkability: number | null;
  nightlife_access: number | null;
  quiet_score: number | null;
  workspace_score: number | null;
  value_score: number | null;
  confidence: number | null;
  source: string | null;
};

type NeighborhoodProfileRow = {
  neighborhood_id: string;
  digital_nomad_friendliness: number | null;
  gym_coworking_proximity: number | null;
  noise_level: number | null;
  summary: string | null;
};

export type IntelligenceRentalResult = Rental & {
  rankScore?: number;
  signalSource?: string;
  evidenceText?: string | null;
};

function getAnonClient() {
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function num(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Overscan limit for keyword fallback search — 6x the default API limit (8) to allow ranking/filtering headroom. */
const RENTAL_KEYWORD_OVERSCAN_LIMIT = 48;
/** Bound the hybrid RPC wait separately from the Gemini embedding request. */
const RENTAL_HYBRID_RPC_TIMEOUT_MS = 5000;

export function parseRentalIntelligenceSlots(queryText: string): RentalIntelligenceSlots {
  const q = queryText.toLowerCase();
  const slots: RentalIntelligenceSlots = {};
  if (/laureles/.test(q)) slots.neighborhood = "Laureles";
  else if (/poblado|provenza/.test(q)) slots.neighborhood = "El Poblado";
  else if (/envigado/.test(q)) slots.neighborhood = "Envigado";
  if (/nomad|remote work|cowork|wifi|workspace/.test(q)) slots.wantsNomad = true;
  if (/quiet/.test(q)) slots.wantsQuiet = true;
  if (/gym/.test(q)) slots.wantsGym = true;
  if (/caf[eé]|coffee/.test(q)) slots.wantsCafe = true;
  if (/month|monthly/.test(q)) slots.wantsMonthly = true;
  return slots;
}

function rentalSignalBoost(slots: RentalIntelligenceSlots, s: RentalSignalRow): number {
  if ((s.confidence ?? 0) < 0.6) return 0;
  let boost = 0;
  if (slots.wantsNomad) boost += (s.digital_nomad_score ?? 0) * 0.35 + (s.workspace_score ?? 0) * 0.15;
  if (slots.wantsQuiet) boost += (s.quiet_score ?? 0) * 0.25;
  if (slots.wantsGym || slots.wantsCafe) boost += (s.walkability ?? 0) * 0.15;
  return boost;
}

/** SAN-1502 PR2: optional per-request, RLS-governed client. */
export type IntelligenceSearchOptions = {
  client?: SupabaseClient | null;
  /** SAN-1502 — pre-computed phase so one search performs a single phase lookup. */
  developmentPhase?: boolean;
};

export async function searchRentalsIntelligent(
  query: RentalQuery & { queryText?: string },
  options?: IntelligenceSearchOptions,
): Promise<{
  results: IntelligenceRentalResult[];
  total: number;
  source: "supabase";
  hybridUsed: boolean;
  embedStatus: EmbedStatus;
  embedFailureReason?: EmbedFailureReason;
  embedHttpStatus?: number;
  rankExplanation: RankExplanationEntry[];
  slots: RentalIntelligenceSlots;
}> {
  const limit = query.limit ?? 8;
  const queryText = query.queryText?.trim() ?? "";
  const slots = queryText ? parseRentalIntelligenceSlots(queryText) : {};
  const neighborhood = query.neighborhood ?? slots.neighborhood;
  const rankExplanation: RankExplanationEntry[] = [];
  const client = options?.client ?? getAnonClient();

  if (!client) {
    // SAN-1089: a missing client is an outage, not an empty marketplace. It used to return
    // `source: "mock"` with zero rows, which every caller treated as a successful search.
    throw new RentalSearchUnavailableError("client_unavailable");
  }

  const developmentMode = options?.developmentPhase ?? await readRentalDevelopmentPhase(client);

  /**
   * The canonical keyword/list query, shared by the normal path and the
   * "hybrid produced nothing eligible" fallback. Returns both the search-shaped
   * rows and the canonical apartments rows, so the fallback never queries them twice.
   */
  const runKeywordSearch = async (): Promise<{
    rows: HybridListingRow[];
    apartments: Record<string, unknown>[];
  }> => {
    let q = client
      .from("apartments")
      .select(
        "id, title, neighborhood, bedrooms, price_daily, price_monthly, currency, wifi_speed, amenities, images, host_name, source_url, metadata, available_from, available_to, pet_friendly, parking_included, minimum_stay_days, slug, latitude, longitude, status, landlord_id, moderation_status, listing_workflow_status, rental_can_request_viewing",
      )
      .order("price_daily", { ascending: true, nullsFirst: false })
      .limit(RENTAL_KEYWORD_OVERSCAN_LIMIT);
    if (query.maxPricePerNight != null || query.maxPriceMonthly != null) {
      q = q.or(rentalBudgetPredicate(query.maxPricePerNight ?? null, monthlyBudgetFromQuery(query)));
    }
    if (!developmentMode) q = q.eq("status", "active").not("landlord_id", "is", null);
    if (neighborhood) q = q.ilike("neighborhood", `%${neighborhood}%`);
    if (typeof query.minBedrooms === "number") q = q.gte("bedrooms", query.minBedrooms);
    if (typeof query.maxBedrooms === "number") q = q.lte("bedrooms", query.maxBedrooms);
    // SAN-486 / SAN-1349: the shared availability rule (known move-in date, full-stay coverage or
    // not expired), "today" being the America/Bogota date the viewing RPC uses.
    q = applyAvailabilityFilters(q, {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      today: rentalAvailabilityDate(),
      developmentMode,
    });
    const { data, error } = await q;
    if (error) {
      throw new RentalSearchUnavailableError(
        `keyword_query_failed${error.code ? `:${error.code}` : ""}`,
      );
    }
    const apartments = (data ?? []) as Record<string, unknown>[];
    const rows = apartments.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      description: null,
      neighborhood: r.neighborhood as string | null,
      city: null,
      price_monthly: (r.price_monthly as number | string | null) ?? null,
      currency: (r.currency as string | null) ?? null,
      bedrooms: r.bedrooms as number | null,
      bathrooms: null,
      rating: null,
      images: r.images as string[] | null,
      amenities: r.amenities as string[] | null,
      pet_friendly: null,
      furnished: null,
      status: (r.status as string | null) ?? null,
      similarity: 0,
    }));
    return { rows, apartments };
  };

  let hybridRows: HybridListingRow[] = [];
  let hybridUsed = false;
  let embedStatus: EmbedStatus = queryText ? "failed" : "skipped";
  let embedFailureReason: EmbedFailureReason | undefined;
  let embedHttpStatus: number | undefined;

  // Use the same hybrid RPC in both phases. Development visibility belongs to
  // canonical Supabase RLS, not a second AI-only eligibility switch. When the
  // embedding or RPC is unavailable, the shared keyword path still works.
  if (queryText) {
    const embedResult = await embedQueryTextDetailed(queryText);
    if (embedResult.ok) {
      embedStatus = "ok";
      const { data, error } = await client.rpc("hybrid_search_listings", {
        query_text: queryText,
        query_embedding: vectorLiteral(embedResult.values),
        match_count: Math.max(limit * 4, 20),
      }).abortSignal(AbortSignal.timeout(RENTAL_HYBRID_RPC_TIMEOUT_MS));
      if (error) {
        // Supabase JS retries transient PostgREST failures. If the RPC still
        // fails, preserve search availability by degrading to the keyword path.
        console.warn(
          "[intelligence-rental-search] hybrid RPC unavailable — keyword fallback",
          error,
        );
        rankExplanation.push({
          factor: "hybrid_rpc_error",
          score: 0,
          note: "hybrid_search_listings unavailable",
        });
      } else if (data?.length) {
        hybridRows = data as HybridListingRow[];
        hybridUsed = true;
        rankExplanation.push({
          factor: "hybrid_semantic",
          score: hybridRows[0]?.similarity ?? 0,
          note: "hybrid_search_listings RPC",
        });
      }
    } else {
      embedStatus = "failed";
      embedFailureReason = embedResult.reason;
      embedHttpStatus = embedResult.status;
      rankExplanation.push({
        factor: "embed_failed",
        score: 0,
        note: embedResult.status
          ? `${embedResult.reason}:${embedResult.status}`
          : embedResult.reason,
      });
      console.warn(
        `[intelligence-rental-search] semantic embed failed (${embedResult.reason}${embedResult.status ? ` HTTP ${embedResult.status}` : ""}) — keyword fallback`,
      );
    }
  }

  if (!hybridUsed) {
    hybridRows = (await runKeywordSearch()).rows;
  }

  let ids = hybridRows.map((r) => r.id);
  const aptMap = new Map<string, Record<string, unknown>>();

  if (ids.length) {
    let aptQ = client
      .from("apartments")
      .select(
        "id, title, neighborhood, bedrooms, price_daily, price_monthly, currency, wifi_speed, amenities, images, host_name, source_url, metadata, available_from, available_to, pet_friendly, parking_included, minimum_stay_days, slug, latitude, longitude, status, landlord_id, moderation_status, listing_workflow_status, rental_can_request_viewing",
      )
      .in("id", ids)
      // RLS applies customer eligibility and authorized development visibility.
      // Preserve the shared status and budget filters without reimposing publication gates.
;
    if (query.maxPricePerNight != null || query.maxPriceMonthly != null) {
      aptQ = aptQ.or(rentalBudgetPredicate(query.maxPricePerNight ?? null, monthlyBudgetFromQuery(query)));
    }
    if (!developmentMode) aptQ = aptQ.eq("status", "active").not("landlord_id", "is", null);
    if (neighborhood) aptQ = aptQ.ilike("neighborhood", `%${neighborhood}%`);
    if (typeof query.minBedrooms === "number") aptQ = aptQ.gte("bedrooms", query.minBedrooms);
    if (typeof query.maxBedrooms === "number") aptQ = aptQ.lte("bedrooms", query.maxBedrooms);
    // SAN-486 / SAN-1349: the shared availability rule (known move-in date, full-stay coverage or
    // not expired), "today" being the America/Bogota date the viewing RPC uses.
    aptQ = applyAvailabilityFilters(aptQ, {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      today: rentalAvailabilityDate(),
      developmentMode,
    });
    const { data: aptRows, error: aptError } = await aptQ;
    if (aptError) {
      throw new RentalSearchUnavailableError(
        `detail_query_failed${aptError.code ? `:${aptError.code}` : ""}`,
      );
    }
    for (const row of aptRows ?? []) {
      aptMap.set(row.id as string, row as Record<string, unknown>);
    }
    // Every apartments lookup applies an availability filter (explicit stay window
    // or the default current-date guard), so only keep hybrid rows that survived it.
    const availableIds = new Set(aptMap.keys());
    hybridRows = hybridRows.filter((r) => availableIds.has(r.id));
  }

  // The hybrid RPC ranks a bounded candidate window BEFORE the eligibility,
  // budget, location and availability filters above run, so a perfectly eligible
  // apartment outside that window would otherwise be reported as "no results".
  // When every hybrid candidate is filtered out, fall back to the canonical
  // keyword search instead of showing an empty marketplace (SAN-1502 PR2).
  if (hybridUsed && hybridRows.length === 0) {
    const keyword = await runKeywordSearch();
    hybridUsed = false;
    hybridRows = keyword.rows;
    for (const row of keyword.apartments) aptMap.set(String(row.id), row);
    ids = hybridRows.map((r) => r.id);
    rankExplanation.push({
      factor: "hybrid_filtered_empty",
      score: 0,
      note: "hybrid candidates were all ineligible — canonical keyword fallback",
    });
  }

  const signalMap = new Map<string, RentalSignalRow>();
  if (ids.length) {
    const { data: signals, error: signalsError } = await client
      .from("rental_signals")
      .select(
        "apartment_id, digital_nomad_score, walkability, nightlife_access, quiet_score, workspace_score, value_score, confidence, source, evidence",
      )
      .in("apartment_id", ids);
    if (signalsError) {
      console.warn(
        "[intelligence-rental-search] rental signal enrichment unavailable",
        signalsError,
      );
    } else {
      for (const s of (signals ?? []) as RentalSignalRow[]) {
        signalMap.set(s.apartment_id, s);
      }
    }
  }

  let profileBoost = 0;
  if (neighborhood) {
    const { data: hoodRow, error: hoodError } = await client
      .from("neighborhoods")
      .select("id, name")
      .ilike("name", `%${neighborhood.split(" ")[0]}%`)
      .limit(1)
      .maybeSingle();
    if (hoodError) {
      console.warn(
        "[intelligence-rental-search] neighborhood enrichment unavailable",
        hoodError,
      );
    } else if (hoodRow?.id) {
      const { data: profile, error: profileError } = await client
        .from("neighborhood_profiles")
        .select(
          "neighborhood_id, digital_nomad_friendliness, gym_coworking_proximity, noise_level, summary",
        )
        .eq("neighborhood_id", hoodRow.id)
        .maybeSingle();
      if (profileError) {
        console.warn(
          "[intelligence-rental-search] neighborhood profile enrichment unavailable",
          profileError,
        );
      } else if (profile) {
        const p = profile as NeighborhoodProfileRow;
        if (slots.wantsNomad) profileBoost += num(p.digital_nomad_friendliness) ?? 0;
        if (slots.wantsGym || slots.wantsCafe) {
          profileBoost += (num(p.gym_coworking_proximity) ?? 0) * 0.5;
        }
        rankExplanation.push({
          factor: "neighborhood_profile",
          score: profileBoost,
          note: hoodRow.name as string,
        });
      }
    }
    rankExplanation.push({
      factor: "neighborhood",
      score: 1,
      note: `${neighborhood} filter`,
    });
  }

  const scored = hybridRows.map((row, idx) => {
    const sig = signalMap.get(row.id);
    const semantic = row.similarity ?? Math.max(0, 1 - idx * 0.02);
    const boost = sig ? rentalSignalBoost(slots, sig) : 0;
    const hood = row.neighborhood ?? neighborhood ?? "";
    const hoodMatch =
      neighborhood && hood
        ? hood.toLowerCase().includes(neighborhood.toLowerCase())
          ? 1
          : 0
        : 0.5;
    const rankScore = semantic * 0.4 + boost * 0.35 + hoodMatch * 0.15 + profileBoost * 0.01;
    return { row, rankScore, sig, hood };
  });

  if (neighborhood) {
    const filtered = scored.filter(({ hood, row }) => {
      const n = hood || row.neighborhood || "";
      return n.toLowerCase().includes(neighborhood.toLowerCase());
    });
    if (filtered.length) scored.splice(0, scored.length, ...filtered);
  }

  scored.sort((a, b) => b.rankScore - a.rankScore);

  const topSig = scored[0]?.sig;
  if (topSig?.digital_nomad_score && slots.wantsNomad) {
    rankExplanation.push({
      factor: "digital_nomad_score",
      score: topSig.digital_nomad_score,
      note: "rental_signals join",
    });
  }

  let results: IntelligenceRentalResult[] = scored.slice(0, limit).map(({ row, rankScore, sig }) => {
    const apt = aptMap.get(row.id);
    if (apt) {
      // SAN-1349: requestability is derived ONLY from the canonical apartments row mapped by
      // rowToRental. A hybrid-search hit is never sufficient proof on its own — if the
      // canonical lookup could not confirm owner + workflow + availability, the mapping below
      // returns can_schedule_viewing = false.
      const rental = rowToRental(apt as unknown as import("../tools/search-rentals").ApartmentRow);
      return {
        ...rental,
        rankScore,
        signalSource: sig?.source ?? undefined,
        evidenceText: sig?.source ? `Signal source: ${sig.source}` : null,
      };
    }
    // No canonical apartments row survived the availability filter, so ownership and workflow
    // state are unproven. Never synthesize a viewing URL from the hybrid result alone.
    return {
      id: row.id,
      title: row.title,
      neighborhood: row.neighborhood ?? neighborhood ?? "Medellín",
      nightly_price: nightlyPriceFrom({ price_monthly: row.price_monthly }),
      currency: (row.currency ?? "USD").toUpperCase(),
      bedrooms: row.bedrooms ?? 0,
      wifi: true,
      amenities: row.amenities ?? [],
      image: (row.images ?? [])[0] ?? "",
      source_url: `https://mdeai.co/rentals/${row.id}`,
      can_schedule_viewing: false,
      schedule_viewing_url: null,
      host_name: "Host",
      // No canonical row survived the availability filter, so ownership is unproven and
      // this row is never requestable. Do not claim a stay date we cannot verify.
      availability: "Availability unconfirmed",
      tags: [],
      rankScore,
      signalSource: sig?.source ?? undefined,
    };
  });

  if (query.stayType === "monthly") {
    results = sortForMonthlyStay(results);
  }

  return {
    results,
    total: scored.length,
    source: "supabase",
    hybridUsed,
    embedStatus,
    embedFailureReason,
    embedHttpStatus,
    rankExplanation,
    slots,
  };
}
