import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRestaurantsTable, type AdminRestaurantRow, type AdminPartnerOption } from "@/components/admin/admin-restaurants-table";
import { getAdminGate } from "@/lib/auth/admin-gate";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Restaurant Management · MDE Team" };
export const dynamic = "force-dynamic";

/** SAN-1604 — MDE Team sees catalog; only Super Admin changes assignments. */
export default async function AdminRestaurantsPage() {
  const gate = await getAdminGate();
  if (gate.status === "guest") redirect("/login?next=/app/admin/restaurants");
  if (gate.status !== "ok") return <section role="alert" data-testid="admin-restaurants-denied">
    {gate.status === "error" ? gate.message : "MDE Team access required."}
  </section>;
  const supabase = await createClient();
  const [restaurantQuery, partnerQuery, locationQuery, superQuery] = await Promise.all([
    supabase.from("restaurants").select("id,name,neighborhood,city,address,source,google_place_id,partner_id,is_active")
      .order("name", { ascending: true }),
    supabase.from("partners").select("id,settings").order("created_at",{ascending:true}).limit(200),
    supabase.from("partner_locations").select("partner_id,google_place_id,label").not("google_place_id","is",null).limit(200),
    supabase.rpc("has_role",{_user_id:gate.userId,_role:"super_admin"}),
  ]);
  if (restaurantQuery.error || partnerQuery.error || locationQuery.error || superQuery.error) {
    console.error("[admin-restaurants] loading failed", restaurantQuery.error?.code, partnerQuery.error?.code, locationQuery.error?.code, superQuery.error?.code);
    return <section role="alert" data-testid="admin-restaurants-error">Could not load restaurant management. Refresh to retry.</section>;
  }
  const partners: AdminPartnerOption[] = (partnerQuery.data ?? []).map((item) => {
    const settings = (item.settings ?? {}) as Record<string,unknown>;
    return { id:item.id, name:typeof settings.businessName === "string" && settings.businessName.trim() ? settings.businessName.trim(): `Partner ${item.id.slice(0,8)}` };
  });
  const matchByPlace = new Map<string,string[]>();
  for (const location of locationQuery.data ?? []) {
    if (!location.google_place_id) continue;
    const matches = matchByPlace.get(location.google_place_id) ?? [];
    if (!matches.includes(location.partner_id)) matches.push(location.partner_id);
    matchByPlace.set(location.google_place_id,matches);
  }
  const rows: AdminRestaurantRow[] = (restaurantQuery.data ?? []).map((row) => ({
    id:row.id, name:row.name, neighborhood:row.neighborhood,city:row.city,
    address:row.address, source:row.source, placeId:row.google_place_id,
    partnerId:row.partner_id, active:row.is_active,
    suggestedPartnerIds: row.google_place_id ? (matchByPlace.get(row.google_place_id) ?? []) : [],
  }));
  return <section className="space-y-5" data-testid="admin-restaurants">
    <div className="space-y-2">
      <Link href="/app" className="text-sm underline">MDE Team</Link>
      <h1 className="font-serif text-3xl font-semibold">Restaurant Management</h1>
      <p className="text-sm text-muted-foreground">{rows.length} real restaurants · {rows.filter((r)=>r.partnerId===null).length} MDE-managed. This describes administration, not restaurant ownership.</p>
    </div>
    <AdminRestaurantsTable rows={rows} partners={partners} canTransfer={superQuery.data === true}/>
  </section>;
}
