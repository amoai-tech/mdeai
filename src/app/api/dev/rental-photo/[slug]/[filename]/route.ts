import { getLocalPreviewPhoto, isLocalRentalPreviewEnabled } from "@/lib/rentals/dev-rental-preview";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; filename: string }> },
) {
  if (!isLocalRentalPreviewEnabled()) return new Response(null, { status: 404 });
  const { slug, filename } = await params;
  const bytes = await getLocalPreviewPhoto(slug, filename);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
