import { NextResponse, type NextRequest } from "next/server";
import { Memory } from "@mastra/memory";
import { deriveTitleFromStoredMessages, isMeaningfulThreadTitle } from "@/lib/chat/thread-title";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMastraStorage } from "@/mastra/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** How many of a chat's oldest messages are read to find its first user message. */
const FIRST_MESSAGES_LIMIT = 25;

/**
 * Give one saved chat a real title (SAN-1412). The browser sends NO title: it is derived here from
 * the chat's own stored first user message, so a client can never name someone's chat.
 *
 * `mastra_threads` / `mastra_messages` are service-role only, so this uses the server-only service
 * client. That bypasses RLS, so authorization is done here, in order: verified user → thread exists →
 * thread belongs to that user → only then read messages → only then update. Ownership comes from
 * `mastra_threads.resourceId`. Refusals carry no thread content.
 *
 * Safe to call repeatedly: a chat that already has a real title is left alone, and two racing calls
 * derive the same title from the same message.
 */
export async function PATCH(
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
    console.error("[/api/threads/title] service role client unavailable");
    return NextResponse.json({ error: "Titles unavailable" }, { status: 503, headers: NO_STORE });
  }

  const { data: thread, error: threadError } = await service
    .from("mastra_threads")
    .select('id, title, "resourceId"')
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) {
    console.error("[/api/threads/title] thread lookup failed");
    return NextResponse.json({ error: "Titles unavailable" }, { status: 500, headers: NO_STORE });
  }
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  const stored = thread as { title: unknown; resourceId: unknown };
  if (stored.resourceId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  // A real title is never replaced.
  if (isMeaningfulThreadTitle(stored.title)) {
    return NextResponse.json({ updated: false, title: stored.title }, { headers: NO_STORE });
  }

  const { data: rows, error: messagesError } = await service
    .from("mastra_messages")
    .select("id, role, content, createdAt")
    .eq("thread_id", threadId)
    .order("createdAt", { ascending: true })
    .order("id", { ascending: true })
    .limit(FIRST_MESSAGES_LIMIT);
  if (messagesError) {
    console.error("[/api/threads/title] messages lookup failed");
    return NextResponse.json({ error: "Titles unavailable" }, { status: 500, headers: NO_STORE });
  }

  const title = deriveTitleFromStoredMessages(rows ?? []);
  if (title === null) {
    // Nothing useful to name it from: keep the dated fallback rather than inventing a title.
    return NextResponse.json({ updated: false, title: null }, { headers: NO_STORE });
  }

  try {
    // Title only: `updateThread` patches just the fields it is given, so resourceId, metadata and
    // messages are untouched.
    await new Memory({ storage: getMastraStorage() }).updateThread({ id: threadId, title });
  } catch {
    // Storage errors can include private user content. Keep logs categorical.
    console.error("[/api/threads/title] update failed");
    return NextResponse.json({ error: "Titles unavailable" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ updated: true, title }, { headers: NO_STORE });
}
