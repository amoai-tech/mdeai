/**
 * SAN-1089 — "the search could not run" is not "there are no rentals".
 *
 * Rental search used to answer a missing client or a failed query with invented demo
 * apartments (or an empty list labelled `source: "mock"`). A renter could not tell an
 * outage from an empty marketplace, and could be shown stock that does not exist.
 *
 * Every rental search entry point now throws this error when the real database could not be
 * read. A healthy query that matches nothing still resolves with `results: []`.
 */
export const RENTAL_SEARCH_UNAVAILABLE_CODE = "rental_search_unavailable" as const;

export class RentalSearchUnavailableError extends Error {
  readonly code = RENTAL_SEARCH_UNAVAILABLE_CODE;

  /**
   * @param reason Short, sanitized diagnostic for server logs. Never put credentials,
   *               user text or row data here.
   */
  constructor(readonly reason: string) {
    super(`${RENTAL_SEARCH_UNAVAILABLE_CODE}: ${reason}`);
    this.name = "RentalSearchUnavailableError";
  }
}

export function isRentalSearchUnavailable(error: unknown): error is RentalSearchUnavailableError {
  return error instanceof RentalSearchUnavailableError;
}
