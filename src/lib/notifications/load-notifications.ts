import {
  eventIdFromMetadata,
  type NotificationItem,
} from "@/lib/notifications/notification-item";
import { PERSONAL_LOAD_ERROR, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** One page of updates — newest first, and only the columns the renderer uses. */
const NOTIFICATION_COLUMNS = "id, type, title, body, metadata, created_at";
const NOTIFICATION_LIMIT = 50;

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: unknown;
  created_at: string;
};

/**
 * The signed-in person's own notifications (SAN-1620 S5). The `user_id` filter is
 * the same predicate RLS enforces, so this never widens past the caller's rows.
 * The anon-key server client is used on purpose: no service role in `src`.
 */
export async function loadUserNotifications(
  userId: string,
): Promise<Result<NotificationItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_LIMIT);

  if (error) {
    console.error("[notifications] loadUserNotifications:", error.message);
    return { status: "error", message: PERSONAL_LOAD_ERROR };
  }

  const rows = (data ?? []) as NotificationRow[];

  return {
    status: "ok",
    value: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      eventId: eventIdFromMetadata(row.metadata),
    })),
  };
}
