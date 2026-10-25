import { redirect } from "next/navigation";

import { PartnerProfileContent } from "@/components/partners/partner-profile-content";
import { loadPartnerProfile } from "@/lib/partners/partner-profile-load";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My business profile · mdeai",
  description:
    "View and edit your MDE partner business details. Only you and your team can change them.",
};

export const dynamic = "force-dynamic";

const SELECTED_PARTNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep the login return path local, and keep a selected business only when it is a real UUID. */
function loginPath(selectedPartnerId?: string): string {
  if (!selectedPartnerId || !SELECTED_PARTNER.test(selectedPartnerId)) {
    return "/app/partners/profile";
  }
  return `/app/partners/profile?partner=${encodeURIComponent(selectedPartnerId)}`;
}

/**
 * SAN-1579 — the partner business profile inside the SAN-1575 /app shell.
 *
 * This is an adapter, not a second partner system: the same loader, shared
 * content and PATCH route as `/partners/profile`. The shell renders the only
 * `<main>` and header, so this page adds none. `?partner=<uuid>` is a selector;
 * membership in `partner_members` remains the authority.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppPartnerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedPartnerId =
    typeof params.partner === "string" ? params.partner : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(loginPath(selectedPartnerId))}`);

  const profile = await loadPartnerProfile(supabase, user.id, selectedPartnerId);

  return (
    <div data-testid="app-partner-profile">
      <PartnerProfileContent
        profile={profile}
        basePath="/app/partners/profile"
      />
    </div>
  );
}
