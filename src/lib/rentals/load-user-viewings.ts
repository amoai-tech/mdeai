import { PERSONAL_LOAD_ERROR, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

export type RenterViewing = {
  id: string;
  apartmentId: string;
  apartmentTitle: string;
  neighborhood: string;
  scheduledAt: string;
  status: string;
};

/**
 * SAN-1426 — Read only saved viewing requests attached to this signed-in user.
 * Both predicates are necessary: Postgres RLS protects the underlying rows,
 * and the explicit lead.user_id filter prevents broker/admin-visible records
 * from appearing in a renter's personal history.
 *
 * Guest requests with leads.user_id=null are intentionally excluded; an email
 * or showing UUID alone is not authorization to expose private history.
 */
export async function loadUserViewings(userId: string): Promise<Result<RenterViewing[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("showings")
    .select("id, status, scheduled_at, lead:leads!inner(user_id), apartment:apartments(id,title,neighborhood)")
    .eq("lead.user_id", userId)
    .order("scheduled_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[rentals] loadUserViewings:", error.code, error.message);
    return { status: "error", message: PERSONAL_LOAD_ERROR };
  }

  const viewings: RenterViewing[] = [];
  for (const row of data ?? []) {
    // Supabase's inferred nested FK type is an array, while the runtime may
    // return a single object for a many-to-one relationship.
    const apartment = (
      Array.isArray(row.apartment) ? row.apartment[0] : row.apartment
    ) as { id: string; title: string; neighborhood: string } | null | undefined;
    if (!apartment) continue;
    viewings.push({
      id: row.id,
      apartmentId: apartment.id,
      apartmentTitle: apartment.title,
      neighborhood: apartment.neighborhood,
      scheduledAt: row.scheduled_at,
      status: row.status,
    });
  }

  return { status: "ok", value: viewings };
}
