import { redirect } from "next/navigation";
import { MeNav } from "@/components/app/me-nav";
import { getServerUser } from "@/lib/auth/session";

/**
 * SAN-1576 — Personal lives inside the shared /app shell. The proxy already
 * redirects a guest with `next=/app/me`; this guard keeps the direct server
 * render honest too.
 */
// skipcq: JS-0067 - Next.js App Router layout export
export default async function PersonalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me");

  return (
    <div data-testid="personal-workspace">
      <MeNav />
      {children}
    </div>
  );
}
