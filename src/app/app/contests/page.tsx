import { SignInRequired } from "@/components/auth/sign-in-required";
import {
  ContestAdminHeading,
  ContestAdminList,
} from "@/components/contests/contest-admin-list";
import { getAdminGate } from "@/lib/auth/admin-gate";

export const metadata = {
  title: "Contests · MDE Team · mdeai",
};

export const dynamic = "force-dynamic";

/**
 * SAN-1580 · MDE Team contest management inside the SAN-1575 /app shell.
 *
 * The shell is navigation, not authorization: this page re-reads the session and
 * the canonical `is_admin()` flag (admin **or** super_admin) before rendering any
 * row. Writes use the existing audited `/admin/contests` server actions.
 */
export default async function AppContestsPage() {
  const gate = await getAdminGate();

  return (
    <div className="max-w-5xl" data-testid="app-contests-page">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        MDE Team · Contests
      </p>
      <ContestAdminHeading />

      {gate.status === "guest" ? (
        <SignInRequired
          buttonLabel="Sign in to manage contests"
          description="Sign in to create contests and manage restaurant nominees."
          returnTo="/app/contests"
          testId="app-contest-sign-in-required"
          title="Admin sign-in required"
        />
      ) : gate.status === "denied" ? (
        <p data-testid="app-not-authorized" className="text-sm text-muted-foreground">
          Admin access required.
        </p>
      ) : (
        <ContestAdminList base="app" userId={gate.userId} />
      )}
    </div>
  );
}
