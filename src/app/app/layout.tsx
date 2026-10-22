import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { resolveWorkspaceContexts } from "@/lib/app/resolve-workspace-contexts";

export const metadata = {
  title: "Your account · mdeai",
};

export const dynamic = "force-dynamic";

/**
 * SAN-1575 — one authenticated account shell for /app.
 *
 * Middleware already redirects a guest with the exact `?next=`, so the redirect
 * here is the defence-in-depth branch (for example when proxy matchers change).
 * The resolver is request-cached; the page reuses the same resolution.
 */
// skipcq: JS-0067 - Next.js App Router layout export
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resolution = await resolveWorkspaceContexts();

  if (resolution.status === "unauthenticated") {
    redirect("/login?next=/app");
  }

  return <AppShell resolution={resolution}>{children}</AppShell>;
}
