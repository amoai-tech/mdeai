import { redirect } from "next/navigation";
import { HostEventShell } from "@/components/host/host-event-shell";
import { getServerUser } from "@/lib/auth/session";

export const metadata = {
  title: "Create event · mdeai",
};

/**
 * SAN-1577 — reuses the existing wizard body and hostEventAgent. `embedded`
 * omits the legacy header/nav because the /app AppShell already owns them.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventNewPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/events/new");

  return (
    <HostEventShell
      userEmail={user.email}
      embedded
      backHref="/app/events"
    />
  );
}
