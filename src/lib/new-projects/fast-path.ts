/**
 * SAN-1380 — deterministic classifier and parameter builder for the New Projects chat fast path.
 * It only decides "is this a new-projects request?" and extracts the same hard filters the tool
 * accepts. It never invents a filter the buyer did not express.
 */
const NEW_PROJECT_RE =
  /(\bnew\b[\s\w]{0,30}\bprojects?\b)|(\bnew\s+(?:construction|development)s?\b)|(?:proyectos?\s+nuev\w*)|(?:preventa|pre-venta)|(?:apartamentos?\s+nuev\w*)|(?:obra\s+nueva)|(?:condo\s+projects?)/i;

const NEIGHBORHOODS = ["Laureles", "Ciudad del Río", "El Poblado"] as const;

export function looksLikeNewProjectQuery(text: string): boolean {
  return NEW_PROJECT_RE.test(text);
}

export function buildNewProjectFastPathParams(text: string): Record<string, unknown> {
  const params: Record<string, unknown> = { limit: 5 };
  const lower = text.toLowerCase();

  const neighborhood = NEIGHBORHOODS.find((n) => lower.includes(n.toLowerCase()));
  if (neighborhood) params.neighborhood = neighborhood;

  const beds = text.match(/(\d)\s*\+?\s*(?:bed(?:room)?s?|habitaci[oó]n(?:es)?|alcoba(?:s)?|br)\b/i);
  if (beds) {
    const count = Number(beds[1]);
    if (/\d\s*\+|at least|or more|m[aá]s de/i.test(text)) params.minBedrooms = count;
    else params.bedroomsExact = count;
  }

  const price = text.match(/(?:under|below|bajo|menos de)\s*\$?\s*([\d.,]+)\s*(million|millones|m)\b/i);
  if (price) {
    const millions = Number(price[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (Number.isFinite(millions) && millions > 0) {
      params.maxPriceCop = Math.round(millions * 1_000_000);
    }
  }

  const year = text.match(/\b(20[2-9]\d)\b/);
  if (year) params.deliveryYear = Number(year[1]);

  return params;
}
