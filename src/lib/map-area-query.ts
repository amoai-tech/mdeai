/** One client/server definition of a map-relative Places request. */
const MAP_AREA_CONTEXT =
  /(?<![\p{L}\p{N}_])(around this map area|this map area|around this map|current map|map area|near here|around here|en esta zona|en este mapa|por aqu[ií]|cerca de aqu[ií])(?![\p{L}\p{N}_])/iu;
const MAP_AREA_CONTEXT_GLOBAL = new RegExp(MAP_AREA_CONTEXT.source, "giu");

export function isMapAreaQuery(query: string): boolean {
  return MAP_AREA_CONTEXT.test(query);
}

/** Remove camera-specific wording before passing text to Google Places.
 * The map's real coordinates are carried separately as locationBias.
 */
export function mapAreaProviderQuery(query: string): string {
  return query.replace(MAP_AREA_CONTEXT_GLOBAL, " ").replace(/\s+/g, " ").trim() || "cafés";
}
