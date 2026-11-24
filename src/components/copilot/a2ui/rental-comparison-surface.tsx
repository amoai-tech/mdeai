"use client";

import { useSyncExternalStore } from "react";
import { RENTAL_COMPARISON_TARGET, buildComparisonTableOps, comparisonRowSchema } from "@/mastra/lib/comparison-table-ui";
import { GenerativeUISurface, useGenerativeUIRuntime } from "@copilotkit/react-core/v2/generative-ui";
import { Button } from "@/components/ui/button";
import { GalleryImage } from "@/components/rentals/gallery-image";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import { cn } from "@/lib/utils";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";
import type { Rental } from "@/mastra/tools/search-rentals";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

/** The Rentals browse page does not mount the full chat transcript. Give the
 * same official Table a real page target; the full /chat keeps target="chat".
 * No new data or rendering library is introduced. */
export { RENTAL_COMPARISON_TARGET };
export const RENTAL_COMPARISON_COMPONENTS = ["Column", "Row", "Title", "Badge", "Table", "Text", "Caption", "Button", "Grid"] as const;

const noopSubscribe = () => () => {};
const zero = () => 0;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Read the ordered IDs from the existing server-built official Details buttons.
 * Treat the UI operations only as hints, never as a source of listing facts. */
function comparisonNodes(operations: readonly unknown[]) {
  const nodes = new Map<string, Record<string, unknown>>();
  for (const operation of operations) {
    const op = record(operation);
    if (!op) continue;
    if ("deleteSurface" in op || "createSurface" in op) nodes.clear();
    const update = record(op.createSurface ?? op.updateComponents);
    if (!update || !Array.isArray(update.components)) continue;
    for (const value of update.components) {
      const node = record(value);
      if (node && typeof node.id === "string") nodes.set(node.id, node);
    }
  }
  return nodes;
}

export function comparedRentalIds(operations: readonly unknown[], currentIds: readonly string[]): string[] {
  const nodes = comparisonNodes(operations);
  const table = nodes.get("comparison");
  if (table?.component !== "Table" || !Array.isArray(table.columns)) return [];
  const count = table.columns.length - 1;
  if (count < 2 || count > 5) return [];
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const button = nodes.get("comparison-details-" + index);
    if (button?.component !== "Button") return [];
    const call = record(record(button.onClick)?.functionCall);
    const id = record(call?.args)?.listingId;
    if (call?.["@call"] !== "openComparedRentalDetails" || typeof id !== "string" ||
        !currentIds.includes(id) || ids.includes(id)) return [];
    ids.push(id);
  }
  return ids;
}

/** Compare the actual committed official Table and its price summary with the
 * current search snapshot, not just IDs. No new query, inferred fields, or timing assumptions. */
export function comparisonMatchesCurrentResults(
  operations: readonly unknown[], ids: readonly string[], results: readonly Rental[],
): boolean {
  const rows = ids.flatMap((id) => {
    const rental = results.find((row) => row.id === id);
    const facts = comparisonRowSchema.safeParse(rental?.comparison_facts);
    return facts.success && facts.data.id === id ? [facts.data] : [];
  });
  // Older cache entries without a complete recorded snapshot cannot prove freshness.
  if (rows.length !== ids.length || ids.length < 2) return false;
  const expected = buildComparisonTableOps(rows, undefined, { target: RENTAL_COMPARISON_TARGET });
  if (!expected) return false;
  const actualNodes = comparisonNodes(operations);
  const expectedNodes = comparisonNodes(expected.operations);
  const actual = actualNodes.get("comparison");
  const wanted = expectedNodes.get("comparison");
  return actual?.component === "Table" &&
    JSON.stringify(actual.columns) === JSON.stringify(wanted?.columns) &&
    JSON.stringify(actual.rows) === JSON.stringify(wanted?.rows) &&
    actualNodes.get("comparison-summary")?.text === expectedNodes.get("comparison-summary")?.text;
}

export function comparisonIsCurrent(surfaceId: string, invalidated: ReadonlySet<string>): boolean {
  return surfaceId.startsWith("comparison-table-") && !invalidated.has(surfaceId);
}

export function useComparedRentalIds(results: readonly Rental[], invalidated: ReadonlySet<string>): { ids: string[]; surfaceId?: string; stale?: boolean } {
  const runtime = useGenerativeUIRuntime();
  const manager = runtime?.manager;
  // CopilotKit's GenerativeUISurfaceManager requires both bound methods.
  // Keep the hook unconditional even when the runtime provider is absent.
  useSyncExternalStore(manager?.subscribe ?? noopSubscribe, manager?.getVersion ?? zero, zero);
  const surface = manager?.getSurfaceForTarget(RENTAL_COMPARISON_TARGET);
  if (!surface || surface.status !== "ready" || surface.failed ||
      surface.serverRejected.length || surface.clientRejected.length ||
      !comparisonIsCurrent(surface.surfaceId, invalidated)) return { ids: [], surfaceId: surface?.surfaceId };
  const ids = comparedRentalIds(surface.operations, results.map((row) => row.id));
  const matches = comparisonMatchesCurrentResults(surface.operations, ids, results);
  return { ids: matches ? ids : [], surfaceId: surface.surfaceId, stale: !matches };
}

/** The page supplies only current, authorized rows. Never enable arbitrary
 * Image URLs in the model catalog to show a comparison thumbnail. */
export function ComparedRentalOptions({
  ids, results, selectedPinId, onSelectMap, selectedForAskId, onAskSelect,
}: {
  ids: readonly string[];
  results: readonly Rental[];
  selectedPinId: string | null;
  onSelectMap: (row: Rental) => void;
  selectedForAskId?: string | null;
  onAskSelect?: (row: Rental) => void;
}) {
  if (ids.length < 2) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-3" aria-label="Compared apartments" data-testid="rental-compared-options">
      {ids.map((id, index) => {
        const row = results.find((rental) => rental.id === id);
        if (!row) return null;
        const photo = [row.image, ...(row.images ?? [])].find(
          (url): url is string => typeof url === "string" && isRenderableRemoteImage(url),
        );
        const selected = selectedPinId === "rental-" + id;
        return (
          <div key={id} data-listing-id={id} data-pin-id={rentalToMapPin(row)?.id} data-selected={selected} className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card p-2", selected && "ring-2 ring-primary/40")}>
            {photo ? (
              <GalleryImage key={photo} src={photo} alt={row.title} loading="lazy" className="aspect-[16/9] w-full rounded-md object-cover" />
            ) : (
              <p className="flex aspect-[16/9] w-full items-center justify-center rounded-md bg-muted text-center text-sm text-muted-foreground">Photo unavailable</p>
            )}
            <p className="mt-2 text-sm font-semibold">Option #{index + 1}</p>
            <p className="mb-2 break-words text-sm leading-snug text-foreground">{row.title}</p>
            {rentalToMapPin(row) ? <Button variant="outline" size="sm" className="mt-auto min-h-11 w-full" onClick={() => onSelectMap(row)}
              aria-label={"Show compared apartment " + (index + 1) + " on map"}>
              Show on map
            </Button> : <p className="mt-auto flex min-h-11 items-center text-sm text-muted-foreground">Map location unavailable</p>}
            {onAskSelect ? <Button type="button" size="sm" className="mt-2 min-h-11 w-full"
              variant={selectedForAskId === id ? "secondary" : "outline"}
              aria-pressed={selectedForAskId === id}
              data-testid="rental-ask-select"
              onClick={() => onAskSelect(row)}>
              {selectedForAskId === id ? "Clear selection" : "Ask about this"}
            </Button> : null}
          </div>
        );
      })}
    </div>
  );
}

export function RentalComparisonSurface({ children, visible }: { children?: React.ReactNode; visible: boolean }) {
  const runtime = useGenerativeUIRuntime();
  const coAgent = useOptionalConciergeCoAgent();
  if (!runtime || !coAgent) return null;

  return (
    <section hidden={!visible} aria-label="Apartment comparison" data-testid="rental-comparison-surface" className={children ? "mb-3 min-w-0 max-w-full rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4" : undefined}>
      {children}
      <GenerativeUISurface
      id={RENTAL_COMPARISON_TARGET}
      ui={mdeUI}
      components={[...RENTAL_COMPARISON_COMPONENTS]}
      description="Accurate side-by-side comparison of two to five already displayed rentals. The server supplies the Table, factual summary, and ID-only Details and viewing actions. Never generate prices or a second search."
      className={cn("min-w-0 max-w-full", !children && "mb-4 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4")}
      fallback={null}
        autoScroll={false}
      />
    </section>
  );
}
