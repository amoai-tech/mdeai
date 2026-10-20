import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
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
 * back to the placeholder instead of taking the contest page down with it.
 *
 * Every card reserves the same 4:3 media box, so a nominee without a photo stays aligned with one
 * that has it. The category chip only appears when a real category is assigned.
 */
export function ContestNomineeCard({
  nominee,
  contestId,
}: {
  nominee: PublicNominee;
  contestId: string;
}) {
  const href = "/restaurants/" + nominee.restaurantId + "?contest_id=" + contestId;
  const imageUrl = nominee.imageUrl;
  const hasPhoto = Boolean(imageUrl && isRenderableRemoteImage(imageUrl));

  return (
    <li className="group overflow-hidden rounded-2xl border border-border/60 transition-colors hover:border-primary/40 focus-within:border-primary/40 hover:shadow-sm">
      <Link
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        href={href}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
          {hasPhoto && imageUrl ? (
            <Image
              alt={nominee.name}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              src={imageUrl}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent"
              data-testid="nominee-photo-placeholder"
            >
              <UtensilsCrossed aria-hidden className="size-8 text-primary/35" />
            </div>
          )}
          {nominee.category ? (
            <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
              {nominee.category}
            </span>
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium leading-snug">{nominee.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {nominee.neighborhood ?? "Medellín"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="nominee-standings">
              {nominee.rank !== null ? (
                <span className="mr-1 font-semibold text-foreground">#{nominee.rank}</span>
              ) : null}
              <span className="font-medium text-foreground">{nominee.audienceAccepted}</span> accepted
              <span className="mx-1">·</span>
              {nominee.developmentTestTotal} test
            </p>
          </div>
          <span className="mt-0.5 shrink-0 text-sm font-medium text-primary group-hover:underline" aria-hidden>
            View restaurant →
          </span>
        </div>
      </Link>
    </li>
  );
}