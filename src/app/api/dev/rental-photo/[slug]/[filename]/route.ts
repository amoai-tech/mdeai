import {
  getLocalPreviewPhoto,
  isLocalPreviewRequest,
  isLocalRentalPreviewEnabled,
} from "@/lib/rentals/dev-rental-preview";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; filename: string }> },
) {
  // Dev flag AND a direct loopback request (local Host, no proxy/tunnel headers).
  // A tunnel or a 0.0.0.0-bound server is refused, so research photos never leave
  // the developer machine.
  if (
    !isLocalRentalPreviewEnabled() ||
    !isLocalPreviewRequest(request.headers.get("host"), request.headers)
  ) {
    return new Response(null, { status: 404 });
  }
  const { slug, filename } = await params;
  // Reads the private bucket with the server-only service client and streams the
  // bytes; the browser never sees the credential, the storage path, or a URL.
  const photo = await getLocalPreviewPhoto(slug, filename);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo.bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
