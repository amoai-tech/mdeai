/**
 * SAN-1580 · the only two contest-management base paths.
 *
 * The browser submits a short, fixed token (`admin` or `app`), never a URL. The
 * server maps it to a known destination, so a forged form field cannot turn the
 * post-create redirect into an open redirect.
 */
export const CONTEST_MANAGEMENT_BASES = {
  admin: "/admin/contests",
  app: "/app/contests",
} as const;

export type ContestManagementBase = keyof typeof CONTEST_MANAGEMENT_BASES;

export function contestBaseToken(value: unknown): ContestManagementBase {
  return value === "app" ? "app" : "admin";
}

export function contestBasePath(token: ContestManagementBase): string {
  return CONTEST_MANAGEMENT_BASES[token];
}

/** Where a successful create must land, derived server-side from the token. */
export function contestDetailHref(
  token: ContestManagementBase,
  contestId: string,
): string {
  return CONTEST_MANAGEMENT_BASES[token] + "/" + contestId;
}
