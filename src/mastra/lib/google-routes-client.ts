const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

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
  constructor(message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = "RoutesRequestError";
    this.status = status;
    this.cause = cause;
  }
}

export class RouteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteInputError";
  }
}

function validCoordinate(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

function waypointBody(point: RouteWaypoint): Record<string, unknown> {
  if ("placeId" in point) {
    const placeId = point.placeId.trim();
    if (!placeId) throw new RouteInputError("Route waypoint placeId is empty");
    return { placeId };
  }
  if ("address" in point) {
    const address = point.address.trim();
    if (!address) throw new RouteInputError("Route waypoint address is empty");
    return { address };
  }
  if (!validCoordinate(point.latitude, -90, 90) || !validCoordinate(point.longitude, -180, 180)) {
    throw new RouteInputError("Route waypoint coordinates are out of range");
  }
  return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
}

/** Validate local input before spending a paid provider call. */
export function validateRouteWaypoints(origin: RouteWaypoint, destination: RouteWaypoint): void {
  waypointBody(origin);
  waypointBody(destination);
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
  includePolyline = false,
): GoogleRouteResult | null {
  const routes = (response as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const route = routes[0];
  if (!route || typeof route !== "object") return null;
  const record = route as Record<string, unknown>;
  const distanceMeters = record.distanceMeters;
  const durationSeconds = parseDurationSeconds(record.duration);
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return null;
  }
  if (durationSeconds === null) return null;
  const polyline = includePolyline
    ? (record.polyline as { encodedPolyline?: unknown } | undefined)?.encodedPolyline
    : undefined;
  return {
    distanceMeters,
    durationSeconds,
    travelMode,
    encodedPolyline: typeof polyline === "string" && polyline.trim() ? polyline : undefined,
    attribution: "Google Maps",
  };
}

/** Routes-capable key: explicit Routes key first, then the Routes-enabled server key. */
export function requireRoutesApiKey(): string {
  const key = [
    process.env.GOOGLE_ROUTES_API_KEY,
    process.env.GOOGLE_MAPS_SERVER_API_KEY,
    process.env.GOOGLE_PLACES_API_KEY,
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value && value.length >= 8));
  if (!key) {
    throw new RoutesRequestError("Missing a Routes-capable Google API key");
  }
  return key;
}

export async function computeGoogleRoute(params: {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  travelMode?: RouteTravelMode;
  includePolyline?: boolean;
}): Promise<GoogleRouteResult | null> {
  const travelMode = params.travelMode ?? "WALK";
  const includePolyline = params.includePolyline === true;
  const body: Record<string, unknown> = {
    origin: waypointBody(params.origin),
    destination: waypointBody(params.destination),
    travelMode,
    computeAlternativeRoutes: false,
  };
  if (includePolyline) body.polylineQuality = "OVERVIEW";

  const fieldMask = [
    "routes.distanceMeters",
    "routes.duration",
    ...(includePolyline ? ["routes.polyline.encodedPolyline"] : []),
  ].join(",");

  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": requireRoutesApiKey(),
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new RoutesRequestError("Google Routes request failed before response", undefined, err);
  }
  if (!res.ok) {
    throw new RoutesRequestError("Google Routes request failed", res.status);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new RoutesRequestError("Google Routes returned invalid JSON", res.status, err);
  }
  return parseGoogleRoute(json, travelMode, includePolyline);
}
