"use client";

import { cleanGroundingAttributionTitle } from "@/lib/parse-grounded-tool-result";

type AttributionRow = {
  source?: string;
  placeUri?: string;
  title?: string;
};

export function GroundingAttribution({
  rows,
  compact = false,
}: {
  rows: AttributionRow[];
  compact?: boolean;
}) {
  if (!rows.length) return null;

  // SAN-878 — one grounded result: "Source: Google Maps · <place name>", linked to the source URL.
  // Google's grounding rule: show the source name, link to its URL, and write "Google Maps" unchanged —
  // not translated, not on two lines, regular 12px+ text in #5E5E5E (white on dark). Callers pass a row
  // only for a place Google actually grounded; this component never invents a source for one that wasn't.
  if (compact && rows.length === 1) {
    const row = rows[0]!;
    const name = row.title ? cleanGroundingAttributionTitle(row.title) : "";
    const googleMaps = (
      <span className="whitespace-nowrap font-normal text-[#5e5e5e] dark:text-white" translate="no">
        Google Maps
      </span>
    );
    const label = (
      <>
        {googleMaps}
        {name ? ` · ${name}` : ""}
      </>
    );
    return (
      <p
        className="mt-1 text-xs font-normal text-[#5e5e5e] dark:text-white"
        data-testid="grounding-attribution"
      >
        Source:{" "}
        {row.placeUri ? (
          <a
            href={row.placeUri}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )}
      </p>
    );
  }

  return (
    <div
      className="mt-2 rounded border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      data-testid="grounding-attribution"
      translate="no"
    >
      <p className="font-medium text-foreground">Maps grounding</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        {rows.map((row, i) => (
          <li key={`${row.placeUri ?? row.title ?? i}`}>
            {row.placeUri ? (
              <a
                href={row.placeUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {row.title?.trim() || "Google Maps"}
              </a>
            ) : (
              <span>{row.source ?? "Google"}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
