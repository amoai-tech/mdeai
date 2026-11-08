/**
 * SAN-1391 — canonical resumable onboarding public surface.
 *
 * contracts/definitions/state are pure and isomorphic. drafts.ts is server-only
 * (it imports the cookie-backed Supabase server client), so import it directly
 * from server code when you need it rather than from a client component.
 */
export * from "./contracts";
export * from "./definitions";
export * from "./state";
export * from "./drafts";
