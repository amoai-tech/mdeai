"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { decodeToolJson, normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";

interface NewProjectCardRow {
  slug: string;
  name: string;
  neighborhood: string | null;
  sourceOwner: string | null;
  priceLabel: string;
  priceKnown: boolean;
  bedroomsLabel: string | null;
  deliveryLabel: string;
  statusLabel: string | null;
  visLabel: string | null;
  unitTypeCount: number;
  verifiedLabel: string;
  detailUrl: string;
  primarySourceUrl: string | null;
  primarySourceCheckedLabel: string | null;
  unknownFields: string[];
}

interface CompareUnitRow {
  name: string;
  areasLabel: string;
  priceLabel: string | null;
}

interface CompareProjectRow {
  slug: string;
  name: string;
  neighborhood: string | null;
  sourceOwner: string | null;
  priceLabel: string;
  deliveryLabel: string;
  statusLabel: string | null;
  verifiedLabel: string;
  primarySourceUrl: string | null;
  primarySourceCheckedLabel: string | null;
  unitTypes: CompareUnitRow[];
  unknownFields: string[];
}

function asCardRows(result: unknown): NewProjectCardRow[] {
  const envelope = normalizeToolEnvelope(result);
  const rows = envelope.results;
  return Array.isArray(rows) ? (rows as NewProjectCardRow[]) : [];
}

function UnknownNote({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground" data-testid="new-project-tool-unknown">
      Not published: {fields.join(", ")}.
    </p>
  );
}

function SourceLink({ url, checked }: { url: string | null; checked: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="new-project-tool-source"
      className="mt-1 inline-block text-xs text-primary hover:underline"
    >
      Source{checked ? " · checked " + checked : ""}
    </a>
  );
}

/** Generative-UI cards for the search-new-projects tool. Unknown facts stay explicit. */
export function NewProjectResults({ result }: { result: unknown }) {
  const rows = asCardRows(result);
  if (rows.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground" data-testid="new-project-tool-empty">
        No published projects matched those hard filters. Unknown facts are not guessed.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 py-2" data-testid="new-project-tool-results">
      {rows.map((row) => (
        <article
          key={row.slug}
          data-testid={"new-project-tool-card-" + row.slug}
          className="rounded-xl border border-border bg-card p-3"
        >
          <p className="text-xs text-muted-foreground">
            {(row.neighborhood ?? "Medellín") + " · " + (row.sourceOwner ?? "Developer not stated")}
          </p>
          <h3 className="font-medium leading-snug">
            <Link href={row.detailUrl} className="hover:underline" data-testid={"new-project-tool-link-" + row.slug}>
              {row.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm font-semibold">{row.priceLabel}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.bedroomsLabel ? <Badge variant="secondary" className="font-normal">{row.bedroomsLabel}</Badge> : null}
            <Badge variant="outline" className="font-normal">{row.deliveryLabel}</Badge>
            {row.statusLabel ? <Badge variant="outline" className="font-normal">{row.statusLabel}</Badge> : null}
            {row.visLabel ? <Badge variant="outline" className="font-normal">{row.visLabel}</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.verifiedLabel}
            {row.unitTypeCount > 0 ? " · " + row.unitTypeCount + " unit types" : ""}
          </p>
          <UnknownNote fields={row.unknownFields} />
          <SourceLink url={row.primarySourceUrl} checked={row.primarySourceCheckedLabel} />
        </article>
      ))}
    </div>
  );
}

function asCompareRows(result: unknown): CompareProjectRow[] {
  // The compare payload has a top-level `projects` array, which normalizeToolEnvelope does not
  // carry (it normalizes search-shaped `results`). Decode the raw payload for this shape.
  const decoded = decodeToolJson(result);
  if (!decoded || typeof decoded !== "object") return [];
  const rows = (decoded as { projects?: unknown }).projects;
  return Array.isArray(rows) ? (rows as CompareProjectRow[]) : [];
}

/** Generative-UI comparison for the compare-new-projects tool. */
export function NewProjectComparisonResults({ result }: { result: unknown }) {
  const rows = asCompareRows(result);
  if (rows.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground" data-testid="new-project-compare-empty">
        Could not compare those projects. Ask me to search again first.
      </p>
    );
  }
  return (
    <div className="grid gap-2 py-2 sm:grid-cols-2" data-testid="new-project-compare-results">
      {rows.map((row) => (
        <article
          key={row.slug}
          data-testid={"new-project-compare-card-" + row.slug}
          className="rounded-xl border border-border bg-card p-3"
        >
          <p className="text-xs text-muted-foreground">{row.neighborhood ?? "Medellín"}</p>
          <h3 className="font-medium leading-snug">
            <Link href={"/new-projects/" + row.slug} className="hover:underline">{row.name}</Link>
          </h3>
          <p className="mt-1 text-sm font-semibold">{row.priceLabel}</p>
          <p className="text-xs text-muted-foreground">{row.deliveryLabel}</p>
          {row.unitTypes.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {row.unitTypes.map((unit) => (
                <li key={unit.name} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{unit.name}</span> · {unit.areasLabel}
                  {unit.priceLabel ? " · from " + unit.priceLabel : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No verified typologies published.</p>
          )}
          <UnknownNote fields={row.unknownFields} />
          <SourceLink url={row.primarySourceUrl} checked={row.primarySourceCheckedLabel} />
        </article>
      ))}
    </div>
  );
}
