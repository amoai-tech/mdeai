import { RentalBrowseView } from "@/components/rentals/rental-browse-view";
import { isRentalSearchUnavailable } from "@/mastra/lib/rental-search-unavailable";
import { searchRentals, type Rental } from "@/mastra/tools/search-rentals";

interface Props {
  searchParams: Promise<{
    neighborhood?: string;
    beds?: string;
    /** Retired by SAN-1089: old bookmarks may still carry it; it is read and ignored. */
    maxPrice?: string;
  }>;
}

const SEARCH_UNAVAILABLE_MESSAGE = "Rental search is temporarily unavailable.";

/** REAL-011 / SAN-478 — /rentals browse page. */
export default async function RentalsPage({ searchParams }: Props) {
  const { neighborhood, beds } = await searchParams;

  // Normalise filter values — unknown strings become undefined
  const nbhd     = neighborhood ?? null;
  const bedsVal  = beds && /^[0-3]$/.test(beds) ? beds : null;

  let error: string | null = null;
  let results: Rental[] = [];
  let total = 0;

  try {
    const minBedrooms = bedsVal != null ? parseInt(bedsVal, 10) : undefined;

    // No price cap is sent. The old USD/night chips compared a nightly dollar figure with
    // monthly-COP stock; SAN-386 owns the validated amount + currency + period budget.
    const data = await searchRentals({
      neighborhood: nbhd ?? undefined,
      minBedrooms,
      limit: 24,
    });

    results = data.results;
    total   = data.total;
  } catch (err) {
    // An unreadable database and an empty marketplace are different answers (SAN-1089).
    error = SEARCH_UNAVAILABLE_MESSAGE;
    console.error(
      "[/rentals] searchRentals failed:",
      isRentalSearchUnavailable(err) ? err.reason : (err as Error).message,
    );
  }

  return (
    <RentalBrowseView
      results={results}
      total={total}
      error={error}
      neighborhood={nbhd}
      beds={bedsVal}
    />
  );
}
