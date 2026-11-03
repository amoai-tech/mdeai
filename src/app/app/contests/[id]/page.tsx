import { SignInRequired } from "@/components/auth/sign-in-required";
import { AccountLoadError } from "@/components/app/load-error";
import { ContestAdminDetailView } from "@/components/contests/contest-admin-detail";
import { getAdminGate } from "@/lib/auth/admin-gate";

export const metadata = {
  title: "Contest · MDE Team · mdeai",
};

export const dynamic = "force-dynamic";

/**
 * SAN-1580 · one contest inside the /app shell.
 *
 * Same rule as the list: the page re-checks the session and `is_admin()` before
 * reading the contest. A foreign or missing id reaches the shared `notFound()`
 * only after that gate, so no existence is leaked to an unauthorized visitor.
 */
export default async function AppContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await getAdminGate();

  if (gate.status === "guest") {
    return (
      <div className="max-w-3xl" data-testid="app-contest-detail">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <div className="mt-3">
          <SignInRequired
            buttonLabel="Sign in to manage this contest"
            description="Sign in to edit this contest and manage its nominees."
            returnTo={"/app/contests/" + id}
            testId="app-contest-sign-in-required"
            title="Admin sign-in required"
          />
        </div>
      </div>
    );
  }

  if (gate.status === "error") {
    return (
      <div className="max-w-3xl" data-testid="app-contest-detail">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <div className="mt-4">
          <AccountLoadError
            message={gate.message}
            retryHref={`/app/contests/${id}`}
            title="We could not check admin access"
          />
        </div>
      </div>
    );
  }

  if (gate.status === "denied") {
    return (
      <div className="max-w-3xl" data-testid="app-contest-detail">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <p data-testid="app-not-authorized" className="mt-2 text-sm text-muted-foreground">
          Admin access required.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl" data-testid="app-contest-detail">
      <ContestAdminDetailView base="app" contestId={id} userId={gate.userId} />
    </div>
  );
}
