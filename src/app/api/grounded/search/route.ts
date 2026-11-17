import { NextResponse } from "next/server";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { checkSearchFastPathRateLimit } from "@/lib/api-ip-rate-limit";
import { searchGroundedPlacesTool } from "@/mastra/tools/search-grounded-places";
import { isMapAreaQuery } from "@/lib/map-area-query";
import { hasExplicitPlaceScope } from "@/mastra/lib/google-places-cafe-search";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { RENTAL_SUPABASE_KEY } from "@/mastra/tools/search-rentals";
import { MDEAI_USER_ID_KEY } from "@/mastra/lib/tool-audit-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const bodySchema = z.object({
  query: z.string().min(1),
  neighborhood: z.string().optional(),
  limit: z.number().int().min(1).max(10).optional().default(5),
  intent: z.enum(["cafe", "nightlife", "general"]).optional(),
  nearbyRentalId: z.string().uuid().optional(),
  nearbyRadiusMeters: z.number().int().min(100).max(5000).optional(),
  locationBias: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }).strict().optional(),
});

/** Fast path — grounded café search without relying on conciergeAgent tool calls. */
// skipcq: JS-0067, JS-R1005 - route handler; intentional validation branching, not a bug
export async function POST(req: Request) {
  const rateLimited = checkSearchFastPathRateLimit(req);
  if (rateLimited) return rateLimited;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { query, neighborhood, limit, intent, nearbyRentalId, nearbyRadiusMeters, locationBias } = parsed.data;
  const searchQuery = neighborhood
    ? `${query.trim()} near ${neighborhood}`
    : query.trim();

  // A map-relative request without a map center must not silently search
  // around a fixed point. No Places quota is used for this response.
  if (isMapAreaQuery(searchQuery) && !locationBias && !nearbyRentalId) {
    return NextResponse.json({
      results: [], attribution: [], source: "grounding",
      metadata: { reason: "missing_map_context" },
    });
  }

  try {
    const execute = searchGroundedPlacesTool.execute;
    if (!execute) {
      return NextResponse.json(
        { error: "grounded search unavailable" },
        { status: 500 },
      );
    }
    // A hidden button is not authorization. Verify a real signed-in user
    // before a billable Nearby request, then preserve this client's apartment RLS.
    // Standalone public café discovery remains available without sign-in.
    const rentalClient = nearbyRentalId ? await createSupabaseServerClient() : null;
    let verifiedNearbyUserId: string | null = null;
    if (rentalClient) {
      const { data: { user }, error: authError } = await rentalClient.auth.getUser();
      if (authError || !user || user.is_anonymous) {
        return NextResponse.json(
          { error: "authentication_required" },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }
      verifiedNearbyUserId = user.id;
    }
    // The tool audit path writes tool spans through RequestContext.set(); a
    // read-only stub made every Nearby call fail after the provider returned
    // (TypeError: set is not a function). Use the real context so get/set share
    // one store.
    const context: { requestContext?: RequestContext } = {};
    if (rentalClient) {
      const requestContext = new RequestContext();
      requestContext.set(RENTAL_SUPABASE_KEY, rentalClient);
      if (verifiedNearbyUserId) {
        requestContext.set(MDEAI_USER_ID_KEY, verifiedNearbyUserId);
      }
      context.requestContext = requestContext;
    }
    const out = await execute(
      {
        query: searchQuery,
        pageSize: limit,
        ...(intent ? { intent } : {}),
        ...(isMapAreaQuery(searchQuery) && !neighborhood && !hasExplicitPlaceScope(query) && locationBias && !nearbyRentalId ? { locationBias } : {}),
        ...(nearbyRentalId ? { nearbyRentalId, nearbyRadiusMeters: nearbyRadiusMeters ?? 800 } : {}),
      },
      context as never,
    );
    const results = (out as { results?: unknown[] }).results ?? [];
    if (results.length === 0) {
      console.warn("[api/grounded/search] empty results", {
        query: searchQuery.slice(0, 80),
        metadata: (out as { metadata?: unknown }).metadata,
      });
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error("[api/grounded/search]", err);
    return NextResponse.json(
      { error: "grounded search failed" },
      { status: 500 },
    );
  }
}
