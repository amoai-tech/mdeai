import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RestaurantOwnerEditor } from "@/components/partners/restaurant/restaurant-owner-editor";
import { loadPartnerProfile } from "@/lib/partners/partner-profile-load";
import { profileValuesFromSettings } from "@/lib/partners/partner-profile-patch";
import {
  canAccessOwnerRestaurant,
  isAdminUser,
  loadAssignablePartners,
  loadOwnerRestaurant,
  loadRestaurantMenuItems,
  loadRestaurantReservationRequests,
} from "@/lib/restaurants/restaurant-owner-load";
import { listingValuesFromRecord, unsupportedRestaurantFields } from "@/lib/restaurants/restaurant-owner-schema";
import { getServerUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Edit restaurant · mdeai",
  description: "Edit the restaurant listing assigned to your MDE business.",
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Unavailable({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-3xl" data-testid="restaurant-owner-unavailable">
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-base font-semibold">This restaurant is not available for your account</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/app/partners/restaurants"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Back to your restaurants
        </Link>
      </div>
    </div>
  );
}

function RestaurantLoadFailure({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-3xl" data-testid="restaurant-owner-error">
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function RestaurantEditorHeader({ restaurant, partnerName }: {
  restaurant: { name: string; partner_id: string | null };
  partnerName: string | null;
}) {
  return (
    <>
      <Link
        href={`/app/partners/restaurants${restaurant.partner_id ? `?partner=${encodeURIComponent(restaurant.partner_id)}` : ""}`}
        className="text-sm text-muted-foreground underline"
      >
        Your restaurants
      </Link>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        {restaurant.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {partnerName
          ? `Assigned to ${partnerName}. Only that business and the MDE team can change this listing.`
          : "Not assigned to a partner yet. The MDE team can assign it below."}
      </p>
    </>
  );
}

/**
 * SAN-1540 — the restaurant editor inside the Partners workspace.
 *
 * Authorization is decided here from the real membership + the stored
 * `restaurants.partner_id`, and again in the database on every write. `?partner=`
 * is a selector: a value the account does not belong to renders the honest
 * "not available" state instead of opening someone else's listing.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function PartnerRestaurantEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partner?: string | string[] }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const query = await searchParams;
  const selected = typeof query.partner === "string" ? query.partner : undefined;

  const supabase = await createClient();
  const { user } = await getServerUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/app/partners/restaurants/${id}${selected ? `?partner=${encodeURIComponent(selected)}` : ""}`,
      )}`,
    );
  }

  const [isAdmin, profile] = await Promise.all([
    isAdminUser(supabase),
    loadPartnerProfile(supabase, user.id, selected),
  ]);

  if (profile.status === "error") {
    return <RestaurantLoadFailure title="We could not load your business" detail="Refresh to try again." />;
  }

  if (profile.status === "forbidden") {
    return <Unavailable message="That business selection is not part of this account." />;
  }

  const restaurantLookup = await loadOwnerRestaurant(supabase, id);
  if (restaurantLookup.status === "not_found") notFound();
  if (restaurantLookup.status === "error") {
    return <RestaurantLoadFailure title="We could not load this restaurant" detail="This is a temporary problem. Refresh to try again." />;
  }

  const restaurant = restaurantLookup.data;
  const options =
    profile.status === "loaded" || profile.status === "selection_required" ? profile.options : [];
  const authorizedPartnerIds = options.map((option) => option.id);

  // One business selected on the URL must be the one that owns this restaurant.
  if (
    selected &&
    restaurant.partner_id &&
    selected !== restaurant.partner_id &&
    !isAdmin
  ) {
    return <Unavailable message="This restaurant belongs to a different business." />;
  }

  if (
    !canAccessOwnerRestaurant({
      partnerId: restaurant.partner_id,
      authorizedPartnerIds,
      isAdmin,
    })
  ) {
    return (
      <Unavailable message="Only members of the assigned business can edit this listing." />
    );
  }

  // Multiple memberships and no selection: send the operator to the owning business.
  if (profile.status === "selection_required" && restaurant.partner_id) {
    redirect(
      `/app/partners/restaurants/${id}?partner=${encodeURIComponent(restaurant.partner_id)}`,
    );
  }

  const relatedPartner =
    profile.status === "loaded" && restaurant.partner_id === profile.partner.id
      ? profile.partner
      : options.find((option) => option.id === restaurant.partner_id) ?? null;
  const partnerName = relatedPartner
    ? profileValuesFromSettings(relatedPartner.settings).businessName || relatedPartner.type
    : null;

  const [menu, requests] = await Promise.all([
    loadRestaurantMenuItems(supabase, restaurant.id),
    loadRestaurantReservationRequests(supabase, restaurant.id),
  ]);
  const partners = isAdmin ? await loadAssignablePartners(supabase) : [];

  return (
    <div className="mx-auto max-w-3xl" data-testid="restaurant-owner-editor">
      <RestaurantEditorHeader restaurant={restaurant} partnerName={partnerName} />

      <div className="mt-8">
        <RestaurantOwnerEditor
          restaurantId={restaurant.id}
          partnerId={restaurant.partner_id}
          partnerName={partnerName}
          initial={listingValuesFromRecord(restaurant)}
          unsupportedFields={unsupportedRestaurantFields(restaurant)}
          updatedAt={restaurant.updated_at}
          isActive={restaurant.is_active}
          isAdmin={isAdmin}
          partners={partners}
          assignedPartnerId={restaurant.partner_id}
          menuItems={menu.status === "loaded" ? menu.data : []}
          requests={requests.status === "loaded" ? requests.data : []}
          requestsStatus={requests.status === "loaded" ? "loaded" : "error"}
        />
      </div>
    </div>
  );
}
