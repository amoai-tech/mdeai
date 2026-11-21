export const DEFAULT_TRIP_TIMEZONE = "America/Bogota";

/** True only when Intl accepts the value as an IANA timezone. */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Never pass an unvalidated owner-controlled value to Intl. */
export function resolveTripTimeZone(
  timeZone: string | null | undefined,
): string {
  return isValidTimeZone(timeZone) ? timeZone! : DEFAULT_TRIP_TIMEZONE;
}
