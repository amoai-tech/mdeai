import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatBedrooms,
  formatDelivery,
  formatPriceRangeLabel,
  formatVerified,
  projectStatusLabel,
  visLabel,
} from "@/lib/new-projects/format";
import type { NewProjectSummary } from "@/lib/new-projects/types";

/**
 * Browse card. It reuses the MDE card language (rounded border, media placeholder, badge row)
 * and states "Not published" for missing facts instead of showing 0 or an empty price.
 */
export function ProjectCard({ project }: { project: NewProjectSummary }) {
  const priceLabel = formatPriceRangeLabel(
    project.priceFromCents,
    project.priceToCents,
    project.currency,
  );
  const priceKnown = project.priceFromCents != null || project.priceToCents != null;
  const bedrooms = formatBedrooms(project.minBedrooms, project.maxBedrooms);
  const status = projectStatusLabel(project.projectStatus);
  const vis = visLabel(project.visFlag);
  const delivery = formatDelivery(
    project.expectedDeliveryYear,
    project.expectedDeliveryQuarter,
    project.deliveryNote,
  );

  return (
    <article
      data-testid={"new-project-card-" + project.slug}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div
        className="flex aspect-[16/10] items-center justify-center bg-muted"
        aria-hidden="true"
      >
        <Building2 className="size-8 text-muted-foreground" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p
          className="text-xs font-medium text-muted-foreground"
          data-testid="new-project-card-neighborhood"
        >
          {project.neighborhood ?? project.city ?? "Medellín"}
        </p>

        <h3 className="font-medium leading-snug">
          <Link
            href={"/new-projects/" + project.slug}
            data-testid={"new-project-card-link-" + project.slug}
            className="hover:underline"
          >
            {project.name}
          </Link>
        </h3>

        {project.sourceOwner ? (
          <p className="text-xs text-muted-foreground">{project.sourceOwner}</p>
        ) : null}

        <p className="mt-1 text-sm font-semibold" data-testid="new-project-card-price">
          {priceLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {priceKnown ? "Price-from, not an exact unit price." : "Price not published; ask us."}
        </p>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {bedrooms ? (
            <Badge variant="secondary" className="font-normal">
              {bedrooms}
            </Badge>
          ) : null}
          <Badge variant="outline" className="font-normal">
            {delivery}
          </Badge>
          {status ? (
            <Badge variant="outline" className="font-normal">
              {status}
            </Badge>
          ) : null}
          {vis ? (
            <Badge variant="outline" className="font-normal">
              {vis}
            </Badge>
          ) : null}
        </div>

        <p className="pt-1 text-xs text-muted-foreground">{formatVerified(project.verifiedAt)}</p>
      </div>
    </article>
  );
}
