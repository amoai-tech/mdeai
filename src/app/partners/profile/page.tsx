import Link from "next/link";
import { redirect } from "next/navigation";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { PartnerProfileForm } from "@/components/partners/partner-profile-form";
import { loadPartnerProfile } from "@/lib/partners/partner-profile-load";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My business profile · mdeai",
  description:
    "View and edit your MDE partner business details. Only you and your team can change them.",
};

function readSetting(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function ProfileLoadError({ message }: { message: string }) {
  return (
    <MarketingPageShell accent="gold" mainTestId="partner-profile">
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <div
            data-testid="partner-profile-load-error"
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6"
          >
            <p className="text-base font-semibold text-foreground">
              Your profile is temporarily unavailable
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Link
              href="/partners/profile"
              className="mt-4 inline-flex text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Try again
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}

// skipcq: JS-0067 - Next.js App Router page export; not browser global scope
export default async function PartnerProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/partners/profile");

  const profile = await loadPartnerProfile(supabase, user.id);

  // A failed query is not the same as "no membership". Never send a partner
  // back to signup because Supabase had a transient failure.
  if (profile.status === "error") {
    return <ProfileLoadError message="We could not load your partner profile. Try again." />;
  }

  const partner = profile.status === "loaded" ? profile.partner : null;

  const settings = (partner?.settings ?? {}) as Record<string, unknown>;

  return (
    <MarketingPageShell accent="gold" mainTestId="partner-profile">
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
            My business profile
          </p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {readSetting(settings, "businessName") || "Your business profile"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These details appear in your MDE partner workspace. Only you and your
            partner team can change them.
          </p>

          {partner ? (
            <div className="mt-8">
              <PartnerProfileForm
                partnerType={partner.type}
                partnerStatus={partner.status}
                initial={{
                  businessName: readSetting(settings, "businessName"),
                  category: readSetting(settings, "category"),
                  neighborhood: readSetting(settings, "neighborhood"),
                  description: readSetting(settings, "description"),
                  website: readSetting(settings, "website"),
                }}
              />
            </div>
          ) : (
            <div
              data-testid="partner-profile-missing"
              className="mt-8 rounded-2xl border border-border bg-background-elevated p-6"
            >
              <p className="text-base font-semibold text-foreground">
                No partner profile for this account yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with partner signup, then come back here to edit your
                business details.
              </p>
              <Link
                href="/partners/signup"
                className="mt-4 inline-flex text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                Create your partner profile
              </Link>
            </div>
          )}
        </div>
      </section>
    </MarketingPageShell>
  );
}
