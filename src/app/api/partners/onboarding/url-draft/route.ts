import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimitDurable } from "@/lib/distributed-rate-limit";
import { normalizeBusinessUrl } from "@/lib/onboarding/business-url";
import {
  BusinessUrlExtractionError,
  extractBusinessDraft,
} from "@/lib/onboarding/extract-business-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().trim().min(1).max(500) });

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

/**
 * SAN-1193 — signed-in partner asks the guarded website reader to read a public
 * business website. The response is a proposal for review, never a save.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("Enter a website URL", 400);

  const url = normalizeBusinessUrl(parsed.data.url);
  if (!url) return fail("Enter a public website URL (http or https)", 400);

  const limit = await checkRateLimitDurable("url-draft:user:" + user.id, 10, 3600);
  if (!limit.storeAvailable) return fail("Website analysis temporarily unavailable", 503);
  if (!limit.allowed) return fail("Too many website checks. Please try later.", 429);

  try {
    const draft = await extractBusinessDraft(url);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    if (error instanceof BusinessUrlExtractionError) {
      console.error("[/api/partners/onboarding/url-draft]", error.code);
      return fail(
        error.code === "invalid_output"
          ? "Could not find usable business details on that page"
          : "Could not read that website. Check the URL and try again.",
        error.code === "invalid_output" ? 422 : 502,
      );
    }
    console.error("[/api/partners/onboarding/url-draft] unexpected failure");
    return fail("Could not read that website. Check the URL and try again.", 502);
  }
}
