"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import {
  activeWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/app/workspace-contexts";
import type { WorkspaceResolution } from "@/lib/app/resolve-workspace-contexts";

type AppShellProps = {
  resolution: WorkspaceResolution;
  children: ReactNode;
};

/**
 * SAN-1575 — the one account shell. It renders the resolved workspace switcher,
 * the account identity and one link back to discovery. It deliberately mounts no
 * CopilotKit provider: Phase 1 has no chat here, and /app/events owns its own
 * hostOpsAgent provider.
 */
export function AppShell({ resolution, children }: AppShellProps) {
  const pathname = usePathname();
  const contexts: WorkspaceContext[] =
    resolution.status === "ok" ? resolution.contexts : [];
  const email =
    resolution.status === "ok" || resolution.status === "none"
      ? resolution.email
      : null;
  const active = activeWorkspaceContext(pathname, contexts);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 text-lg font-extrabold tracking-[-0.04em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            mde·ai
          </Link>

          <WorkspaceSwitcher contexts={contexts} active={active} />

          <nav
            aria-label="Account"
            className="ml-auto flex items-center gap-1 sm:gap-2"
          >
            <Link
              href="/"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Explore
            </Link>
            <Link
              href="/chat"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Ask MDE
            </Link>
            {email ? (
              <span
                data-testid="app-shell-email"
                className="hidden max-w-[12rem] truncate text-xs text-muted-foreground md:block"
              >
                {email}
              </span>
            ) : null}
            <SignOutButton />
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"
      >
        {children}
      </main>
    </div>
  );
}
