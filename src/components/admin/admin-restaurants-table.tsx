"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RestaurantAdminAssignment } from "@/components/partners/restaurant/restaurant-admin-assignment";

export type AdminPartnerOption = { id: string; name: string };
export type AdminRestaurantRow = {
  id: string; name: string; neighborhood: string | null; city: string | null;
  address: string | null; source: string; placeId: string | null;
  partnerId: string | null; active: boolean; suggestedPartnerIds: string[];
};

/** Read-only Google Place ID suggestions never set partnerId. */
export function AdminRestaurantsTable({ rows, partners, canTransfer }: {
  rows: AdminRestaurantRow[]; partners: AdminPartnerOption[]; canTransfer: boolean;
}) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(partners.map((p) => [p.id,p.name])),[partners]);
  const filtered = rows.filter((row) =>
    [row.name,row.neighborhood,row.city,row.address].some((value) =>
      value?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())));
  return <div className="space-y-3">
    <label htmlFor="restaurant-search" className="block text-sm font-medium">Search restaurants</label>
    <input id="restaurant-search" type="search" placeholder="Name or neighborhood" value={search}
      onChange={(e)=>setSearch(e.target.value)} className="min-h-11 w-full max-w-lg rounded-md border border-border bg-background px-3 text-sm"/>
    <p className="text-xs text-muted-foreground" role="status">Showing {filtered.length} of {rows.length} restaurants</p>
    {filtered.length === 0 ? <p className="rounded-lg border p-5" data-testid="admin-restaurants-empty">No restaurants match this search.</p> :
      <ul className="space-y-3" data-testid="admin-restaurants-list">{filtered.map((row) => {
        const assignedName = row.partnerId ? byId.get(row.partnerId) ?? `Partner ${row.partnerId.slice(0,8)}` : "MDE-managed · No partner assigned";
        const expanded = openId === row.id;
        return <li key={row.id} className="rounded-xl border border-border bg-background p-4" data-testid="admin-restaurant-row">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="font-semibold">{row.name}</h2>
              <p className="text-sm text-muted-foreground">{[row.neighborhood,row.city].filter(Boolean).join(" · ") || "Location not recorded"} · {row.active ? "Active" : "Inactive"}</p>
              <p className="text-sm">{assignedName}</p>
              <p className="text-xs text-muted-foreground">Source: {row.source}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Link className="underline" href={`/app/partners/restaurants/${row.id}`}>Edit listing</Link>
              <button type="button" className="min-h-11 rounded-lg border border-border px-3 hover:bg-muted"
                aria-expanded={expanded} aria-controls={`restaurant-admin-detail-${row.id}`}
                onClick={()=>setOpenId(expanded?null:row.id)}>{expanded?"Close":"Manage"}</button>
            </div>
          </div>
          {expanded && <div id={`restaurant-admin-detail-${row.id}`} className="mt-4 space-y-3 border-t border-border pt-4">
            <p className="break-words text-xs text-muted-foreground">Address: {row.address || "Unknown"} · Google Place ID: {row.placeId || "Not recorded"}</p>
            {row.suggestedPartnerIds.length > 0 && <div className="rounded-md bg-muted p-3 text-xs">
              <strong>Possible Place ID match (suggestion only):</strong> {row.suggestedPartnerIds.map((id)=>byId.get(id) ?? `Partner ${id.slice(0,8)}`).join(", ")}.
              This never grants access or changes an assignment.
            </div>}
            {canTransfer ? <RestaurantAdminAssignment restaurantId={row.id} assignedPartnerId={row.partnerId} partners={partners}/> :
              <p className="text-sm text-muted-foreground">Only Super Admin can transfer restaurant management.</p>}
          </div>}
        </li>;
      })}</ul>}
  </div>;
}
