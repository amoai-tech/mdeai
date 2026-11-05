/** Opaque listing IDs: UUIDs or provider slugs such as candidate-fincaraiz-123. */
const RENTAL_A2UI_ID = /^(?=[A-Za-z0-9_-]*[A-Za-z0-9])[A-Za-z0-9_-]{1,64}$/;

/**
 * A browser-supplied ID may enter a bounded prompt hint only if it is a safe
 * opaque token. Spaces, punctuation and instruction-shaped text are rejected;
 * the catalog still re-resolves the ID against authorized results.
 */
export function isRentalA2UIId(value: unknown): value is string {
  return typeof value === "string" && RENTAL_A2UI_ID.test(value);
}
