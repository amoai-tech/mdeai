import { redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { NotificationList } from "@/components/notifications/notification-list";
import { getServerUser } from "@/lib/auth/session";
import { loadUserNotifications } from "@/lib/notifications/load-notifications";

export const metadata = {
  title: "Notifications · mdeai",
};

/**
 * SAN-1620 S5 — the reader for the notifications the database already writes.
 * Read-only on purpose: nothing in the app marks a row as read yet, so this page
 * never pretends to.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function PersonalNotificationsPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me/notifications");

  const result = await loadUserNotifications(user.id);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Notifications
        </h1>
        <p className="text-sm text-muted-foreground">
          Updates about events you follow. An update here does not reserve or issue
          a ticket.
        </p>
      </header>

      {result.status === "error" ? (
        <AccountLoadError
          message={result.message}
          retryHref="/app/me/notifications"
          title="Your notifications are temporarily unavailable"
        />
      ) : (
        <NotificationList notifications={result.value} />
      )}
    </section>
  );
}
