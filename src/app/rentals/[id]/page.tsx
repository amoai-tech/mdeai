import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRentalDetail } from "@/lib/rentals/get-rental-detail";
import {
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from "@/mastra/lib/rental-search-unavailable";
import { RentalDetailView } from "@/components/rentals/rental-detail-view";
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
}

// skipcq: JS-0067 - Next.js App Router metadata export; not browser global scope
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const preview = (await isLocalPreviewPage()) && id.startsWith("candidate-fincaraiz-");
    const detail = preview ? await getLocalPreviewDetail(id) : await getRentalDetail(id);
    if (detail) return { title: `${detail.title} · ${detail.neighborhood} · mdeai` };
  } catch {
    /* fall through to default */
  }
  return { title: "Rental · mdeai" };
}

/** SAN-1202 · RE-DES-007 — consumer rental detail page `/rentals/[id]`. */
// skipcq: JS-0067 - Next.js App Router page export; not browser global scope
export default async function RentalDetailPage({ params }: Props) {
  const { id } = await params;
  const preview = (await isLocalPreviewPage()) && id.startsWith("candidate-fincaraiz-");

  let detail;
  try {
    detail = preview ? await getLocalPreviewDetail(id) : await getRentalDetail(id);
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
          href="/rentals"
          className="text-sm text-primary hover:underline"
          data-testid="rental-detail-error-back"
        >
          Back to results
        </Link>
      </main>
    );
  }

  if (!detail) notFound();

  return (
    <>
      {preview ? (
        <div data-testid="dev-rental-detail-disclaimer" role="status" className="mx-auto max-w-5xl rounded-lg border border-amber-500 p-4 text-sm">
          Development preview only — this external property and its photos are not verified or published.
          Availability is unknown; real viewing and booking requests are disabled.
        </div>
      ) : null}
      <RentalDetailView detail={detail} />
    </>
  );
}
