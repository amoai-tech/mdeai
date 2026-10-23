/**
 * Provider-level CopilotKit failures include the anonymous `/api/copilotkit/info`
 * probe, which returns 401 before the visitor has done anything. Reporting that as
 * a concierge failure shows "Something went wrong" on a fresh public chat.
 *
 * Genuine failures still surface for a verified signed-in session. Signed-out AI
 * attempts are gated by the sign-in CTA instead of an error notice.
 */
export function shouldReportConciergeProviderError(
  hasUser: boolean,
  sessionLoading: boolean,
): boolean {
  return hasUser && !sessionLoading;
}
