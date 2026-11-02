import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LandlordInboxList } from "@/components/host/rentals/landlord-inbox-list";
import { SignInRequired } from "@/components/auth/sign-in-required";

export const metadata = { title: "Rental inquiries · Admin · mdeai" };
export const dynamic = "force-dynamic";

/** Server-verified admin role; never use a service key or client-controlled role. */
export default async function AdminRentalInboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignInRequired title="Sign in required" description="Sign in to view inquiries."
    returnTo="/admin/rentals/inbox" buttonLabel="Sign in" />;
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError || isAdmin !== true) {
    return <main data-testid="admin-inbox-denied" className="p-6">Admin access required.</main>;
  }
  const { data, error } = await supabase.from("landlord_inbox")
    .select("id, apartment_id, renter_name, renter_email, raw_message, status, created_at, structured_profile")
    .order("created_at", { ascending: false }).limit(100);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6" data-testid="admin-rental-inbox">
      <Link href="/admin/rentals" className="text-sm text-primary">Back to rental administration</Link>
      <h1 className="font-serif text-2xl font-semibold">All rental inquiries</h1>
      {error ? <p role="alert">Could not load inquiries. Please refresh.</p> :
        <LandlordInboxList items={data ?? []} />}
    </main>
  );
}
