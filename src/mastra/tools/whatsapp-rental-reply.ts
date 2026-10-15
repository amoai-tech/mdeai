/**
 * A WhatsApp rental reply built from the SAME search results the web cards use.
 *
 * WhatsApp cannot render MDE's CopilotKit cards, and the concierge is correctly told not to
 * repeat card fields in prose for the web. So the channel needs the listings written out:
 * title, neighborhood, the listing's own monthly price, bedrooms, verified amenities and a
 * real link. This module is deterministic on purpose — the model must never reconstruct,
 * re-price or invent a listing.
 *
 * Nothing here converts currency or invents a field: an unknown price is omitted, an
 * other-currency listing is never labelled as within the budget, and a link is only shown when
 * it is a real http(s) URL.
 */

export type WhatsAppRentalItem = {
  title: string;
  neighborhood: string;
  price_monthly?: number;
  currency: string;
  bedrooms: number;
  amenities: string[];
  tags: string[];
  source_url: string;
  can_schedule_viewing: boolean;
  schedule_viewing_url: string | null;
};

export type MonthlyBudget = { amount: number; currency: string } | null;

const FURNISHED_HINTS = ['furnished', 'amoblado', 'amoblada', 'fully furnished'];

/** A real absolute http(s) URL, or null. Never render a relative or malformed link to a customer. */
export function safeListingUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed;
}

/** `2900000` + COP → `COP 2.9M`; small values keep their digits. */
export function formatMonthlyPrice(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  if (!Number.isFinite(amount)) return code;
  if (amount >= 1_000_000) return `${code} ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${code} ${Math.round(amount).toLocaleString('en-US')}`;
}

export function isFurnished(item: WhatsAppRentalItem): boolean {
  const haystack = [...item.tags, ...item.amenities].map((v) => v.toLowerCase());
  return haystack.some((value) => FURNISHED_HINTS.some((hint) => value.includes(hint)));
}

/** Up to three meaningful amenities, without repeating the furnished/neighborhood signal. */
function shortAmenities(item: WhatsAppRentalItem): string[] {
  const furnished = isFurnished(item);
  return item.amenities
    .filter((amenity) => amenity.trim() !== '')
    .filter((amenity) => !(furnished && FURNISHED_HINTS.some((hint) => amenity.toLowerCase().includes(hint))))
    .slice(0, 3);
}

function priceLine(item: WhatsAppRentalItem): string {
  if (typeof item.price_monthly !== 'number' || !Number.isFinite(item.price_monthly)) {
    return 'price on request';
  }
  return `${formatMonthlyPrice(item.price_monthly, item.currency)}/month`;
}

function detailLines(item: WhatsAppRentalItem): string {
  const facts: string[] = [];
  facts.push(item.bedrooms === 1 ? '1 bedroom' : `${item.bedrooms} bedrooms`);
  if (isFurnished(item)) facts.push('furnished');
  for (const amenity of shortAmenities(item)) facts.push(amenity);
  return facts.join(' · ');
}

/** A listing is a confirmed match only when its own currency equals the budget's and it is inside it. */
export function isConfirmedBudgetMatch(item: WhatsAppRentalItem, budget: MonthlyBudget): boolean {
  if (!budget) return true;
  if (item.currency.toUpperCase() !== budget.currency.toUpperCase()) return false;
  return typeof item.price_monthly === 'number' && item.price_monthly <= budget.amount;
}

function renderItem(item: WhatsAppRentalItem, index: number): string[] {
  const lines = [`${index}. ${item.title} — ${priceLine(item)}`, `   ${detailLines(item)}`];
  if (item.bedrooms < 1) lines[1] = `   bedrooms not confirmed`;
  if (item.neighborhood) lines[1] = `   ${item.neighborhood} · ${detailLines(item)}`;
  const link = safeListingUrl(item.source_url);
  if (link) lines.push(`   ${link}`);
  const viewing = item.can_schedule_viewing ? safeListingUrl(item.schedule_viewing_url) : null;
  if (viewing) lines.push(`   Request a viewing: ${viewing}`);
  return lines;
}

/**
 * The message a WhatsApp customer receives. At most three options, confirmed budget matches
 * first, other-currency listings kept but explicitly NOT compared to the budget.
 */
export function formatWhatsAppRentalReply(items: WhatsAppRentalItem[], budget: MonthlyBudget, max = 3): string {
  const confirmed = items.filter((item) => isConfirmedBudgetMatch(item, budget));
  const incomparable = budget
    ? items.filter((item) => item.currency.toUpperCase() !== budget.currency.toUpperCase())
    : [];
  const shown = confirmed.slice(0, max);

  if (shown.length === 0 && incomparable.length === 0) {
    return budget
      ? `I could not find an eligible listing at or below ${formatMonthlyPrice(budget.amount, budget.currency)}/month right now.`
      : 'I could not find an eligible listing that matches those filters right now.';
  }

  const where = shown[0]?.neighborhood ? ` in ${shown[0].neighborhood}` : '';
  const budgetLabel = budget ? ` under ${formatMonthlyPrice(budget.amount, budget.currency)}/month` : '';
  const header = shown.length > 0
    ? `Here ${shown.length === 1 ? 'is' : 'are'} ${shown.length} eligible option${shown.length === 1 ? '' : 's'}${where}${budgetLabel}:`
    : 'I did not find a listing in that currency within your budget, but here is what else is available:';

  const blocks = shown.map((item, i) => renderItem(item, i + 1));
  const out = [header, '', ...blocks.flatMap((b, i) => (i === 0 ? b : ['', ...b]))];

  if (incomparable.length > 0) {
    out.push('', 'Also available (priced in another currency — not compared to your budget):');
    const extras = incomparable.slice(0, max);
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
