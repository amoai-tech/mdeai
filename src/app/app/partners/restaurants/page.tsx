import Link from "next/link";
import { redirect } from "next/navigation";

import { PartnerBusinessSwitcher } from "@/components/partners/partner-business-switcher";
import { RestaurantCreateForm } from "@/components/partners/restaurant/restaurant-create-form";
import { loadPartnerProfile } from "@/lib/partners/partner-profile-load";
import { profileValuesFromSettings } from "@/lib/partners/partner-profile-patch";
import {
  isAdminUser,
  loadPartnerRestaurants,
  loadUnassignedRestaurants,
  type OwnerRestaurantListItem,
} from "@/lib/restaurants/restaurant-owner-load";
import { getServerUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Manage restaurants · mdeai",
  description: "Edit the restaurant listings assigned to your MDE business.",
};

export const dynamic = "force-dynamic";

const SELECTED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loginPath(selected?: string): string {
  return selected && SELECTED.test(selected)
    ? `/app/partners/restaurants?partner=${encodeURIComponent(selected)}`
    : "/app/partners/restaurants";
}

function RestaurantRows({
  restaurants,
  partnerId,
  emptyMessage,
}: {
  restaurants: OwnerRestaurantListItem[];
  partnerId?: string;
  emptyMessage: string;
}) {
  if (restaurants.length === 0) {
    return (
      <p
        data-testid="partner-restaurants-empty"
        className="rounded-2xl border border-dashed border-border bg-background-elevated p-6 text-sm text-muted-foreground"
      >
        {emptyMessage}
      </p>
    );
  }
  return (
    <ul className="grid gap-3" data-testid="partner-restaurants-list">
      {restaurants.map((restaurant) => (
        <li key={restaurant.id}>
          <Link
            href={`/app/partners/restaurants/${restaurant.id}${
              partnerId ? `?partner=${encodeURIComponent(partnerId)}` : ""
            }`}
            className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background px-5 py-4 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="block text-base font-semibold text-foreground">
                {restaurant.name}
              </span>
              <span className="block text-sm text-muted-foreground">
                {[restaurant.neighborhood, restaurant.city, restaurant.address]
                  .filter(Boolean)
                  .join(" · ") || "Address not set"}
              </span>
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {restaurant.is_active ? "Active listing" : "Inactive listing"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RestaurantsLoadFailure({ forbidden }: { forbidden: boolean }) {
  return (
    <div className="mx-auto max-w-3xl" data-testid="partner-restaurants">
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-base font-semibold">Your restaurants are temporarily unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {forbidden
            ? "This business is not available for this account."
            : "We could not load your business. Try again."}
        </p>
        <Link
          href="/app/partners/restaurants"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}

function RestaurantsSignupInvitation() {
  return (
    <div className="mx-auto max-w-3xl" data-testid="partner-restaurants">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">My restaurants</p>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight">Manage restaurants</h1>
      <div className="mt-8 rounded-2xl border border-border bg-background-elevated p-6">
        <p className="text-base font-semibold">No partner profile for this account yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your partner profile first, then link or add your restaurant listings here.
        </p>
        <Link
          href="/partners/signup"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Create your partner profile
        </Link>
      </div>
    </div>
  );
}

function RestaurantsBusinessSelection({ options }: {
  options: React.ComponentProps<typeof PartnerBusinessSwitcher>["options"];
}) {
  return (
    <div className="mx-auto max-w-3xl" data-testid="partner-restaurants">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">My restaurants</p>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight">Manage restaurants</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Choose a business above to edit its restaurant listings.
      </p>
      <div className="mt-6">
        <PartnerBusinessSwitcher
          basePath="/app/partners/restaurants"
          options={options}
        />
      </div>
    </div>
  );
}

/**
 * SAN-1540 — the authorized restaurant list inside the Partners workspace.
 *
 * Membership is resolved from `partner_members`, never from `?partner=`, and the
 * list is filtered by the stored `restaurants.partner_id`. A signed-in account
 * with no partner profile sees the honest partner-signup entry point (no
 * approval, ownership paperwork or publication gate in Phase A).
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function PartnerRestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = typeof params.partner === "string" ? params.partner : undefined;

  const supabase = await createClient();
  const { user } = await getServerUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(loginPath(selected))}`);

  const profile = await loadPartnerProfile(supabase, user.id, selected);

  if (profile.status === "error" || profile.status === "forbidden") {
    return <RestaurantsLoadFailure forbidden={profile.status === "forbidden"} />;
  }
  if (profile.status === "missing") return <RestaurantsSignupInvitation />;
  if (profile.status === "selection_required") {
    return <RestaurantsBusinessSelection options={profile.options} />;
  }

  const partner = profile.partner;
  const businessName = profileValuesFromSettings(partner.settings).businessName || partner.type;
  const [restaurants, isAdmin] = await Promise.all([
    loadPartnerRestaurants(supabase, partner.id),
    isAdminUser(supabase),
  ]);
  const unassigned = isAdmin ? await loadUnassignedRestaurants(supabase) : null;

  return (
    <div className="mx-auto max-w-3xl" data-testid="partner-restaurants">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">My restaurants</p>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        Manage restaurants
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These listings are assigned to {businessName}. Only members of this business can edit
        them, and every save is checked on the server.
      </p>

      <div className="mt-6">
        <PartnerBusinessSwitcher
          basePath="/app/partners/restaurants"
          options={profile.options}
          selectedId={partner.id}
        />
      </div>

      <section aria-labelledby="assigned-restaurants" className="mt-8">
        <h2 id="assigned-restaurants" className="text-lg font-semibold">
          Assigned to {businessName}
        </h2>
        <div className="mt-3">
          {restaurants.status === "error" ? (
            <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              We could not load these restaurants. Refresh to try again.
            </p>
          ) : (
            <RestaurantRows
              restaurants={restaurants.data}
              partnerId={partner.id}
              emptyMessage={`No restaurants are linked to ${businessName} yet. Add your first listing below — development listings need no approval or ownership paperwork.`}
            />
          )}
        </div>

        <div className="mt-6">
          <RestaurantCreateForm partnerId={partner.id} businessName={businessName} />
        </div>
      </section>

      {isAdmin && unassigned ? (
        <section aria-labelledby="unassigned-restaurants" className="mt-10 border-t border-border pt-6">
          <h2 id="unassigned-restaurants" className="text-lg font-semibold">
            MDE Team · unassigned restaurants
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign a record to a partner to give that business edit access. No paperwork is
            required during development.
          </p>
          <div className="mt-3">
            {unassigned.status === "error" ? (
              <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
                We could not load unassigned restaurants.
              </p>
            ) : (
              <RestaurantRows
                restaurants={unassigned.data}
                emptyMessage="Every restaurant currently has a partner assignment."
              />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
