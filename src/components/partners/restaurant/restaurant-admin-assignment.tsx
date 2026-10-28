"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * SAN-1540 — MDE Team assignment control.
 *
 * The route calls `restaurant_assign_partner`, which checks `is_admin()` in the
 * database, so hiding this panel is convenience, not security.
 */
export function RestaurantAdminAssignment({
  restaurantId,
  assignedPartnerId,
  partners,
}: {
  restaurantId: string;
  assignedPartnerId: string | null;
  partners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(assignedPartnerId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: value || null }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? "Could not assign the restaurant");
      }
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assign the restaurant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="restaurant-assignment"
      data-testid="restaurant-admin-assignment"
      className="rounded-2xl border border-border bg-background-elevated p-4"
    >
      <h3 id="restaurant-assignment" className="text-base font-semibold">
        MDE Team · partner assignment
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The assigned business is the only account that can edit this listing. No ownership
        paperwork is required during development.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="restaurant-assign-partner">Assigned business</Label>
          <select
            id="restaurant-assign-partner"
            data-testid="restaurant-assign-partner"
            value={value}
            disabled={saving}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Unassigned</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" className="min-h-11" disabled={saving}>
          {saving ? "Saving…" : "Save assignment"}
        </Button>
      </form>
      {saved ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="restaurant-assignment-saved">
          Assignment saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
