import { NextResponse } from "next/server";
import { normalizeThreadTitle } from "@/lib/chat/thread-label";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export type NavThread = {
  id: string;
  /** `null` when the chat has no title yet; the sidebar shows a dated fallback (`threadLabel`). */
  title: string | null;
  updatedAt: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ threads: [] });
  }

  const service = createServiceRoleClient();
  if (!service) {
    console.error("[/api/threads] service role client unavailable");
    return NextResponse.json({ error: "Threads service unavailable" }, { status: 503 });
  }

  const { data, error } = await service
    .from("mastra_threads")
    .select('id, title, "updatedAt"')
    .eq("resourceId", user.id)
    .order('"updatedAt"', { ascending: false })
    .limit(20);

  if (error) {
    console.error("[/api/threads]", error.message);
    return NextResponse.json({ error: "Failed to load threads" }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: unknown; title: unknown; updatedAt: unknown }>;
  const threads: NavThread[] = rows.map((row) => ({
    id: String(row.id),
    title: normalizeThreadTitle(row.title),
    updatedAt: String(row.updatedAt),
  }));

  return NextResponse.json({ threads });
}
