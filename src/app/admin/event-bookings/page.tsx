import { SignInRequired } from "@/components/auth/sign-in-required";
import { createClient } from "@/lib/supabase/server";
import { EventBookingsQueue } from "@/components/admin/event-bookings-queue";

export const metadata = {
  title: "Event requests · Admin · mdeai",
};

/**
 * SAN-502 · EVT-043 — Patricia admin queue (event requests).
 * Server-gated: only signed-in admins (is_admin()) see the queue; the queue's
 * data + actions are additionally enforced by the API route.
 */
export default async function AdminEventBookingsPage() {
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
    <main
      data-testid="admin-event-bookings-page"
      className="mx-auto min-h-screen max-w-4xl px-4 py-8"
    >
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">Event requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve, decline, or ask for more info on event venue proposals.
        </p>
      </header>

      {!user ? (
        <SignInRequired
          buttonLabel="Sign in to review event requests"
          description="Sign in to approve, decline, or ask for more info on event venue proposals."
          returnTo="/admin/event-bookings"
          testId="admin-sign-in-required"
          title="Admin sign-in required"
        />
      ) : !isAdmin ? (
        <p
          data-testid="admin-not-authorized"
          className="text-sm text-muted-foreground"
        >
          Admin access required.
        </p>
      ) : (
        <EventBookingsQueue />
      )}
    </main>
  );
}
