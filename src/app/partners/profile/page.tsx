import { redirect } from "next/navigation";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { PartnerProfileContent } from "@/components/partners/partner-profile-content";
import { loadPartnerProfile } from "@/lib/partners/partner-profile-load";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My business profile · mdeai",
  description:
    "View and edit your MDE partner business details. Only you and your team can change them.",
};

// skipcq: JS-0067 - Next.js App Router page export; not browser global scope
export default async function PartnerProfilePage({
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
  if (!user) redirect("/login?next=/partners/profile");

  const profile = await loadPartnerProfile(supabase, user.id, selectedPartnerId);

  // SAN-1579 — the legacy URL keeps its marketing chrome and its exact behavior;
  // its body is the same shared component /app/partners/profile uses.
  return (
    <MarketingPageShell accent="gold" mainTestId="partner-profile">
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16">
        <PartnerProfileContent
          userId={user.id}
          profile={profile}
          basePath="/partners/profile"
        />
      </section>
    </MarketingPageShell>
  );
}
