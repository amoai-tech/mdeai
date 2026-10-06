import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NOT_PUBLISHED,
  confidenceLabel,
  formatBathrooms,
  formatBedrooms,
  formatCheckedAt,
  formatDelivery,
  formatPriceFromCents,
  formatPriceRangeLabel,
  formatUnitAreas,
  formatVerified,
  projectStatusLabel,
  toTestId,
  visLabel,
} from "@/lib/new-projects/format";
import type { NewProjectDetail, NewProjectSource, NewProjectUnitType } from "@/lib/new-projects/types";

/**
 * CTA row. "Ask AI" reuses the existing concierge route. Compare / Request info / Schedule
 * belong to SAN-1380 and SAN-1381, so they are disabled placeholders here — the page must not
 * advertise or duplicate lead logic it does not own.
 */
function ProjectCtas() {
  return (
    <div className="flex flex-wrap gap-2" data-testid="new-project-cta-row">
      <Button size="sm" render={<Link href="/chat" />} data-testid="new-project-cta-ask-ai">
        Ask AI
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Compare — coming with the buyer AI concierge"
        data-testid="new-project-cta-compare"
      >
        Compare
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Request info — coming with lead registration"
        data-testid="new-project-cta-request-info"
      >
        Request info
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Schedule a visit — coming with appointment booking"
        data-testid="new-project-cta-schedule"
      >
        Schedule a visit
      </Button>
    </div>
  );
}

function ProjectHero({ detail }: { detail: NewProjectDetail }) {
  const bedrooms = formatBedrooms(detail.minBedrooms, detail.maxBedrooms);
  const status = projectStatusLabel(detail.projectStatus);
  const vis = visLabel(detail.visFlag);
  const delivery = formatDelivery(
    detail.expectedDeliveryYear,
    detail.expectedDeliveryQuarter,
    detail.deliveryNote,
  );

  return (
    <header className="mt-4">
      <p className="text-sm text-muted-foreground" data-testid="new-project-detail-location">
        {detail.neighborhood ?? detail.city ?? "Medellín"}
      </p>
      <h1 className="font-serif text-3xl font-semibold">{detail.name}</h1>
      {detail.sourceOwner ? (
        <p className="mt-1 text-sm text-muted-foreground">{detail.sourceOwner}</p>
      ) : null}

      <p className="mt-3 text-lg font-semibold" data-testid="new-project-detail-price">
        {formatPriceRangeLabel(detail.priceFromCents, detail.priceToCents, detail.currency)}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
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

      <p className="mt-2 text-xs text-muted-foreground" data-testid="new-project-detail-verified">
        {formatVerified(detail.verifiedAt)}
      </p>

      <div className="mt-4">
        <ProjectCtas />
      </div>
    </header>
  );
}

function ProjectFacts({ detail }: { detail: NewProjectDetail }) {
  const status = projectStatusLabel(detail.projectStatus);
  const vis = visLabel(detail.visFlag);
  const facts: Array<{ label: string; value: string }> = [
    { label: "Project status", value: status ?? NOT_PUBLISHED },
    {
      label: "Delivery",
      value: formatDelivery(
        detail.expectedDeliveryYear,
        detail.expectedDeliveryQuarter,
        detail.deliveryNote,
      ),
    },
    { label: "VIS", value: vis ?? NOT_PUBLISHED },
    { label: "Payment plan", value: detail.paymentPlan ?? NOT_PUBLISHED },
    {
      label: "Construction progress",
      value: detail.constructionProgress != null ? detail.constructionProgress + "%" : NOT_PUBLISHED,
    },
    { label: "Developer / source owner", value: detail.sourceOwner ?? NOT_PUBLISHED },
  ];

  return (
    <section aria-labelledby="new-project-facts" className="mt-8">
      <h2 id="new-project-facts" className="font-serif text-xl font-semibold">
        Project facts
      </h2>
      <dl
        className="mt-3 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
        data-testid="new-project-facts"
      >
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs font-medium text-muted-foreground">{fact.label}</dt>
            <dd className="text-sm">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Facts a source did not publish are shown as “{NOT_PUBLISHED}”. Nothing here is inferred.
      </p>
    </section>
  );
}

function ProjectLocation({ detail }: { detail: NewProjectDetail }) {
  const mapsHref =
    detail.latitude != null && detail.longitude != null
      ? "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(detail.latitude + "," + detail.longitude)
      : null;

  return (
    <section aria-labelledby="new-project-location" className="mt-8">
      <h2 id="new-project-location" className="font-serif text-xl font-semibold">
        Location
      </h2>
      <div className="mt-3 rounded-xl border border-border p-4" data-testid="new-project-location">
        {detail.address ? (
          <p className="text-sm">
            <MapPin className="mr-1 inline size-3.5" aria-hidden />
            {detail.address}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Address not published.</p>
        )}
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-primary hover:underline"
            data-testid="new-project-map-link"
          >
            View on map
          </a>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Map coordinates not published by the developer.
          </p>
        )}
      </div>
    </section>
  );
}

function ProjectUnitTypes({ units }: { units: NewProjectUnitType[] }) {
  return (
    <section aria-labelledby="new-project-units" className="mt-8">
      <h2 id="new-project-units" className="font-serif text-xl font-semibold">
        Unit types
      </h2>
      {units.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="new-project-units-empty">
          No verified unit typologies published yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {units.map((unit) => {
            const beds = formatBedrooms(unit.bedrooms, unit.bedrooms);
            const baths = formatBathrooms(unit.bathrooms);
            const price =
              unit.priceFromCents != null
                ? formatPriceFromCents(unit.priceFromCents, unit.currency)
                : null;
            return (
              <li
                key={unit.id}
                className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={"new-project-unit-" + toTestId(unit.sourceKey)}
              >
                <div>
                  <p className="font-medium">{unit.name}</p>
                  <p className="text-xs text-muted-foreground">{formatUnitAreas(unit)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {beds ? (
                    <Badge variant="secondary" className="font-normal">
                      {beds}
                    </Badge>
                  ) : null}
                  {baths ? (
                    <Badge variant="outline" className="font-normal">
                      {baths}
                    </Badge>
                  ) : null}
                  {price ? (
                    <Badge variant="outline" className="font-normal">
                      From {price}
                    </Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Typologies are not unit-level availability; MDE does not publish exact unit availability
        until a developer supplies it.
      </p>
    </section>
  );
}

function ProjectAmenities({ amenities }: { amenities: string[] | null }) {
  return (
    <section aria-labelledby="new-project-amenities" className="mt-8">
      <h2 id="new-project-amenities" className="font-serif text-xl font-semibold">
        Amenities
      </h2>
      {amenities && amenities.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="new-project-amenities">
          {amenities.map((amenity) => (
            <li key={amenity}>
              <Badge variant="outline" className="font-normal">
                {amenity}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="new-project-amenities-empty">
          Amenities not published.
        </p>
      )}
    </section>
  );
}

function ProjectEvidence({ sources }: { sources: NewProjectSource[] }) {
  return (
    <section aria-labelledby="new-project-evidence" className="mt-8">
      <h2 id="new-project-evidence" className="font-serif text-xl font-semibold">
        Evidence and sources
      </h2>
      <ul className="mt-3 space-y-2" data-testid="new-project-evidence">
        {sources.map((source) => {
          const checked = formatCheckedAt(source.checkedAt);
          const updated = formatCheckedAt(source.sourceUpdatedAt);
          const confidence = confidenceLabel(source.confidence);
          return (
            <li key={source.id} className="rounded-lg border border-border p-3 text-sm">
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary hover:underline"
              >
                {source.sourceUrl}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.sourceType} · {source.factStatus} · HTTP {source.httpStatus ?? "unknown"} ·{" "}
                {checked ? "checked " + checked : "check date unknown"}
                {updated ? " · source updated " + updated : ""}
                {confidence ? " · " + confidence : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProjectDetailView({ detail }: { detail: NewProjectDetail }) {
  return (
    <main data-testid="new-project-detail" className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/new-projects"
        data-testid="new-project-back"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All new projects
      </Link>

      <ProjectHero detail={detail} />
      <ProjectFacts detail={detail} />
      <ProjectLocation detail={detail} />
      <ProjectUnitTypes units={detail.unitTypes} />
      <ProjectAmenities amenities={detail.amenities} />
      <ProjectEvidence sources={detail.sources} />
    </main>
  );
}
