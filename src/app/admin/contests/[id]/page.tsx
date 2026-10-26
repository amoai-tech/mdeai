import { SignInRequired } from "@/components/auth/sign-in-required";
import { AccountLoadError } from "@/components/app/load-error";
import { ContestAdminDetailView } from "@/components/contests/contest-admin-detail";
import { getAdminGate } from "@/lib/auth/admin-gate";

export const dynamic = "force-dynamic";

/**
 * SAN-1526 · legacy edit-one-contest route.
 *
 * SAN-1580 · the authorized body is the same `ContestAdminDetailView` used by
 * `/app/contests/[id]`; this route keeps its legacy shell, prompts and return path.
 */
export default async function AdminContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await getAdminGate();

  if (gate.status === "guest") {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <div className="mt-3">
          <SignInRequired
            buttonLabel="Sign in to manage this contest"
            description="Sign in to edit this contest and manage its nominees."
            returnTo={"/admin/contests/" + id}
            testId="admin-sign-in-required"
            title="Admin sign-in required"
          />
        </div>
      </main>
    );
  }

  if (gate.status === "error") {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <div className="mt-4">
          <AccountLoadError
            message={gate.message}
            retryHref={`/admin/contests/${id}`}
            title="We could not check admin access"
          />
        </div>
      </main>
    );
  }

  if (gate.status === "denied") {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <p data-testid="admin-not-authorized" className="mt-2 text-sm text-muted-foreground">
          Admin access required.
        </p>
      </main>
    );
  }

  return (
    <main data-testid="admin-contest-detail" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <ContestAdminDetailView base="admin" contestId={id} userId={gate.userId} />
    </main>
  );
}
