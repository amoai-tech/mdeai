import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  SAVED_THREAD_HISTORY_LIMIT,
  mapSavedThreadHistory,
} from "@/lib/chat/saved-thread-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Previous messages of one saved chat (SAN-1389).
 *
 * `mastra_threads` / `mastra_messages` are service-role only, so the read uses
 * the server-only service client. That bypasses RLS, so authorization is done
 * here, in order: verified user → thread exists → thread belongs to that user →
 * only then read messages. Ownership comes from `mastra_threads.resourceId`,
 * never from the message rows. Refusals carry no thread content.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceRoleClient();
  if (!service) {
    console.error("[/api/threads/messages] service role client unavailable");
    return NextResponse.json({ error: "History unavailable" }, { status: 503, headers: NO_STORE });
  }

  const { data: thread, error: threadError } = await service
    .from("mastra_threads")
    .select('id, "resourceId"')
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) {
    console.error("[/api/threads/messages] thread lookup", threadError.message);
    return NextResponse.json({ error: "History unavailable" }, { status: 500, headers: NO_STORE });
  }
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  if ((thread as { resourceId: unknown }).resourceId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const { data: rows, error } = await service
    .from("mastra_messages")
    .select("id, role, content, createdAt")
    .eq("thread_id", threadId)
    .order("createdAt", { ascending: false })
    .order("id", { ascending: false })
    .limit(SAVED_THREAD_HISTORY_LIMIT);
  if (error) {
    console.error("[/api/threads/messages] messages", error.message);
    return NextResponse.json({ error: "History unavailable" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    { threadId, messages: mapSavedThreadHistory(rows ?? []) },
    { headers: NO_STORE },
  );
}
