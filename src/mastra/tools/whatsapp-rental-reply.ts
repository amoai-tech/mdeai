/**
 * A WhatsApp rental reply built from the SAME search results the web cards use.
 *
 * WhatsApp cannot render MDE's CopilotKit cards, and the concierge is correctly told not to
 * repeat card fields in prose for the web. So the channel needs the listings written out.
 *
 * Deterministic on purpose: the model must never reconstruct, re-price or invent a listing.
 * Nothing here converts currency, rounds a price, or assumes a field is present.
 */

export type WhatsAppRentalItem = {
  id?: string;
  title: string;
  /** Only the fields the formatter reads are required; the tool's extra result fields are allowed. */
  neighborhood: string;
  price_monthly?: number;
  currency: string;
  bedrooms: number;
  amenities: string[];
  tags: string[];
  source_url?: string;
  can_schedule_viewing: boolean;
  schedule_viewing_url?: string | null;
  nightly_price?: number;
  wifi?: boolean;
  image?: string;
  availability?: string;
  host_name?: string;
  latitude?: number;
  longitude?: number;
  rankScore?: number;
  evidenceText?: string | null;
};

export type MonthlyBudget = { amount: number; currency: string } | null;

/** Negations first: `"unfurnished".includes("furnished")` is true, which would mislead a renter. */
const UNFURNISHED_HINTS = ['unfurnished', 'not furnished', 'sin amoblar', 'sin muebles', 'no amoblado', 'no amoblada'];
const FURNISHED_HINTS = ['furnished', 'amoblado', 'amoblada', 'amueblado', 'con muebles'];

/** A real absolute http(s) URL with a hostname, or null. Never render a malformed link. */
export function safeListingUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  return trimmed;
}

/** The listing's own monthly asking price, exactly as stored — never rounded into a claim. */
export function formatMonthlyPrice(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  if (!Number.isFinite(amount)) return code;
  return `${code} ${Math.round(amount).toLocaleString('en-US')}`;
}

function values(item: WhatsAppRentalItem): string[] {
  return [...item.tags, ...item.amenities]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== '');
}

export function isFurnished(item: WhatsAppRentalItem): boolean {
  const hay = values(item);
  if (hay.some((value) => UNFURNISHED_HINTS.some((hint) => value.includes(hint)))) return false;
  return hay.some((value) => FURNISHED_HINTS.some((hint) => value.includes(hint)));
}

/** Owner-supplied claims carry a provenance label so a renter knows how much to trust them. */
export function isSelfAttested(item: WhatsAppRentalItem): boolean {
  return item.tags.some((tag) => tag.toLowerCase().includes('self-attested'));
}

/** Up to three meaningful amenities, without repeating the furnished signal. */
function shortAmenities(item: WhatsAppRentalItem): string[] {
  const furnished = isFurnished(item);
  return item.amenities
    .filter((amenity) => typeof amenity === 'string' && amenity.trim() !== '')
    .filter((amenity) => !(furnished && FURNISHED_HINTS.some((hint) => amenity.toLowerCase().includes(hint))))
    .slice(0, 3);
}

function priceLine(item: WhatsAppRentalItem): string {
  if (typeof item.price_monthly !== 'number' || !Number.isFinite(item.price_monthly)) {
    return 'price on request';
  }
  return `${formatMonthlyPrice(item.price_monthly, item.currency)}/month`;
}

/**
 * Every fact once, in a stable order. An unknown bedroom count stays visible: it is never
 * replaced by the neighborhood or silently rendered as "0 bedrooms".
 */
export function detailFacts(item: WhatsAppRentalItem): string[] {
  const facts: string[] = [];
  if (typeof item.bedrooms === 'number' && item.bedrooms >= 1) {
    facts.push(item.bedrooms === 1 ? '1 bedroom' : `${item.bedrooms} bedrooms`);
  } else {
    facts.push('bedrooms not confirmed');
  }
  if (isFurnished(item)) facts.push('furnished');
  for (const amenity of shortAmenities(item)) facts.push(amenity);
  if (isSelfAttested(item)) facts.push('owner-provided details');
  return facts;
}

export function detailLine(item: WhatsAppRentalItem): string {
  return detailFacts(item).join(' · ');
}

/** A listing is a confirmed match only when its own currency equals the budget's and it is inside it. */
export function isConfirmedBudgetMatch(item: WhatsAppRentalItem, budget: MonthlyBudget): boolean {
  if (!budget) return true;
  if (item.currency.toUpperCase() !== budget.currency.toUpperCase()) return false;
  return typeof item.price_monthly === 'number' && item.price_monthly <= budget.amount;
}

function renderItem(item: WhatsAppRentalItem, index: number): string[] {
  const facts = detailLine(item);
  const header = item.neighborhood ? `   ${item.neighborhood} · ${facts}` : `   ${facts}`;
  const lines = [`${index}. ${item.title} — ${priceLine(item)}`, header];
  const link = safeListingUrl(item.source_url);
  if (link) lines.push(`   ${link}`);
  const viewing = item.can_schedule_viewing ? safeListingUrl(item.schedule_viewing_url) : null;
  if (viewing) lines.push(`   Request a viewing: ${viewing}`);
  return lines;
}

/**
 * The message a WhatsApp customer receives. ONE total limit across confirmed and
 * other-currency listings, confirmed matches first, and an other-currency listing is never
 * described as within the budget.
 */
export function formatWhatsAppRentalReply(items: WhatsAppRentalItem[], budget: MonthlyBudget, max = 3): string {
  const confirmed = items.filter((item) => isConfirmedBudgetMatch(item, budget));
  const incomparable = budget
    ? items.filter((item) => item.currency.toUpperCase() !== budget.currency.toUpperCase())
    : [];
  const shown = confirmed.slice(0, max);
  const extras = incomparable.slice(0, Math.max(0, max - shown.length));

  if (shown.length === 0 && extras.length === 0) {
    return budget
      ? `I could not find an eligible listing at or below ${formatMonthlyPrice(budget.amount, budget.currency)}/month right now.`
      : 'I could not find an eligible listing that matches those filters right now.';
  }

  const where = shown[0]?.neighborhood ? ` in ${shown[0].neighborhood}` : '';
  const budgetLabel = budget ? ` under ${formatMonthlyPrice(budget.amount, budget.currency)}/month` : '';
  const header = shown.length > 0
    ? `Here ${shown.length === 1 ? 'is' : 'are'} ${shown.length} eligible option${shown.length === 1 ? '' : 's'}${where}${budgetLabel}:`
    : 'I did not find a listing in that currency within your budget, but here is what else is available:';

  const out = [header, '', ...shown.flatMap((item, i) => (i === 0 ? renderItem(item, i + 1) : ['', ...renderItem(item, i + 1)]))];

  if (extras.length > 0) {
    out.push('', 'Also available (priced in another currency — not compared to your budget):');
    extras.forEach((item, i) => {
      out.push(`${shown.length + i + 1}. ${item.title} — ${priceLine(item)}`);
      const link = safeListingUrl(item.source_url);
      if (link) out.push(`   ${link}`);
    });
  }
  return out.join('\n');
}

export const WHATSAPP_REPLY_INSTRUCTION =
  'When a tool result includes whatsapp_reply, send that text as your final answer, verbatim (you may add one short follow-up question on a new line). It already lists the real options with their own prices and links.';
