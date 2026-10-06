import { NextRequest, NextResponse } from "next/server";
import { searchNewProjectsTool } from "@/mastra/tools/search-new-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SAN-1380 — server search used by the concierge fast path and the deterministic journey test.
 * It runs the same hardened query as the Mastra tool: hard filters first, published rows only
 * (via RLS), grounded cards with provenance and explicit unknowns. It never writes.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const execute = searchNewProjectsTool.execute as
      | ((input: unknown, context: unknown) => Promise<unknown>)
      | undefined;
    const result = await execute?.(body, {});
    return NextResponse.json(result ?? { results: [], totalPublished: 0, returned: 0 });
  } catch (error) {
    console.error("[/api/new-projects/search]", (error as Error).message);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
