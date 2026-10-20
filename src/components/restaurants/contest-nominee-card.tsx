import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
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
 * back to the placeholder instead of taking the contest page down with it.
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

  return (
    <li className="overflow-hidden rounded-xl border border-border/60">
      <Link className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={href}>
        {imageUrl && isRenderableRemoteImage(imageUrl) ? (
          <Image
            alt={nominee.name}
            className="h-40 w-full object-cover"
            height={320}
            src={imageUrl}
            width={480}
          />
        ) : (
          <VenueCardPlaceholder icon={<UtensilsCrossed aria-hidden />} label="Restaurant" testId="nominee-photo-placeholder" />
        )}
        <div className="p-4">
          <p className="font-medium">{nominee.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[nominee.neighborhood, nominee.category].filter(Boolean).join(" · ") || "Medellín"}
          </p>
        </div>
      </Link>
    </li>
  );
}
