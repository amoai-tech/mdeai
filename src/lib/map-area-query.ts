/** One client/server definition of a map-relative Places request. */
const MAP_AREA_CONTEXT =
  /(?<![\p{L}\p{N}_])(this map area|around this map|current map|map area|near here|around here|en esta zona|en este mapa|por aqu[ií]|cerca de aqu[ií])(?![\p{L}\p{N}_])/iu;

export function isMapAreaQuery(query: string): boolean {
  return MAP_AREA_CONTEXT.test(query);
}
