import Link from "next/link";

import { PartnerProfileForm } from "@/components/partners/partner-profile-form";
import { PartnerBusinessSwitcher } from "@/components/partners/partner-business-switcher";
import { PartnerWorkspaceChat } from "@/components/partners/partner-workspace-chat";
import type { PartnerProfileLoad } from "@/lib/partners/partner-profile-load";
import { profileValuesFromSettings } from "@/lib/partners/partner-profile-patch";

type PartnerProfileContentProps = {
  /** Result of the single server loader; all five states are rendered honestly. */
  profile: PartnerProfileLoad;
  /** Verified server session user ID; never inferred from business selection. */
  userId: string;
  /**
   * Route that owns this screen. Business-selection links stay on the same
   * surface, so the legacy page and the /app page never bounce between shells.
   */
  basePath: string;
};

function ProfileLoadError({
  message,
  basePath,
}: {
  message: string;
  basePath: string;
}) {
  return (
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
        href={basePath}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        Try again
      </Link>
    </div>
  );
}

/**
 * SAN-1579 — one shared body for the partner business profile.
 *
 * It owns no chrome: the legacy route wraps it in `MarketingPageShell`, while
 * `/app/partners/profile` renders it inside the existing `AppShell`. Keeping
 * the queries, authorization and save path here means both URLs behave
 * identically and only one `<main>` landmark ever renders.
 */
export function PartnerProfileContent({
  profile,
  basePath,
  userId,
}: PartnerProfileContentProps) {
  // A failed query is not the same as "no membership". Never send a partner
  // back to signup because Supabase had a transient failure.
  if (profile.status === "error" || profile.status === "forbidden") {
    return (
      <ProfileLoadError
        basePath={basePath}
        message={
          profile.status === "forbidden"
            ? "This business is not available for this account."
            : "We could not load your partner profile. Try again."
        }
      />
    );
  }

  const partner = profile.status === "loaded" ? profile.partner : null;
  const options = profile.status === "missing" ? [] : profile.options;
  const settings = partner?.settings ?? {};
  const values = profileValuesFromSettings(settings);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
        My business profile
      </p>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        {values.businessName || "Your business profile"}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These details appear in your MDE partner workspace. Only you and your
        partner team can change them.
      </p>

      {options.length > 1 ? (
        <div className="mt-6">
          <PartnerBusinessSwitcher
            basePath={basePath}
            options={options}
            selectedId={partner?.id}
          />
        </div>
      ) : null}

      {profile.status === "selection_required" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Choose a business above to edit its profile.
        </p>
      ) : partner ? (
        <div className="mt-8">
          <Link
            href={`/app/partners/restaurants?partner=${encodeURIComponent(partner.id)}`}
            data-testid="partner-manage-restaurants"
            className="mb-6 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background-elevated px-5 py-3 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Manage Restaurants
              </span>
              <span className="block text-sm text-muted-foreground">
                Edit your assigned restaurant listings, menu and reservation requests.
              </span>
            </span>
            <span aria-hidden className="text-sm font-semibold text-accent">
              Open →
            </span>
          </Link>
          <PartnerProfileForm
            key={partner.id}
            partnerId={partner.id}
            partnerType={partner.type}
            partnerStatus={partner.status}
            initial={values}
          />
          <section
            aria-label="Partner assistant"
            data-testid="partner-assistant"
            className="mt-10 flex h-[60vh] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm sm:h-[34rem]"
          >
            <PartnerWorkspaceChat
              key={userId + ":" + partner.id}
              userId={userId}
              partnerId={partner.id}
              businessName={values.businessName || null}
              partnerType={partner.type}
            />
          </section>
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
            Start with partner signup, then come back here to edit your business
            details.
          </p>
          <Link
            href="/partners/signup"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Create your partner profile
          </Link>
        </div>
      )}
    </div>
  );
}
