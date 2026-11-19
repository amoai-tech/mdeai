"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, MapPin } from "lucide-react";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import {
  roomCountError,
  type BrokerOnboardingFormInput,
} from "@/lib/rentals/broker-onboarding-validate";
import { cn } from "@/lib/utils";

type PreviewFields = Pick<
  BrokerOnboardingFormInput,
  "address" | "bedrooms" | "bathrooms" | "monthlyRentCop" |
  "photoUrl" | "placeId" | "formattedAddress"
>;

/**
 * Only a direct HTTPS image URL can be previewed: an `http:` image is blocked as
 * mixed content on the HTTPS app, so accepting it would promise a photo the
 * broker never sees.
 */
function previewPhotoUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function roomLabel(value: number): string {
  return roomCountError("rooms", value) === null ? String(value) : "Not specified";
}

function PhotoPlaceholder({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
      <Building2 aria-hidden className="size-9 opacity-70" />
      <p data-testid="ro-live-preview-photo-status" className="text-xs">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          data-testid="ro-live-preview-photo-retry"
          className="text-xs font-medium underline underline-offset-2 hover:text-foreground"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * One photo URL, one state machine. The parent remounts this component with
 * `key={url}`, so a new link can never inherit the previous link's failure and
 * a stale in-flight error cannot hide a valid image.
 */
function PreviewPhoto({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <PhotoPlaceholder
        message="Photo unavailable — check the image link"
        onRetry={() => {
          setFailed(false);
          setLoaded(false);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  // Only hosts declared in `src/lib/images/remote-image-hosts.ts` may go through
  // the Next.js optimiser; every other HTTPS host renders unoptimised instead of
  // throwing "hostname is not configured".
  const optimised = isRenderableRemoteImage(url);
  const imageKey = `${url}#${attempt}`;

  return (
    <>
      {loaded ? null : (
        <div
          data-testid="ro-live-preview-photo-loading"
          aria-hidden
          className="absolute inset-0 animate-pulse bg-muted"
        />
      )}
      {optimised ? (
        <Image
          key={imageKey}
          data-testid="ro-live-preview-photo"
          src={url}
          alt="Photo preview from the image link you supplied"
          fill
          sizes="(min-width: 1024px) 340px, 100vw"
          className="object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        // Non-allowlisted host: a plain, unoptimised image keeps the broker's own
        // CDN working without adding it to the optimiser allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageKey}
          data-testid="ro-live-preview-photo"
          src={url}
          alt="Photo preview from the image link you supplied"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {loaded ? "Photo loaded" : "Loading photo"}
      </span>
    </>
  );
}

/**
 * SAN-1688: a read-only preview of the REAL onboarding form fields.
 * It never invents property facts or implies that photo or location was verified.
 * The existing server action remains the only persistence owner.
 */
export function RentalsListingLivePreview({
  listing,
  className,
}: {
  listing: PreviewFields;
  className?: string;
}) {
  const photo = previewPhotoUrl(listing.photoUrl);
  const hasRent = Number.isFinite(listing.monthlyRentCop) && listing.monthlyRentCop > 0;
  const rent = hasRent
    ? `COP ${new Intl.NumberFormat("en-US").format(listing.monthlyRentCop)}`
    : "Add monthly rent";
  const location = listing.address.trim() || "Add street address";
  const addressSelected = Boolean(listing.placeId && listing.formattedAddress);
  const typedPhoto = listing.photoUrl.trim().length > 0;

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
        {photo ? (
          <PreviewPhoto key={photo} url={photo} />
        ) : (
          <PhotoPlaceholder
            message={
              typedPhoto
                ? "This image link can't be previewed. Use a direct https link."
                : "Add an https image link to preview the photo"
            }
          />
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
            <dd data-testid="ro-live-preview-bedrooms" className="font-medium">
              {roomLabel(listing.bedrooms)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bathrooms</dt>
            <dd data-testid="ro-live-preview-bathrooms" className="font-medium">
              {roomLabel(listing.bathrooms)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground" data-testid="ro-live-preview-place-status">
          {addressSelected
            ? "Address selected. The server re-checks it with Google when you save."
            : "Location not confirmed. You can still save a draft."}
        </p>
        <p className="text-xs text-muted-foreground">
          Preview only. Nothing is saved until you press Save on Review.
        </p>
      </div>
    </aside>
  );
}
