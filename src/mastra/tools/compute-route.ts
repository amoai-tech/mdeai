import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  computeGoogleRoute,
  RouteInputError,
  validateRouteWaypoints,
  type RouteTravelMode,
} from "../lib/google-routes-client";
import { incrementAndCheckGroundingQuota } from "../lib/grounding-quota";
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

        const quota = await incrementAndCheckGroundingQuota();
        if (!quota.allowed) {
          console.warn("[compute-route] route quota unavailable", quota.reason);
          return { route: null, source: "google_routes" as const, reason: `route_quota_${quota.reason}` };
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
