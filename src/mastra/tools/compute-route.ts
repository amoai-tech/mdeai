import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  computeGoogleRoute,
  requireRoutesApiKey,
  RouteInputError,
  validateRouteWaypoints,
  type RouteTravelMode,
} from "../lib/google-routes-client";
import { checkRateLimitDurable } from "@/lib/distributed-rate-limit";
import { getAuditUserId } from "../lib/tool-audit-context";
import { runAuditedTool } from "../lib/run-audited-search";
import { getRoutePlan } from "../lib/route-tool-choice";
import { resolveRoutePlaceId } from "../lib/route-endpoint-resolution";

const waypointSchema = z.union([
  z.object({ latitude: z.number(), longitude: z.number() }),
  z.object({ placeId: z.string().min(1) }),
  z.object({ address: z.string().min(1) }),
]);

export const computeRouteInputSchema = z.object({
  origin: waypointSchema.describe("Selected place as lat/lng, placeId, or address"),
  destination: waypointSchema.describe("Destination as lat/lng, placeId, or address"),
  travelMode: z.enum(["WALK", "DRIVE", "BICYCLE", "TRANSIT"]).default("WALK").optional(),
  includePolyline: z.boolean().default(false).optional(),
});

type RequestContextCache = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

type RouteResult = Awaited<ReturnType<typeof computeGoogleRoute>>;

/** Per-turn cache of a completed provider outcome, success or honest failure. */
type CachedRouteResult = {
  route: RouteResult;
  reason?: string;
};

const ROUTE_TOOL_CACHE_KEY = "mdeaiRouteToolCache";
const ROUTE_PLACE_CACHE_KEY = "mdeaiRoutePlaceCache";

function readCache<T>(requestContext: RequestContextCache | undefined, key: string): T | undefined {
  try {
    return requestContext?.get(key) as T | undefined;
  } catch {
    // A broken RequestContext store is a cache miss, never a route failure.
    return undefined;
  }
}

function writeCache(requestContext: RequestContextCache | undefined, key: string, value: unknown): void {
  try {
    requestContext?.set(key, value);
  } catch {
    // A paid route must still be returned when the cache write fails.
    console.warn("[compute-route] route cache write failed");
  }
}

export const computeRouteTool = createTool({
  id: "compute-route",
  description:
    "Compute a real Google Maps route distance and duration between two places. Returns route: null with a reason when Google cannot provide a route. Never estimate travel time.",
  inputSchema: computeRouteInputSchema,
  outputSchema: z.object({
    route: z
      .object({
        distanceMeters: z.number(),
        durationSeconds: z.number(),
        travelMode: z.enum(["WALK", "DRIVE", "BICYCLE", "TRANSIT"]),
        encodedPolyline: z.string().optional(),
        warning: z.string().optional(),
        attribution: z.literal("Google Maps"),
      })
      .nullable(),
    source: z.literal("google_routes"),
    reason: z.string().optional(),
  }),
  execute: async (
    input: {
      origin: z.infer<typeof waypointSchema>;
      destination: z.infer<typeof waypointSchema>;
      travelMode?: RouteTravelMode;
      includePolyline?: boolean;
    },
    context?: unknown,
  ) =>
    runAuditedTool(
      "compute-route",
      async () => {
        const requestContext = (context as { requestContext?: RequestContextCache } | undefined)
          ?.requestContext;
        const plan = getRoutePlan(context);
        const includePolyline = input.includePolyline === true;

        // A forced route question carries the user's own endpoints. Cache that
        // whole outcome so a model that calls the tool twice in one turn cannot
        // spend a second billable Routes/Places call or quota slot.
        const cacheKey = plan
          ? `plan:${JSON.stringify(plan)}:${includePolyline}`
          : JSON.stringify({
              origin: input.origin,
              destination: input.destination,
              travelMode: input.travelMode ?? "WALK",
              includePolyline,
            });
        const routeCache =
          readCache<Record<string, CachedRouteResult>>(requestContext, ROUTE_TOOL_CACHE_KEY) ?? {};
        const cached = routeCache[cacheKey];
        if (cached) {
          return { ...cached, source: "google_routes" as const };
        }

        if (!plan) {
          try {
            validateRouteWaypoints(input.origin, input.destination);
          } catch (err) {
            if (err instanceof RouteInputError) {
              return { route: null, source: "google_routes" as const, reason: "invalid_route_request" };
            }
            throw err;
          }
        }

        // Routes have their own daily budget; never consume the café/nightlife cap.
        const capRaw = process.env.ROUTES_DAILY_LIMIT;
        const cap = capRaw === undefined ? 100 : Number(capRaw);
        if (!Number.isSafeInteger(cap) || cap <= 0) {
          return { route: null, source: "google_routes" as const, reason: "route_quota_disabled" };
        }
        // A missing Routes key must not consume a paid-call quota slot.
        try {
          requireRoutesApiKey();
        } catch {
          console.warn("[compute-route] no Routes-capable server key configured");
          return { route: null, source: "google_routes" as const, reason: "route_unavailable" };
        }
        const today = new Date().toISOString().slice(0, 10);
        const userId = getAuditUserId(context);
        if (userId) {
          const perUserRaw = process.env.ROUTES_DAILY_LIMIT_PER_USER;
          const perUserCap = perUserRaw === undefined ? 20 : Number(perUserRaw);
          if (!Number.isSafeInteger(perUserCap) || perUserCap <= 0) {
            return { route: null, source: "google_routes" as const, reason: "route_quota_disabled" };
          }
          let userQuota;
          try {
            userQuota = await checkRateLimitDurable(
              `routes-daily:${today}:${userId}`,
              perUserCap,
              86_400,
            );
          } catch {
            return { route: null, source: "google_routes" as const, reason: "route_quota_unavailable" };
          }
          if (!userQuota.storeAvailable) {
            return { route: null, source: "google_routes" as const, reason: "route_quota_unavailable" };
          }
          if (!userQuota.allowed) {
            return { route: null, source: "google_routes" as const, reason: "route_quota_per_user_exceeded" };
          }
        }

        // Only after the per-user check may the shared daily slot be consumed.
        let quota;
        try {
          quota = await checkRateLimitDurable(`routes-daily:${today}`, cap, 86_400);
        } catch {
          console.warn("[compute-route] route quota RPC transport unavailable");
          return { route: null, source: "google_routes" as const, reason: "route_quota_unavailable" };
        }
        if (!quota.storeAvailable) {
          console.warn("[compute-route] route quota store unavailable");
          return { route: null, source: "google_routes" as const, reason: "route_quota_unavailable" };
        }
        if (!quota.allowed) {
          return { route: null, source: "google_routes" as const, reason: "route_quota_exceeded" };
        }

        let origin = input.origin;
        let destination = input.destination;
        let travelMode: RouteTravelMode = input.travelMode ?? "WALK";

        if (plan) {
          // Resolve the names the user typed to real Google Place IDs. A model
          // that invents an ID can no longer send Google a 404 route request.
          const placeCache =
            readCache<Record<string, string>>(requestContext, ROUTE_PLACE_CACHE_KEY) ?? {};
          const resolve = async (name: string): Promise<string | null> => {
            const key = name.trim().toLowerCase();
            const hit = placeCache[key];
            if (hit) return hit;
            const placeId = await resolveRoutePlaceId(name);
            if (placeId) {
              placeCache[key] = placeId;
              writeCache(requestContext, ROUTE_PLACE_CACHE_KEY, placeCache);
            }
            return placeId;
          };
          const [originPlaceId, destinationPlaceId] = await Promise.all([
            resolve(plan.origin),
            resolve(plan.destination),
          ]);
          if (!originPlaceId || !destinationPlaceId) {
            const failed: CachedRouteResult = { route: null, reason: "route_unavailable" };
            routeCache[cacheKey] = failed;
            writeCache(requestContext, ROUTE_TOOL_CACHE_KEY, routeCache);
            return { route: null, source: "google_routes" as const, reason: "route_unavailable" };
          }
          origin = { placeId: originPlaceId };
          destination = { placeId: destinationPlaceId };
          travelMode = plan.travelMode;
        }

        try {
          validateRouteWaypoints(origin, destination);
        } catch (err) {
          if (err instanceof RouteInputError) {
            return { route: null, source: "google_routes" as const, reason: "invalid_route_request" };
          }
          throw err;
        }

        try {
          const route = await computeGoogleRoute({ origin, destination, travelMode, includePolyline });
          const result: CachedRouteResult = route
            ? { route }
            : { route: null, reason: "route_unavailable" };
          routeCache[cacheKey] = result;
          writeCache(requestContext, ROUTE_TOOL_CACHE_KEY, routeCache);
          return { ...result, source: "google_routes" as const };
        } catch (err) {
          console.warn("[compute-route] provider failure", err instanceof Error ? err.message : err);
          const failed: CachedRouteResult = { route: null, reason: "route_unavailable" };
          routeCache[cacheKey] = failed;
          writeCache(requestContext, ROUTE_TOOL_CACHE_KEY, routeCache);
          return { route: null, source: "google_routes" as const, reason: "route_unavailable" };
        }
      },
      context,
    ),
});
