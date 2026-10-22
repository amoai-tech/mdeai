import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty/empty-state";
import { resolveWorkspaceContexts } from "@/lib/app/resolve-workspace-contexts";
import type { WorkspaceContext } from "@/lib/app/workspace-contexts";

export const metadata = {
  title: "Your account · mdeai",
};

export const dynamic = "force-dynamic";

function WorkspaceCard({ context }: { context: WorkspaceContext }) {
  return (
    <li
      data-testid={`workspace-card-${context.kind}`}
      className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {context.label}
      </p>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        {context.description}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
        <Link
          href={context.href}
          className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open
          <span aria-hidden className="ml-1">
            →
          </span>
        </Link>
        {context.kind === "personal" ? (
          <Link
            href="/me/tickets"
            className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Tickets
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function WorkspaceLoadError({ message }: { message: string }) {
  return (
    <div
      data-testid="workspace-load-error"
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-6"
    >
      <p className="text-base font-semibold text-foreground">
        Your workspaces are temporarily unavailable
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        href="/app"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        Try again
      </Link>
    </div>
  );
}

/**
 * SAN-1575 — the launcher. It shows only destinations the server resolved for
 * this account; no counts, charts or placeholder cards are invented here.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppHomePage() {
  const resolution = await resolveWorkspaceContexts();

  if (resolution.status === "unauthenticated") {
    redirect("/login?next=/app");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Your account
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          One sign-in. Your workspaces.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Open a workspace to manage what you already own. Choosing one only
          changes where you are; it never changes what you can access.
        </p>
      </header>

      {resolution.status === "error" ? (
        <WorkspaceLoadError message={resolution.message} />
      ) : resolution.status === "none" ? (
        <EmptyState
          testId="workspace-empty"
          title="No workspaces yet"
          description="Your account does not have a business or team workspace. Explore MDE or create a partner profile to get started."
        />
      ) : (
        <ul
          data-testid="workspace-grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {resolution.contexts.map((context) => (
            <WorkspaceCard key={context.kind} context={context} />
          ))}
        </ul>
      )}
    </div>
  );
}
