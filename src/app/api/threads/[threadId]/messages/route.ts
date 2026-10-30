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
 * `mastra_threads` / `mastra_messages` are service-role only, so both directions go through one
 * gate here: verified user → thread (created for this user when it does not exist yet, which is the
 * first-turn fast-path case) → ownership from `mastra_threads.resourceId`, never from a message row.
 * Refusals never carry thread content.
 */
type ServiceClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;

async function requireUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE }) };
  }
  return { userId: user.id };
}

function serviceOrResponse(): { service: ServiceClient } | { response: NextResponse } {
  const service = createServiceRoleClient();
  if (!service) {
    console.error("[/api/threads/messages] service role client unavailable");
    return { response: NextResponse.json({ error: "History unavailable" }, { status: 503, headers: NO_STORE }) };
  }
  return { service };
}

async function readThread(
  service: ServiceClient,
  threadId: string,
): Promise<{ thread: { id: string; resourceId: unknown } | null; error: string | null }> {
  const { data, error } = await service
    .from("mastra_threads")
    .select('id, "resourceId"')
    .eq("id", threadId)
    .maybeSingle();
  if (error) return { thread: null, error: error.message };
  return { thread: (data as { id: string; resourceId: unknown } | null) ?? null, error: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const svc = serviceOrResponse();
  if ("response" in svc) return svc.response;

  const { thread, error: threadError } = await readThread(svc.service, threadId);
  if (threadError) {
    console.error("[/api/threads/messages] thread lookup", threadError);
    return NextResponse.json({ error: "History unavailable" }, { status: 500, headers: NO_STORE });
  }
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  if (thread.resourceId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const { data: rows, error } = await svc.service
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

/** Mastra stores message parts in this shape; the history reader parses it. */
function mastraTextContent(text: string): string {
  return JSON.stringify({ format: 2, parts: [{ type: "text", text }] });
}

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const MAX_MESSAGES_PER_SAVE = 4;
const MAX_CONTENT_LENGTH = 32_000;

type SaveRow = { id: string; role: "user" | "assistant"; content: string };

function parseSaveBody(body: unknown): { rows: SaveRow[] } | { error: string } {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "messages must be a non-empty array" };
  }
  if (messages.length > MAX_MESSAGES_PER_SAVE) {
    return { error: `at most ${MAX_MESSAGES_PER_SAVE} messages per save` };
  }
  const rows: SaveRow[] = [];
  for (const raw of messages) {
    const m = raw as { id?: unknown; role?: unknown; content?: unknown };
    if (typeof m.id !== "string" || !MESSAGE_ID_PATTERN.test(m.id)) return { error: "invalid message id" };
    if (m.role !== "user" && m.role !== "assistant") return { error: "invalid message role" };
    if (typeof m.content !== "string") return { error: "invalid message content" };
    // Reject blank text, but store exactly what the person saw: trimming here silently rewrote
    // their message, and the reopened conversation showed different text than the live one.
    if (m.content.trim().length === 0) return { error: "empty message content" };
    if (m.content.length > MAX_CONTENT_LENGTH) return { error: "message content too long" };
    rows.push({ id: m.id, role: m.role, content: m.content });
  }
  if (new Set(rows.map((r) => r.id)).size !== rows.length) return { error: "duplicate message id" };
  return { rows };
}

/**
 * SAN-1531 — durable save for answers that never ran through the agent.
 *
 * The discovery fast paths (restaurants, rentals, events, venues) answer from a direct search API
 * and show the exchange through `EventLocalChatProvider`, which only calls CopilotKit
 * `agent.addMessages()`. That mutates the browser session; it never writes to Mastra storage, so the
 * answer was gone after a refresh even though the thread existed. This writes the same exchange into
 * the tables the history reader already reads, in Mastra's own message format.
 *
 * Idempotent by message id: a replayed save (retry, double effect, reopening the conversation)
 * inserts nothing the second time.
 */
/**
 * Persist one exchange, in the order the data needs: resolve id conflicts, make sure the thread
 * exists and belongs to this user, write the rows, then move the thread up in the list.
 * Returns the number of rows actually inserted.
 */
async function persistExchange(
  service: ServiceClient,
  args: { threadId: string; userId: string; rows: SaveRow[] },
): Promise<{ saved: number; createdThread: boolean } | { error: string }> {
  const { threadId, userId, rows: incoming } = args;
  const requestedIds = incoming.map((row) => row.id);

  // Message ids are client-generated, so the same id can arrive from another thread. Never let
  // that collide into a silent no-op: the reader would lose one of the two answers.
  const { data: existingById, error: existingError } = await service
    .from("mastra_messages")
    .select("id, thread_id")
    .in("id", requestedIds);
  if (existingError) {
    console.error("[/api/threads/messages] id lookup", existingError.message);
    return { error: "Could not save messages" };
  }
  const foreignIds = new Set(
    ((existingById ?? []) as Array<{ id: string; thread_id: string }>)
      .filter((row) => row.thread_id !== threadId)
      .map((row) => row.id),
  );

  const { thread, error: threadError } = await readThread(service, threadId);
  if (threadError) {
    console.error("[/api/threads/messages] thread lookup", threadError);
    return { error: "History unavailable" };
  }
  if (thread && thread.resourceId !== userId) return { error: "Forbidden" };

  let createdThread = false;
  if (!thread) {
    const now = new Date().toISOString();
    const { error: createError } = await service.from("mastra_threads").insert({
      id: threadId,
      resourceId: userId,
      title: "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      createdAtZ: now,
      updatedAtZ: now,
    });
    if (createError) {
      if (!/duplicate key/i.test(createError.message)) {
        console.error("[/api/threads/messages] thread create", createError.message);
        return { error: "Could not save messages" };
      }
      // Lost a concurrent first-turn race. The winner may be someone else, so re-read and
      // re-check ownership instead of writing this user's messages into their thread.
      const reread = await readThread(service, threadId);
      if (reread.error) return { error: "History unavailable" };
      if (!reread.thread || reread.thread.resourceId !== userId) return { error: "Forbidden" };
    } else {
      createdThread = true;
    }
  }

  // One shared timestamp let the reader fall back to id order, which can put the assistant first.
  // A millisecond per message preserves the order the person actually saw.
  const base = Date.now();
  const rows = incoming.map((row, index) => {
    const at = new Date(base + index).toISOString();
    return {
      id: foreignIds.has(row.id) ? `${row.id}-${threadId.slice(0, 8)}` : row.id,
      thread_id: threadId,
      resourceId: userId,
      role: row.role,
      type: "text",
      content: mastraTextContent(row.content),
      createdAt: at,
      createdAtZ: at,
    };
  });

  const { data: inserted, error } = await service
    .from("mastra_messages")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[/api/threads/messages] save", error.message);
    // Do not leave a brand-new empty conversation behind for a save that never landed — but only
    // remove it when it is still empty: a concurrent successful save must not lose its messages.
    if (createdThread) {
      const { count } = await service
        .from("mastra_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId);
      if (!count) {
        await service.from("mastra_threads").delete().eq("id", threadId).eq("resourceId", userId);
      }
    }
    return { error: "Could not save messages" };
  }

  // `/api/threads` lists by `updatedAt`, so a conversation with new activity has to move up.
  const stamp = new Date().toISOString();
  const { error: touchError } = await service
    .from("mastra_threads")
    .update({ updatedAt: stamp, updatedAtZ: stamp })
    .eq("id", threadId)
    .eq("resourceId", userId);
  if (touchError) {
    // The messages are saved; the list order is cosmetic. Report the save honestly.
    console.warn("[/api/threads/messages] thread touch", touchError.message);
  }

  return { saved: (inserted ?? []).length, createdThread };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  // Authenticate before touching the payload: an anonymous caller must not be able to tell a
  // malformed thread id or body from a well-formed one (400 vs 401), and must never learn the
  // validation rules. `GET` has always been ordered this way; `POST` now matches it.
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  if (!THREAD_ID_PATTERN.test(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = parseSaveBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  const svc = serviceOrResponse();
  if ("response" in svc) return svc.response;

  const result = await persistExchange(svc.service, {
    threadId,
    userId: auth.userId,
    rows: parsed.rows,
  });
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : result.error === "History unavailable" ? 500 : 500;
    return NextResponse.json({ error: result.error }, { status, headers: NO_STORE });
  }

  return NextResponse.json(
    { threadId, saved: result.saved, requested: parsed.rows.length, createdThread: result.createdThread },
    { headers: NO_STORE },
  );
}
