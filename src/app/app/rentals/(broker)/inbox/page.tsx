import Link from "next/link";
import { LandlordInboxList } from "@/components/host/rentals/landlord-inbox-list";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Rental inquiries · mdeai" };
export const dynamic = "force-dynamic";

/** Host identity from the broker layout; user-scoped SQL and RLS isolate rows. */
export default async function RentalHostInboxPage() {
  const ctx = await getBrokerContext();
  if (ctx.state !== "authorized") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("landlord_inbox")
    .select("id, apartment_id, renter_name, renter_email, raw_message, status, created_at, structured_profile")
    .eq("landlord_id", ctx.landlordProfile.id)
    .order("created_at", { ascending: false }).limit(100);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6" data-testid="host-rental-inbox">
      <Link href="/app/rentals" className="text-sm text-primary">Back to rentals</Link>
      <h1 className="font-serif text-2xl font-semibold">Host inquiries</h1>
      {error ? <p role="alert">Could not load inquiries. Please refresh.</p> :
        <LandlordInboxList items={data ?? []} />}
    </main>
  );
}
