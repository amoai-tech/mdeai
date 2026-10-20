import { SignInRequired } from "@/components/auth/sign-in-required";
import { createClient } from "@/lib/supabase/server";
import { RentalTestModePanel } from "@/components/admin/rental-test-mode-panel";

export const metadata = {
  title: "Rental test mode · Admin · mdeai",
};

/**
 * Administrator rental testing mode. Server-gated: only signed-in admins
 * (is_admin()) see the panel; the API route enforces the same gate and keeps RLS
 * in force through the user-scoped client.
 */
export default async function AdminRentalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data } = await supabase.rpc("is_admin");
    isAdmin = data === true;
  }

  return (
    <main data-testid="admin-rentals-page" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">Rental test mode</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exercise the full rental workflow in production with explicitly test-marked listings.
          Test listings are never customer-visible and never marked independently verified.
        </p>
      </header>

      {!user ? (
        <SignInRequired
          buttonLabel="Sign in to use rental test mode"
          description="Sign in to exercise the rental workflow with explicitly test-marked listings."
          returnTo="/admin/rentals"
          testId="admin-sign-in-required"
          title="Admin sign-in required"
        />
      ) : !isAdmin ? (
        <p data-testid="admin-not-authorized" className="text-sm text-muted-foreground">
          Admin access required.
        </p>
      ) : (
        <RentalTestModePanel  />
      )}
    </main>
  );
}
