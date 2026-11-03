/** Reject ambiguous COP separators rather than save 18.000 as 18. */
export function parseMenuPrice(raw: string): number | null {
  const input = raw.trim();
  if (!input) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(input)) {
    throw new Error("Enter a price as digits, e.g. 18000 or 18000.50 (no thousands separators)");
  }
  return Number(input);
}
