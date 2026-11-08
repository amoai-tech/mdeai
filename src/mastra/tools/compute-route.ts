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
        try {
          validateRouteWaypoints(input.origin, input.destination);
        } catch (err) {
          if (err instanceof RouteInputError) {
            return { route: null, source: "google_routes" as const, reason: "invalid_route_request" };
          }
          throw err;
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
        const cache = (context as { requestContext?: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } } | undefined)?.requestContext;
        const cacheKey = JSON.stringify({ origin: input.origin, destination: input.destination, travelMode: input.travelMode ?? "WALK", includePolyline: input.includePolyline === true });
        let cached:
          | Record<string, { route: Awaited<ReturnType<typeof computeGoogleRoute>> }>
          | undefined;
        try {
          cached = cache?.get("mdeaiRouteToolCache") as
            | Record<string, { route: Awaited<ReturnType<typeof computeGoogleRoute>> }>
            | undefined;
        } catch {
          // A broken RequestContext store is a cache miss, never a route failure.
          cached = undefined;
        }
        if (cached?.[cacheKey]?.route) {
          return { route: cached[cacheKey].route, source: "google_routes" as const };
        }
        const userId = getAuditUserId(context);
        if (userId) {
          const perUserRaw = process.env.ROUTES_DAILY_LIMIT_PER_USER;
          const perUserCap = perUserRaw === undefined ? 20 : Number.parseInt(perUserRaw, 10);
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

        try {
          const route = await computeGoogleRoute(input);
          if (route && cache) {
            cache.set("mdeaiRouteToolCache", { ...(cached ?? {}), [cacheKey]: { route } });
          }
          return route
            ? { route, source: "google_routes" as const }
            : { route: null, source: "google_routes" as const, reason: "route_unavailable" };
        } catch (err) {
          console.warn("[compute-route] provider failure", err instanceof Error ? err.message : err);
          return { route: null, source: "google_routes" as const, reason: "route_unavailable" };
        }
      },
      context,
    ),
});
