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
        let quota;
        try {
          quota = await checkRateLimitDurable(`routes-daily:${today}`, cap, 86_400);
        } catch {
          // Network failures of the quota service cannot authorize paid calls.
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
