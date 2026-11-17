"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, MapPin } from "lucide-react";
import type { BrokerOnboardingFormInput } from "@/lib/rentals/broker-onboarding-validate";
import { cn } from "@/lib/utils";

type PreviewFields = Pick<
  BrokerOnboardingFormInput,
  "address" | "bedrooms" | "bathrooms" | "monthlyRentCop" |
  "photoUrl" | "placeId" | "formattedAddress"
>;

function previewPhotoUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * SAN-1688: a read-only preview of the REAL onboarding form fields.
 * It never invents property facts or implies that an unsaved draft exists.
 * The existing server action remains the only persistence owner.
 */
export function RentalsListingLivePreview({
  listing,
  className,
}: {
  listing: PreviewFields;
  className?: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = previewPhotoUrl(listing.photoUrl);
  const showPhoto = photo !== null && photo !== failedPhoto;
  const hasRent = Number.isFinite(listing.monthlyRentCop) && listing.monthlyRentCop > 0;
  const rent = hasRent
    ? `COP ${new Intl.NumberFormat("en-US").format(listing.monthlyRentCop)}`
    : "Add monthly rent";
  const displayRooms = (value: number) =>
    Number.isFinite(value) && value >= 0 ? value : "Not specified";
  const location = listing.address.trim() || "Add street address";
  const addressSelected = Boolean(listing.placeId && listing.formattedAddress);

  return (
    <aside
      aria-labelledby="ro-preview-title"
      data-testid="ro-live-preview"
      className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="ro-preview-title" className="text-sm font-semibold">Listing preview</h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          Not saved yet
        </span>
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/50">
        {showPhoto ? (
          <Image
            data-testid="ro-live-preview-photo"
            src={photo}
            alt="Property image supplied for this listing"
            fill
            unoptimized
            sizes="(min-width: 1024px) 340px, 100vw"
            className="object-cover"
            onError={() => setFailedPhoto(photo)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <Building2 aria-hidden className="size-9 opacity-70" />
            <p className="text-xs">
              {photo && failedPhoto === photo
                ? "Photo unavailable — check the URL"
                : "Add a usable photo URL to preview the image"}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p data-testid="ro-live-preview-price" className="text-lg font-semibold">
            {rent}
            {hasRent ? (
              <span className="text-xs font-normal text-muted-foreground"> / month</span>
            ) : null}
          </p>
          <div className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span data-testid="ro-live-preview-location" className="break-words">{location}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Bedrooms</dt>
            <dd className="font-medium">{displayRooms(listing.bedrooms)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bathrooms</dt>
            <dd className="font-medium">{displayRooms(listing.bathrooms)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground" data-testid="ro-live-preview-place-status">
          {addressSelected
            ? "Address selected. Coordinates are confirmed by the server when you save."
            : "Location not confirmed. You can still save a draft."}
        </p>
        <p className="text-xs text-muted-foreground">
          This is a preview only. Continue to Review to save your first rental draft.
        </p>
      </div>
    </aside>
  );
}
