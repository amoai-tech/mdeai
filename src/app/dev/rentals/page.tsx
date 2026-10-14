import { notFound } from "next/navigation";
import { RentalBrowseView } from "@/components/rentals/rental-browse-view";
import { getLocalPreviewRentals, isLocalRentalPreviewEnabled } from "@/lib/rentals/dev-rental-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local rental preview · MDE", robots: { index: false, follow: false } };

/** Development fixtures use real MDE cards, but NEVER the production publication or viewing workflow. */
export default async function LocalRentalPreviewPage() {
  if (!isLocalRentalPreviewEnabled()) notFound();
  let rentals: Awaited<ReturnType<typeof getLocalPreviewRentals>> = [];
  let error: string | null = null;
  try {
    rentals = await getLocalPreviewRentals();
  } catch {
    error = "Local source fixtures unavailable. Configure MDE_DEV_RENTAL_FIXTURES_DIR.";
  }

  return (
    <main>
      <div role="status" data-testid="dev-rentals-disclaimer" className="mx-auto max-w-7xl rounded-lg border border-amber-500 p-4 text-sm">
        <strong>Development preview only</strong> — external advertisements, unverified availability and
        ownership. Photos come from the private Supabase Storage bucket for development review. These
        properties are not published or requestable; all real viewing and booking actions are disabled.
      </div>
      <RentalBrowseView results={rentals} total={rentals.length} error={error}
        neighborhood={null} beds={null} previewMode />
    </main>
  );
}
