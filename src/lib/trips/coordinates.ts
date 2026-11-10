/** One coordinate rule shared by the itinerary and the map. */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export type CoordinatePair = {
  latitude: number | null;
  longitude: number | null;
};

export function hasValidCoordinates(
  item: CoordinatePair,
): item is CoordinatePair & { latitude: number; longitude: number } {
  return (
    item.latitude != null &&
    item.longitude != null &&
    isValidCoordinate(item.latitude, item.longitude)
  );
}
