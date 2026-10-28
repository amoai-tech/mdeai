"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** SAN-1604 — a reviewable, explicit transfer. The RPC, never this UI, grants authority. */
export function RestaurantAdminAssignment({ restaurantId, assignedPartnerId, partners }: {
  restaurantId: string;
  assignedPartnerId: string | null;
  partners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [currentId, setCurrentId] = useState(assignedPartnerId);
  const [value, setValue] = useState(assignedPartnerId ?? "");
  const [reason, setReason] = useState("Restaurant partner management handoff");
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = value || null;
  const partnerName = partners.find((partner) => partner.id === selected)?.name ?? "MDE-managed (no partner)";
  const changed = selected !== currentId;

  async function submit() {
    if (saving || !reviewing || !changed) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/assignment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: selected, expectedPartnerId: currentId, reason }),
      });
      const result = await response.json().catch(() => null) as
        | { success?: boolean; partnerId?: string | null; changed?: boolean; auditId?: string | null; error?: { message?: string } } | null;
      if (!response.ok || !result?.success || result.partnerId !== selected ||
        (result.changed && !result.auditId)) {
        throw new Error(result?.error?.message ?? "Could not confirm the saved assignment");
      }
      setCurrentId(selected); setReviewing(false); setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not transfer restaurant");
      setReviewing(false);
    } finally { setSaving(false); }
  }

  return (
    <section aria-label="Restaurant partner assignment" data-testid="restaurant-admin-assignment"
      className="rounded-xl border border-border bg-background-elevated p-4">
      <h3 className="text-sm font-semibold">Assign partner</h3>
      <p className="mt-1 text-xs text-muted-foreground">MDE manages unassigned records. This transfers listing management, not legal ownership.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid min-w-0 gap-1">
          <Label htmlFor={`restaurant-assign-${restaurantId}`}>Partner account</Label>
          <select id={`restaurant-assign-${restaurantId}`} data-testid="restaurant-assign-partner"
            className="min-h-11 min-w-0 rounded-md border border-border bg-background px-3 text-sm"
            value={value} disabled={saving}
            onChange={(e) => {setValue(e.target.value);setReviewing(false);setError(null);setSaved(false);}}>
            <option value="">MDE-managed (unassigned)</option>
            {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </select>
        </div>
        <Button type="button" variant="outline" className="min-h-11" disabled={saving || !changed}
          onClick={() => { setReviewing(true); setSaved(false); setError(null); }}>Review change</Button>
      </div>
      {reviewing && <div className="mt-3 grid gap-2 rounded-md border border-border p-3" data-testid="restaurant-assignment-review">
        <p className="text-sm">Transfer management to <strong>{partnerName}</strong>?</p>
        <Label htmlFor={`transfer-reason-${restaurantId}`}>Reason for audit</Label>
        <input id={`transfer-reason-${restaurantId}`} className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
          value={reason} maxLength={240} disabled={saving} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={saving || !reason.trim()} onClick={submit}>
            {saving ? "Transferring…" : "Confirm transfer"}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => setReviewing(false)}>Cancel</Button>
        </div>
      </div>}
      {saved && <p role="status" data-testid="restaurant-assignment-saved" className="mt-2 text-sm">Saved in Supabase.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
