import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSearchFastPathRateLimit } from "@/lib/api-ip-rate-limit";
import { remoteImageRules } from "@/lib/images/remote-image-hosts";

const payloadSchema = z.object({ host: z.string().max(255) }).strict();

/** Minimal, bounded telemetry sink for native Rental image errors. No photo URLs or user IDs. */
export async function POST(req: Request): Promise<Response> {
  const limited = checkSearchFastPathRateLimit(req);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > 512) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success || !remoteImageRules().some(({ hostname }) => hostname === parsed.data.host)) {
    return NextResponse.json({ error: "invalid_host" }, { status: 400 });
  }
  // Sampled once per host/minute in the browser; structured server logs make
  // a burst of failures from one provider visible to operators in Vercel.
  console.warn(JSON.stringify({ event: "rentals.gallery.photo_failed", host: parsed.data.host }));
  return new Response(null, { status: 204 });
}
