import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import type { PublicNominee } from "@/lib/restaurants/contest-public";

/**
 * SAN-1524 · one nominee, linking to the restaurant detail with the contest carried along.
 *
 * The `?contest_id=` is not decoration: a restaurant in two contests cannot be resolved without it,
 * and the detail page uses it to select the exact ballot.
 */
export function ContestNomineeCard({
  nominee,
  contestId,
}: {
  nominee: PublicNominee;
  contestId: string;
}) {
  const href = "/restaurants/" + nominee.restaurantId + "?contest_id=" + contestId;

  return (
    <li className="overflow-hidden rounded-xl border border-border/60">
      <Link className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={href}>
        {nominee.imageUrl ? (
          <Image
            alt={nominee.name}
            className="h-40 w-full object-cover"
            height={320}
            src={nominee.imageUrl}
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
