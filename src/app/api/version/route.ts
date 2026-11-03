import { NextResponse } from "next/server";

/**
 * Which commit is this deployment actually running?
 *
 * A page returning 200 says nothing about WHICH build is answering. On 2026-10-18 the merge
 * deployment was READY while www.mdeai.co still served a build from 2026-09-19, and only a
 * content check caught it. This endpoint makes that check one comparison instead of a guess
 * about whether a particular button exists.
 *
 * The SHA comes from Vercel's trusted deployment environment, never from a hardcoded value,
 * and never from a request header or query parameter.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  const environment = process.env.VERCEL_ENV?.trim() || "unknown";

  // Fail loudly rather than reporting a plausible-looking empty commit: a parity check that
  // silently compares against "" would pass forever.
  if (sha === "") {
    return NextResponse.json(
      { error: "VERCEL_GIT_COMMIT_SHA is not set for this deployment" },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ sha, environment }, { headers: NO_STORE });
}