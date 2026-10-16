// SAN-1503: this file lives in the `(browse)` route group so the skeleton wraps ONLY the /rentals list.
// Next.js sends HTTP 200 as soon as a `loading.js` boundary starts streaming, so a loading.tsx directly
// under `app/rentals/` also wrapped `/rentals/[id]` and made an unknown listing answer 200, not 404.
// https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes
import { Skeleton } from "@/components/ui/skeleton";

// Stable keys for fixed-length skeleton lists (no array-index keys — JS-0437).
const NEIGHBORHOOD_SKELETON_KEYS = ["n-a", "n-b", "n-c", "n-d", "n-e"];
const BEDS_SKELETON_KEYS = ["b-a", "b-b", "b-c", "b-d"];
const MENU_SKELETON_KEYS = ["m-a", "m-b", "m-c", "m-d", "m-e", "m-f"];
const CARD_SKELETON_KEYS = ["c-a", "c-b", "c-c", "c-d", "c-e", "c-f"];

// skipcq: JS-0067 - module-local skeleton component; not browser global scope
function RentalCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      {/* Image — hidden on mobile, 200×120 on sm+ */}
      <Skeleton className="hidden h-[120px] w-[200px] shrink-0 rounded-md sm:block" />
      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-14 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="mt-auto flex gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function RentalsLoading() {
  // Same grid as the loaded page (DiscoveryWorkspace), so nothing jumps when the results arrive.
  return (
    <div
      data-testid="rentals-browse-loading"
      className="flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[208px_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading rentals"
    >
      {/* Side menu — desktop only */}
      <aside className="hidden border-r border-border p-4 lg:block" aria-hidden="true">
        <Skeleton className="h-6 w-24" />
        <div className="mt-6 space-y-2">
          {MENU_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-md lg:hidden" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>
          {/* Filter chips — neighborhoods + beds */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {NEIGHBORHOOD_SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-8 w-24 rounded-full" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {BEDS_SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          </div>
        </header>
        <div className="px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
            {CARD_SKELETON_KEYS.map((key) => (
              <RentalCardSkeleton key={key} />
            ))}
          </div>
        </div>
      </main>

      {/* Map column — desktop only */}
      <aside className="hidden min-h-0 p-3 lg:block" aria-hidden="true">
        <Skeleton className="size-full rounded-xl" />
      </aside>
    </div>
  );
}
