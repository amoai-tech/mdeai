/** One client/server definition of a map-relative Places request. */
const MAP_AREA_CONTEXT =
  /\b(this map area|around this map|current map|map area|near here|around here|en esta zona|en este mapa|por aqu[ií]|cerca de aqu[ií])\b/i;

export function isMapAreaQuery(query: string): boolean {
  return MAP_AREA_CONTEXT.test(query);
}
