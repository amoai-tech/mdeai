import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRentalDetail } from "@/lib/rentals/get-rental-detail";
import { createClient } from "@/lib/supabase/server";
import {
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from "@/mastra/lib/rental-search-unavailable";
import { RentalDetailView } from "@/components/rentals/rental-detail-view";
import { buildRentalsUrl, parseBrowseFilters, type RentalBrowseSearchParams } from "@/lib/rentals/browse-filters";
import {
  getLocalPreviewDetail,
  isLocalPreviewRequest,
  isLocalRentalPreviewEnabled,
} from "@/lib/rentals/dev-rental-preview";

/** A candidate detail is only served to a direct localhost request with the dev flag on. */
async function isLocalPreviewPage(): Promise<boolean> {
  if (!isLocalRentalPreviewEnabled()) return false;
  const requestHeaders = await headers();
  return isLocalPreviewRequest(requestHeaders.get("host"), requestHeaders);
}

interface Props {
  params: Promise<{ id: string }>;
  /** The browse filters the renter arrived with; used only to build "Back to results". */
  searchParams?: Promise<RentalBrowseSearchParams>;
}

// skipcq: JS-0067 - Next.js App Router metadata export; not browser global scope
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  let detail: Awaited<ReturnType<typeof getRentalDetail>> | null = null;
  try {
    const preview = (await isLocalPreviewPage()) && id.startsWith("candidate-fincaraiz-");
    // SAN-1502 PR2: read Details with the caller's own RLS-governed client.
    const supabase = preview ? null : await createClient();
    detail = preview
      ? await getLocalPreviewDetail(id)
      : await getRentalDetail(id, supabase ? { client: supabase } : undefined);
  } catch {
    // The database could not be read: keep the default title. The page itself shows the outage.
    return { title: "Rental · mdeai" };
  }
  // SAN-1503: a listing that does not exist (or is not public) must answer HTTP 404. This sits OUTSIDE
  // the try/catch on purpose: notFound() works by throwing, and the catch above would swallow it.
  // It is a backstop; the status is decided by there being no `loading.tsx` above this route
  // (see the layout guard in __tests__/page.test.tsx) because Next.js sends 200 once a loading
  // boundary starts streaming: https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes
  if (!detail) notFound();
  return { title: `${detail.title} · ${detail.neighborhood} · mdeai` };
}

/** SAN-1202 · RE-DES-007 — consumer rental detail page `/rentals/[id]`. */
// skipcq: JS-0067 - Next.js App Router page export; not browser global scope
export default async function RentalDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  // Only recognised, validated filters are carried back; anything else in the URL is ignored.
  const backHref = buildRentalsUrl(parseBrowseFilters((await searchParams) ?? {}).filters);
  const preview = (await isLocalPreviewPage()) && id.startsWith("candidate-fincaraiz-");

  let detail;
  try {
    // SAN-1502 PR2: read Details with the caller's own RLS-governed client.
    const supabase = preview ? null : await createClient();
    detail = preview
      ? await getLocalPreviewDetail(id)
      : await getRentalDetail(id, supabase ? { client: supabase } : undefined);
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

  const view = <RentalDetailView detail={detail} backHref={backHref} />;
  // Only a development preview wraps the view (with its banner); a real listing returns it as is.
  if (!preview) return view;
  return (
    <>
      <div data-testid="dev-rental-detail-disclaimer" role="status" className="mx-auto max-w-5xl rounded-lg border border-amber-500 p-4 text-sm">
        Development preview only — this external property and its photos are not verified or published.
        Availability is unknown; real viewing and booking requests are disabled.
      </div>
      {view}
    </>
  );
}
