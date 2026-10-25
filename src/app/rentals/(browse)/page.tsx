import { RentalBrowseView } from "@/components/rentals/rental-browse-view";
import { describeRentalSearchError } from "@/mastra/lib/rental-search-unavailable";
import { searchRentals, type Rental } from "@/mastra/tools/search-rentals";
import { createClient } from "@/lib/supabase/server";
import { parseBrowseFilters, type RentalBrowseSearchParams } from "@/lib/rentals/browse-filters";

interface Props {
  searchParams: Promise<
    RentalBrowseSearchParams & {
      /** Retired by SAN-1089: old bookmarks may still carry it; it is read and ignored. */
      maxPrice?: string;
    }
  >;
}

const SEARCH_UNAVAILABLE_MESSAGE = "Rental search is temporarily unavailable.";

/**
 * Render the whole active catalogue on one page. The previous cap of 24 hid the
 * Rentberry development batch behind "34 apartments (showing 24)", so a listing that
 * was published and bookable could not be reached by scrolling.
 * ponytail: a single large page is fine while the development catalogue is ~44 rows;
 * the upgrade path is cursor pagination once the catalogue grows past a few hundred.
 */
const BROWSE_RESULT_LIMIT = 100;

/** REAL-011 / SAN-478 — /rentals browse page. */
export default async function RentalsPage({ searchParams }: Props) {
  // One parser for the whole browse state (neighborhood, bedrooms, From/Through dates).
  const { filters, dateError } = parseBrowseFilters(await searchParams);

  let error: string | null = null;
  let results: Rental[] = [];
  let total = 0;

  // Bad dates fail closed: show the message and run NO search, instead of silently ignoring the
  // dates and listing apartments that may not be free for the stay.
  if (!dateError) {
    try {
      const minBedrooms = filters.beds != null ? parseInt(filters.beds, 10) : undefined;

      // SAN-1502 PR2: search with the caller's own RLS-governed client, so an
      // authorized test actor also sees published development fixtures.
      const supabase = await createClient();

      // No price cap is sent. The old USD/night chips compared a nightly dollar figure with
      // monthly-COP stock; SAN-386 owns the validated amount + currency + period budget.
      const data = await searchRentals({
        neighborhood: filters.neighborhood ?? undefined,
        minBedrooms,
        checkIn: filters.from ?? undefined,
        checkOut: filters.through ?? undefined,
        limit: BROWSE_RESULT_LIMIT,
      }, { client: supabase });

      results = data.results;
      total   = data.total;
    } catch (err) {
      // An unreadable database and an empty marketplace are different answers (SAN-1089).
      error = SEARCH_UNAVAILABLE_MESSAGE;
      console.error("[/rentals] searchRentals failed:", describeRentalSearchError(err));
    }
  }

  return (
    <RentalBrowseView
      results={results}
      total={total}
      error={error}
      neighborhood={filters.neighborhood}
      beds={filters.beds}
      from={filters.from}
      through={filters.through}
      dateError={dateError}
    />
  );
}
