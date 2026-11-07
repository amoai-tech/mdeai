/** Great-circle distance between two WGS84 points, rounded to whole metres. */
export function geoDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earthRadiusM = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * toRad;
  const dLng = (to.lng - from.lng) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * toRad) * Math.cos(to.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadiusM * Math.asin(Math.sqrt(a)));
}
