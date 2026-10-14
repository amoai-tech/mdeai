import Link from "next/link";
import { notFound } from "next/navigation";
import { getRentalDetail } from "@/lib/rentals/get-rental-detail";
import {
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from "@/mastra/lib/rental-search-unavailable";
import { RentalDetailView } from "@/components/rentals/rental-detail-view";
import { buildRentalsUrl, parseBrowseFilters, type RentalBrowseSearchParams } from "@/lib/rentals/browse-filters";

interface Props {
  params: Promise<{ id: string }>;
  /** The browse filters the renter arrived with; used only to build "Back to results". */
  searchParams?: Promise<RentalBrowseSearchParams>;
}

// skipcq: JS-0067 - Next.js App Router metadata export; not browser global scope
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const detail = await getRentalDetail(id);
    if (detail) return { title: `${detail.title} · ${detail.neighborhood} · mdeai` };
  } catch {
    /* fall through to default */
  }
  return { title: "Rental · mdeai" };
}

/** SAN-1202 · RE-DES-007 — consumer rental detail page `/rentals/[id]`. */
// skipcq: JS-0067 - Next.js App Router page export; not browser global scope
export default async function RentalDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  // Only recognised, validated filters are carried back; anything else in the URL is ignored.
  const backHref = buildRentalsUrl(parseBrowseFilters((await searchParams) ?? {}).filters);

  let detail;
  try {
    detail = await getRentalDetail(id);
  } catch (err) {
    console.error("[/rentals/[id]] load failed:", describeRentalSearchError(err));
    const unavailable = isRentalSearchUnavailable(err);
    return (
      <main
        data-testid="rental-detail-error"
        className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center"
      >
        <h1 className="font-serif text-xl font-semibold">
          {unavailable ? "Rental details are temporarily unavailable" : "Couldn’t load this rental"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {unavailable
            ? "We can’t reach our listings right now. Please try again in a moment."
            : "Something went wrong on our side. Please try again."}
        </p>
        {unavailable ? (
          <Link
            href={`/rentals/${encodeURIComponent(id)}`}
            className="text-sm font-medium text-primary hover:underline"
            data-testid="rental-detail-error-retry"
          >
            Retry
          </Link>
        ) : null}
        <Link
          href={backHref}
          className="text-sm text-primary hover:underline"
          data-testid="rental-detail-error-back"
        >
          Back to results
        </Link>
      </main>
    );
  }

  if (!detail) notFound();

  return <RentalDetailView detail={detail} backHref={backHref} />;
}
