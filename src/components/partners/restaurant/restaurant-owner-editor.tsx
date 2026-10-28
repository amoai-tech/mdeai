"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RestaurantAdminAssignment } from "@/components/partners/restaurant/restaurant-admin-assignment";
import { RestaurantHoursEditor } from "@/components/partners/restaurant/restaurant-hours-editor";
import { RestaurantMenuEditor } from "@/components/partners/restaurant/restaurant-menu-editor";
import { RestaurantPhotoEditor } from "@/components/partners/restaurant/restaurant-photo-editor";
import { RestaurantReservationInbox } from "@/components/partners/restaurant/restaurant-reservation-inbox";
import { RestaurantWebsiteImport } from "@/components/partners/restaurant/restaurant-website-import";
import type { MenuItemRow, ReservationRequestRow } from "@/lib/restaurants/restaurant-owner-load";
import {
  buildRestaurantListingPatch,
  listingValuesFromRecord,
  parseListInput,
  type OpeningHours,
  type RestaurantListingValues,
} from "@/lib/restaurants/restaurant-owner-schema";

const FIELD = "h-11 text-base md:text-sm";

const LIST_FIELDS = [
  ["cuisine_types", "Cuisine types", "Colombian, Italian"],
  ["dietary_options", "Dietary options", "Vegetarian, Gluten-free"],
  ["ambiance", "Ambiance", "Rooftop, Casual"],
  ["tags", "Tags", "Date night, Brunch"],
] as const;

type ListField = (typeof LIST_FIELDS)[number][0];

/**
 * SAN-1540/1541/1542 — the single owner editor for one assigned restaurant.
 *
 * Every save goes through `/api/partners/restaurants/[id]`, which calls
 * `restaurant_owner_patch`: the database proves membership against the stored
 * partner assignment and rejects assignment or administrative fields. Photos and
 * hours are part of the same patch; menu rows and the sourced website import use
 * their own narrow routes and never auto-save.
 */
type RestaurantOwnerEditorProps = {
  restaurantId: string;
  partnerId: string | null;
  partnerName: string | null;
  initial: RestaurantListingValues;
  updatedAt: string;
  isActive: boolean;
  isAdmin: boolean;
  partners: { id: string; name: string }[];
  assignedPartnerId: string | null;
  menuItems: MenuItemRow[];
  requests: ReservationRequestRow[];
  requestsStatus: "loaded" | "error";
};

export function RestaurantOwnerEditor(props: RestaurantOwnerEditorProps) {
  const {
    restaurantId,
    partnerId,
    partnerName,
    initial,
    updatedAt,
    isActive,
    isAdmin,
    partners,
    assignedPartnerId,
    menuItems,
    requests,
    requestsStatus,
  } = props;
  const router = useRouter();
  const [values, setValues] = useState<RestaurantListingValues>(initial);
  const [persisted, setPersisted] = useState<RestaurantListingValues>(initial);
  const [lastSavedAt, setLastSavedAt] = useState(updatedAt);
  const [listText, setListText] = useState<Record<ListField, string>>({
    cuisine_types: initial.cuisine_types.join(", "),
    dietary_options: initial.dietary_options.join(", "),
    ambiance: initial.ambiance.join(", "),
    tags: initial.tags.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patch = buildRestaurantListingPatch(values, persisted);
  const dirty = Object.keys(patch).length > 0;

  function update<K extends keyof RestaurantListingValues>(key: K, value: RestaurantListingValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function updateList(field: ListField, text: string) {
    setListText((current) => ({ ...current, [field]: text }));
    update(field, parseListInput(text));
  }

  function applyImport(next: Partial<RestaurantListingValues>) {
    setValues((current) => {
      const merged = { ...current, ...next };
      setListText({
        cuisine_types: merged.cuisine_types.join(", "),
        dietary_options: merged.dietary_options.join(", "),
        ambiance: merged.ambiance.join(", "),
        tags: merged.tags.join(", "),
      });
      return merged;
    });
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !dirty) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(partnerId ? { partnerId } : {}), ...patch }),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            updatedAt?: string;
            listing?: Record<string, unknown>;
            error?: { message?: string };
          }
        | null;
      if (!response.ok || !result?.success || !result.listing) {
        throw new Error(result?.error?.message ?? "Could not save the restaurant");
      }
      const confirmed = listingValuesFromRecord(result.listing);
      setValues(confirmed);
      setPersisted(confirmed);
      setListText({
        cuisine_types: confirmed.cuisine_types.join(", "),
        dietary_options: confirmed.dietary_options.join(", "),
        ambiance: confirmed.ambiance.join(", "),
        tags: confirmed.tags.join(", "),
      });
      if (result.updatedAt) setLastSavedAt(result.updatedAt);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the restaurant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-10">
      <form onSubmit={save} data-testid="restaurant-owner-form" className="grid gap-6">
        <section aria-labelledby="restaurant-listing" className="grid gap-4">
          <div>
            <h2 id="restaurant-listing" className="text-lg font-semibold">
              Listing details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These facts appear on the public restaurant page. Only fields you change are saved.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="restaurant-name">Restaurant name</Label>
            <Input
              id="restaurant-name"
              data-testid="restaurant-name"
              className={FIELD}
              value={values.name}
              maxLength={160}
              disabled={saving}
              onChange={(event) => update("name", event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="restaurant-description">Description</Label>
            <Textarea
              id="restaurant-description"
              data-testid="restaurant-description"
              value={values.description}
              maxLength={2000}
              rows={4}
              disabled={saving}
              onChange={(event) => update("description", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-website">Website</Label>
              <Input
                id="restaurant-website"
                className={FIELD}
                value={values.website}
                maxLength={300}
                inputMode="url"
                placeholder="https://"
                disabled={saving}
                onChange={(event) => update("website", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-phone">Phone</Label>
              <Input
                id="restaurant-phone"
                className={FIELD}
                value={values.phone}
                maxLength={40}
                inputMode="tel"
                disabled={saving}
                onChange={(event) => update("phone", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-email">Email</Label>
              <Input
                id="restaurant-email"
                className={FIELD}
                value={values.email}
                maxLength={160}
                inputMode="email"
                disabled={saving}
                onChange={(event) => update("email", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-price">Price level</Label>
              <select
                id="restaurant-price"
                className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
                value={values.price_level === null ? "" : String(values.price_level)}
                disabled={saving}
                onChange={(event) =>
                  update("price_level", event.target.value === "" ? null : Number(event.target.value))
                }
              >
                <option value="">Not specified</option>
                <option value="1">$ · Budget</option>
                <option value="2">$$ · Moderate</option>
                <option value="3">$$$ · Upscale</option>
                <option value="4">$$$$ · Fine dining</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="restaurant-address">Address</Label>
              <Input
                id="restaurant-address"
                className={FIELD}
                value={values.address}
                maxLength={240}
                disabled={saving}
                onChange={(event) => update("address", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-neighborhood">Neighborhood</Label>
              <Input
                id="restaurant-neighborhood"
                className={FIELD}
                value={values.neighborhood}
                maxLength={120}
                disabled={saving}
                onChange={(event) => update("neighborhood", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-city">City</Label>
              <Input
                id="restaurant-city"
                className={FIELD}
                value={values.city}
                maxLength={120}
                disabled={saving}
                onChange={(event) => update("city", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="restaurant-postal">Postal code</Label>
              <Input
                id="restaurant-postal"
                className={FIELD}
                value={values.postal_code}
                maxLength={20}
                disabled={saving}
                onChange={(event) => update("postal_code", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {LIST_FIELDS.map(([field, label, placeholder]) => (
              <div key={field} className="grid gap-1.5">
                <Label htmlFor={`restaurant-${field}`}>{label}</Label>
                <Input
                  id={`restaurant-${field}`}
                  className={FIELD}
                  value={listText[field]}
                  placeholder={placeholder}
                  disabled={saving}
                  onChange={(event) => updateList(field, event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Separate values with commas.</p>
              </div>
            ))}
          </div>
        </section>

        <RestaurantPhotoEditor
          partnerId={partnerId ?? ""}
          restaurantId={restaurantId}
          images={values.images}
          coverUrl={values.primary_image_url}
          disabled={saving}
          onChange={(images, coverUrl) => {
            setValues((current) => ({ ...current, images, primary_image_url: coverUrl }));
            setSaved(false);
          }}
        />

        <section aria-labelledby="restaurant-hours" className="grid gap-3">
          <div>
            <h2 id="restaurant-hours" className="text-lg font-semibold">
              Opening hours
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only days you set are published. Unknown hours stay unstated.
            </p>
          </div>
          <RestaurantHoursEditor
            value={values.hours_of_operation}
            disabled={saving}
            onChange={(hours: OpeningHours) => update("hours_of_operation", hours)}
          />
        </section>

        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" className="min-h-11" disabled={saving || !dirty} data-testid="restaurant-save">
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && !dirty ? (
            <p className="text-sm font-medium text-accent" data-testid="restaurant-saved">
              Saved to the database.
            </p>
          ) : dirty ? (
            <p className="text-sm text-muted-foreground" data-testid="restaurant-unsaved">
              Unsaved changes
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Last saved {new Date(lastSavedAt).toLocaleString()}
            </p>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {isActive ? "Active listing" : "Inactive listing"}
            {partnerName ? ` · ${partnerName}` : ""}
          </span>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive" data-testid="restaurant-save-error">
            {error}
          </p>
        ) : null}
      </form>

      <RestaurantWebsiteImport
        restaurantId={restaurantId}
        defaultWebsite={values.website}
        onApply={applyImport}
      />

      <RestaurantMenuEditor restaurantId={restaurantId} initialItems={menuItems} />

      <RestaurantReservationInbox status={requestsStatus} requests={requests} />

      {isAdmin ? (
        <RestaurantAdminAssignment
          restaurantId={restaurantId}
          assignedPartnerId={assignedPartnerId}
          partners={partners}
        />
      ) : null}
    </div>
  );
}
