/**
 * SAN-1380 — deterministic classifier and parameter builder for the New Projects chat fast path.
 * It only decides "is this a new-projects request?" and extracts the same hard filters the tool
 * accepts. It never invents a filter the buyer did not express.
 */
/** Spanish or unambiguous English new-construction phrases. */
const NEW_PROJECT_STRONG_RE =
  /(?:apartamentos?\s+nuev\w*)|(?:preventa|pre-venta)|(?:obra\s+nueva)|(\bnew\s+construction\b)|(\bnew\s+developments?\b)/i;

/** English "new condo/apartment/projects" needs a real-estate cue to avoid adjacent domains. */
const NEW_PROJECT_CONDITIONAL_RE =
  /(\bnew\s+condos?\b)|(\bnew\s+apartments?\b)|(\bnew\b[\s\w]{0,30}\bprojects?\b)|(\bcondo\s+projects?\b)/i;

/** Adjacent-domain wording that must never select the new-projects path. */
const NON_REAL_ESTATE_RE =
  /\b(tips?|ideas?|management|tools?|software|cleaning|tutorials?|courses?|templates?|checklists?|sprints?|agile|kanban|jira|notion|startups?|business plan)\b/i;

const REAL_ESTATE_CUE_RE =
  /\b(apartment|apartamentos?|condo|alcoba|habitaci[oó]n|bedroom|torre|torres|constructora|inmobiliaria|medell[ií]n|laureles|poblado|ciudad del r[ií]o|calasanz|estadio|bel[eé]n|envigado|cop|millones?|million|m2|m²|desde|show me|find|looking for|browse|buy|purchase|busco|quiero|comprar)\b/i;

/** Strong rental wording: "new apartments" is new construction, but "new apartments for rent" is not. */
export const RENTAL_WORD_RE = /\b(for rent|per night|nightly|arriendo|alquiler|airbnb|renta\b)/i;

/** Delivery wording that must sit next to a year before we treat it as a delivery filter. */
const DELIVERY_WORD = /deliver|entrega|entregar|completion|handover/i;

// Curated from the published Medellín project catalog (read-only production audit, Oct 2026).
// Existing browse pilot options plus neighborhoods with verified published projects.
const NEIGHBORHOODS = [
  "Laureles", "Ciudad del Río", "El Poblado", "Calasanz", "Cuarta Brigada", "El Estadio",
] as const;
/** Geographies outside the current published pilot must not silently lose their location filter. */
const UNSUPPORTED_AREA_RE = /\b(envigado|belen|bel[eé]n|sabaneta|bogota|bogot[aá]|rionegro|itagui|itag[uü][ií])\b/i;

function unaccent(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}


/**
 * A price in millions: 1,200 / 1.200 mean 1200, whereas 1,2 / 1.23 mean decimals.
 * Reject malformed or mixed/ambiguous grouping rather than silently widening a budget.
 */
function parseMillionsAmount(raw: string): number | null {
  let normalized: string;
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(raw)) {
    normalized = raw.replaceAll(",", "");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw)) {
    normalized = raw.replaceAll(".", "").replace(",", ".");
  } else if (/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(raw)) {
    normalized = raw.replace(/[.,]/g, "");
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(",", ".");
  } else {
    return null;
  }
  const millions = Number(normalized);
  return Number.isFinite(millions) && millions > 0 &&
    Number.isSafeInteger(Math.round(millions * 1_000_000))
    ? millions : null;
}

export function looksLikeNewProjectQuery(text: string): boolean {
  // Adjacent domains ("new project ideas for my startup", "new condo cleaning tips") must not
  // win the routing, because New Projects is classified before the other verticals.
  if (NON_REAL_ESTATE_RE.test(text)) return false;
  if (NEW_PROJECT_STRONG_RE.test(text)) return true;
  // Generic Spanish "new projects" can refer to any domain, not just real estate.
  return (NEW_PROJECT_CONDITIONAL_RE.test(text) ||
    /\bproyectos?\s+nuev\w*\b/i.test(text)) && REAL_ESTATE_CUE_RE.test(text);
}

export function buildNewProjectFastPathParams(text: string): Record<string, unknown> {
  const params: Record<string, unknown> = { limit: 5 };
  const lower = unaccent(text);
  if (UNSUPPORTED_AREA_RE.test(lower)) {
    throw new Error("New Projects currently covers Laureles, Ciudad del Río and El Poblado in Medellín. Please choose one of these areas.");
  }

  const neighborhood = NEIGHBORHOODS.find((n) => lower.includes(unaccent(n)));
  if (neighborhood) params.neighborhood = neighborhood;

  const beds = text.match(/(\d+)\s*(\+)?\s*(?:bed(?:room)?s?|habitaci[oó]n(?:es)?|alcoba(?:s)?|br)\b/i);
  if (beds) {
    const count = Number(beds[1]);
    if (!Number.isInteger(count) || count < 1 || count > 6) {
      throw new Error("New Projects search supports 1 to 6 bedrooms. Please adjust the number.");
    }
    // Qualify only next to the matched bedroom phrase — an unrelated "3+ cars" must not turn an
    // exact "2 bedrooms" into "2+".
    const at = beds.index ?? 0;
    const local = text.slice(Math.max(0, at - 14), at + beds[0].length + 14).toLowerCase();
    const qualified = beds[2] === "+" || /at least|or more|m[aá]s de|minimum/.test(local);
    if (qualified) params.minBedrooms = Number(beds[1]);
    else params.bedroomsExact = Number(beds[1]);
  }

  const price = text.match(/(?:under|below|bajo|menos de)\s*\$?\s*([\d.,]+)\s*(million|millones|m)\b/i);
  if (price) {
    const millions = parseMillionsAmount(price[1]);
    if (millions == null) {
      throw new Error("I couldn't interpret that price. Try 'under 900 million' or 'under 1,200 million'.");
    }
    params.maxPriceCop = Math.round(millions * 1_000_000);
  }

  // A bare year ("announced in 2025") is not a delivery filter; require delivery wording nearby.
  for (const year of text.matchAll(/\b(20[2-9]\d)\b/g)) {
    const at = year.index ?? 0;
    const window = text.slice(Math.max(0, at - 24), at + year[1].length + 24);
    if (DELIVERY_WORD.test(window)) {
      params.deliveryYear = Number(year[1]);
      break;
    }
  }

  return params;
}
