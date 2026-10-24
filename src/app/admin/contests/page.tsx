import { SignInRequired } from "@/components/auth/sign-in-required";
import {
  ContestAdminHeading,
  ContestAdminList,
} from "@/components/contests/contest-admin-list";
import { getAdminGate } from "@/lib/auth/admin-gate";

export const metadata = {
  title: "Contests · Admin · mdeai",
};

/**
 * SAN-1526 · legacy Super Admin contest list + create.
 * Server-gated: only signed-in admins reach the data, and every write goes through a server
 * action that re-checks the role before calling a service-role RPC.
 *
 * SAN-1580 · the authorized body is the same `ContestAdminList` component used by
 * `/app/contests`; this route only supplies its own shell and its legacy return path.
 */
export default async function AdminContestsPage() {
  const gate = await getAdminGate();

  return (
    <main data-testid="admin-contests-page" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <ContestAdminHeading />

      {gate.status === "guest" ? (
        <SignInRequired
          buttonLabel="Sign in to manage contests"
          description="Sign in to create contests and manage restaurant nominees."
          returnTo="/admin/contests"
          testId="admin-sign-in-required"
          title="Admin sign-in required"
        />
      ) : gate.status === "denied" ? (
        <p data-testid="admin-not-authorized" className="text-sm text-muted-foreground">
          Admin access required.
        </p>
      ) : (
        <ContestAdminList base="admin" userId={gate.userId} />
      )}
    </main>
  );
}
