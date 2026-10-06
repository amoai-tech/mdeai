import { NextRequest, NextResponse } from "next/server";
import {
  searchNewProjects,
  searchNewProjectsInputSchema,
} from "@/mastra/tools/search-new-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SAN-1380 — server search used by the concierge fast path and the deterministic journey test.
 * It runs the same hardened query as the Mastra tool: hard filters first, published rows only
 * (via RLS), grounded cards with provenance and explicit unknowns. It never writes.
 *
 * The body is a trust boundary, so it is validated against the tool's own schema. The route then
 * calls the shared `searchNewProjects` application function — never Mastra's internal `execute`
 * callback. Errors carry a stable code so a client can tell a bad request (400, not retryable)
 * from an upstream outage (503, retryable); the underlying message stays in the server log.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = searchNewProjectsInputSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid search parameters.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await searchNewProjects(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/new-projects/search]", (error as Error).message);
    return NextResponse.json(
      {
        error: {
          code: "SEARCH_UNAVAILABLE",
          message: "Search is temporarily unavailable. Please try again.",
        },
      },
      { status: 503 },
    );
  }
}
