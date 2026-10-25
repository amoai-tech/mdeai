/**
 * One result presentation policy, not a second search engine.
 * The verified search stays authoritative; optional external ads fill alternate
 * slots without suppressing verified results or doubling up source advertisements.
 */
import type { Rental, RentalQuery } from "@/mastra/tools/search-rentals";
import { searchPublicExternalRentals } from "@/lib/rentals/public-external-discovery";

const OPTIONAL_SOURCE_TIMEOUT_MS = 1500;
export const EXTERNAL_RENTAL_BUDGET_NOTE =
  "External advertisements priced in COP/month are excluded from USD/night budget searches.";

/** No privileged database error is allowed to fail the canonical search. */
export async function getOptionalExternalRentals(query: RentalQuery): Promise<Rental[]> {
  // A USD/night cap is not comparable to the external ads' COP/month figures.
  if (query.maxPricePerNight != null) return [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      searchPublicExternalRentals(query),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("external_timeout")), OPTIONAL_SOURCE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    console.warn("[search-rentals] optional external discovery unavailable");
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function identityKeys(rental: Rental): string[] {
  const keys = [`id:${rental.id}`];
  if (rental.source_url) {
    try {
      const uri = new URL(rental.source_url);
      if (uri.protocol !== "https:") return keys;
      const hostname = uri.hostname.toLowerCase().replace(/^www\./, "");
      // Fincaraíz IDs are stable even if www or tracking params change.
      const path = uri.pathname.replace(/\/+$/, "").toLowerCase();
      keys.push(`source:${hostname}${path}`);
    } catch {
      // Malformed optional source URL cannot affect a legitimate card.
    }
  }
  return keys;
}

/** Alternates verified/source cards, with verified first; total counts unique records. */
export function mixRentalResults(
  verified: Rental[],
  external: Rental[],
  limit: number,
): { results: Rental[]; distinctExternal: number } {
  const seen = new Set<string>();
  const canonical = [];
  for (const r of verified) {
    const keys = identityKeys(r);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    canonical.push(r);
  }
  const externalUnique = [];
  for (const r of external) {
    const keys = identityKeys(r);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    externalUnique.push(r);
  }

  const results: Rental[] = [];
  const max = Math.max(0, Math.floor(limit));
  for (let i = 0; results.length < max && (i < canonical.length || i < externalUnique.length); i++) {
    if (i < canonical.length && results.length < max) results.push(canonical[i]);
    if (i < externalUnique.length && results.length < max) results.push(externalUnique[i]);
  }
  return { results, distinctExternal: externalUnique.length };
}
