import { isHostOsShellRoute } from "@/lib/host/host-os-nav";

/**
 * SAN-1575 — routes that must NOT receive the root discovery `conciergeAgent`.
 *
 * Either the route has no agent, or it mounts its own scoped provider in a
 * layout. Mounting the root provider on top would open a second runtime and can
 * double a chat connection.
 *
 * `/app` is agentless in Phase 1: the shell is navigation only. `/app/events`
 * will render the Host OS shell (`hostOpsAgent`), so it must stay excluded from
 * the discovery provider. A future contextual `/app` chat mounts its own
 * provider inside the page that needs it.
 */
export function isAgentlessRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/") ||
    pathname === "/chat" ||
    pathname === "/host/event" ||
    pathname.startsWith("/host/event/") ||
    isHostOsShellRoute(pathname) ||
    pathname === "/app" ||
    pathname.startsWith("/app/")
  );
}
