/** Map only real saved place data. A generic city is not a precise pin. */
export function buildVenueDirectionsUrl(
  address: string | null,
  latitude?: number | null,
  longitude?: number | null,
): string | null {
  const destination = address?.trim()
    || (latitude != null && longitude != null
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? `${latitude},${longitude}`
        : null);
  if (!destination) return null;
  const params = new URLSearchParams({ api: "1", destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A broad, unconfirmed listing location must not launch exact venue directions. */
export function buildListedAreaMapUrl(area: string | null): string | null {
  if (!area?.trim()) return null;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: area.trim() })}`;
}
