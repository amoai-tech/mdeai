import Image from "next/image";
import Link from "next/link";
import { MapPin, UtensilsCrossed } from "lucide-react";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import type { PublicNominee } from "@/lib/restaurants/contest-public";

/**
 * SAN-1524 · one nominee, linking to the restaurant detail with the contest carried along.
 *
 * The `?contest_id=` is not decoration: a restaurant in two contests cannot be resolved without it,
 * and the detail page uses it to select the exact ballot.
 *
 * The photo is rendered only when the host is declared in next.config. A database URL pointing at
 * an undeclared host makes next/image throw and the whole page fail, so an unexpected value falls
 * back to the one brand placeholder instead of taking the contest page down with it.
 *
 * Every card reserves the same 4:3 media box, so a nominee without a photo stays aligned with one
 * that has it. The category chip only appears when a real category is assigned, and a place is
 * only shown when the canonical accepted-vote tally produced one.
 */
export function ContestNomineeCard({
  nominee,
  contestId,
  onActive,
}: {
  nominee: PublicNominee;
  contestId: string;
  /** Fires when the card takes pointer or keyboard focus — the gallery syncs the map pin. */
  onActive?: () => void;
}) {
  const href = "/restaurants/" + nominee.restaurantId + "?contest_id=" + contestId;
  const imageUrl = nominee.imageUrl;
  const hasPhoto = Boolean(imageUrl && isRenderableRemoteImage(imageUrl));
  const acceptedLabel =
    nominee.audienceAccepted === 1 ? "accepted audience vote" : "accepted audience votes";

  return (
    <li
      className="group h-full overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:border-primary/40 hover:shadow-sm focus-within:border-primary/40"
      data-testid={"nominee-card-" + nominee.entityId}
    >
      <Link
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href={href}
        onFocus={onActive}
        onPointerEnter={onActive}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
          {hasPhoto && imageUrl ? (
            <Image
              alt=""
              aria-hidden
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              src={imageUrl}
            />
          ) : (
            <VenueCardPlaceholder
              className="aspect-auto h-full w-full rounded-none"
              icon={<UtensilsCrossed aria-hidden className="size-7" />}
              label="Restaurant"
              testId="nominee-photo-placeholder"
            />
          )}
          {nominee.category ? (
            <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
              {nominee.category}
            </span>
          ) : null}
          {nominee.rank !== null ? (
            <span
              className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-foreground/90 text-xs font-semibold text-background shadow-sm"
              data-testid="nominee-rank"
            >
              #{nominee.rank}
            </span>
          ) : null}
        </div>

        {/* Stacked, not name-beside-CTA: at 1024 the map pane leaves ~300px per card, and a
            side-by-side action squeezes real restaurant names into two-word columns. */}
        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="break-words font-semibold leading-snug" data-testid="nominee-name">
              {nominee.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              {nominee.neighborhood ?? "Medellín"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground" data-testid="nominee-standings">
              {nominee.audienceAccepted > 0 ? (
                <>
                  <span className="font-semibold text-foreground">
                    {nominee.audienceAccepted}
                  </span>{" "}
                  {acceptedLabel}
                </>
              ) : (
                "No audience votes yet"
              )}
              {nominee.developmentTestTotal > 0 ? (
                <>
                  {" · "}
                  {nominee.developmentTestTotal} development test{" "}
                  {nominee.developmentTestTotal === 1 ? "vote" : "votes"}
                </>
              ) : null}
            </p>
          </div>
          <span
            aria-hidden
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:underline"
          >
            View restaurant →
          </span>
        </div>
      </Link>
    </li>
  );
}
