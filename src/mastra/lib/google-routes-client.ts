import { requirePlacesApiKey } from "./google-places-client";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
].join(",");

export type RouteTravelMode = "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";

export type RouteWaypoint =
  | { latitude: number; longitude: number }
  | { placeId: string }
  | { address: string };

export type GoogleRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  travelMode: RouteTravelMode;
  encodedPolyline?: string;
  attribution: "Google Maps";
};

export class RoutesRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RoutesRequestError";
    this.status = status;
  }
}

function validCoordinate(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

function waypointBody(point: RouteWaypoint): Record<string, unknown> {
  if ("placeId" in point) {
    const placeId = point.placeId.trim();
    if (!placeId) throw new RoutesRequestError("Route waypoint placeId is empty");
    return { placeId };
  }
  if ("address" in point) {
    const address = point.address.trim();
    if (!address) throw new RoutesRequestError("Route waypoint address is empty");
    return { address };
  }
  if (!validCoordinate(point.latitude, -90, 90) || !validCoordinate(point.longitude, -180, 180)) {
    throw new RoutesRequestError("Route waypoint coordinates are out of range");
  }
  return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
}

export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)s$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function parseGoogleRoute(
  response: unknown,
  travelMode: RouteTravelMode,
): GoogleRouteResult | null {
  const routes = (response as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const route = routes[0] as Record<string, unknown>;
  const distanceMeters = route.distanceMeters;
  const durationSeconds = parseDurationSeconds(route.duration);
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return null;
  }
  if (durationSeconds === null) return null;
  const polyline = (route.polyline as { encodedPolyline?: unknown } | undefined)?.encodedPolyline;
  return {
    distanceMeters,
    durationSeconds,
    travelMode,
    encodedPolyline: typeof polyline === "string" && polyline.trim() ? polyline : undefined,
    attribution: "Google Maps",
  };
}

export async function computeGoogleRoute(params: {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  travelMode?: RouteTravelMode;
  includePolyline?: boolean;
}): Promise<GoogleRouteResult | null> {
  const travelMode = params.travelMode ?? "WALK";
  const apiKey = requirePlacesApiKey();
  const body: Record<string, unknown> = {
    origin: waypointBody(params.origin),
    destination: waypointBody(params.destination),
    travelMode,
    computeAlternativeRoutes: false,
  };
  if (params.includePolyline) body.polylineQuality = "OVERVIEW";

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new RoutesRequestError("Google Routes request failed", res.status);
  }
  return parseGoogleRoute(await res.json(), travelMode);
}
