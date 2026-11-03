/**
 * Why a signed-out visitor is asked to sign in. The AI runtime answers 401 to anyone without an
 * account on purpose (per-user thread isolation, SAN-547), so "try again" would never work. The
 * searches that need no account (rentals, events, restaurants, cafés) use the fast paths and never
 * reach this.
 */
export const SIGN_IN_REQUIRED_MESSAGE =
  "Your question is above. The AI concierge needs an account; searches for rentals, events, restaurants and cafés work without one.";
