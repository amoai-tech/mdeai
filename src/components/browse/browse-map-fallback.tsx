/**
 * Shown when the map slot itself fails to render. It must never imply that the restaurant
 * list is incomplete: the map is an aid, the ballot is the product.
 */
export function BrowseMapFallback() {
  return (
    <div
      className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 p-6 text-center"
      data-testid="browse-map-unavailable"
    >
      <p className="text-sm font-medium text-foreground">The map isn&apos;t available right now.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The restaurant list is complete — every place is still listed.
      </p>
    </div>
  );
}
