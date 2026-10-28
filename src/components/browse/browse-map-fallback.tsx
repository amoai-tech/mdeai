/** Keep the map-failure message true on rentals, restaurants, cafés and nightlife. */
export function BrowseMapFallback() {
  return (
    <div
      className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 p-6 text-center"
      data-testid="browse-map-unavailable"
    >
      <p className="text-sm font-medium text-foreground">The map isn&apos;t available right now.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        You can still explore the listings and open their details.
      </p>
    </div>
  );
}
