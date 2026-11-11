/** Event IDs are UUIDs; only a real UUID may become a prompt hint. */
export const EVENT_A2UI_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_A2UI_ID = EVENT_A2UI_ID_PATTERN;

export function isEventA2UIId(value: unknown): value is string {
  return typeof value === "string" && EVENT_A2UI_ID.test(value);
}
