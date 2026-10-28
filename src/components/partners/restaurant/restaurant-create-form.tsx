"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * SAN-1540 — authorized "Add Restaurant" for the selected partner business.
 *
 * The server route derives authority from the session and the membership RPC; the
 * partner id is only a selector. Phase A adds no approval or ownership paperwork.
 */
export function RestaurantCreateForm({
  partnerId,
  businessName,
}: {
  partnerId: string;
  businessName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/partners/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, name }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; restaurantId?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success || !result.restaurantId) {
        throw new Error(result?.error?.message ?? "Could not add the restaurant");
      }
      router.push(
        `/app/partners/restaurants/${result.restaurantId}?partner=${encodeURIComponent(partnerId)}`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the restaurant");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        data-testid="restaurant-add-open"
        onClick={() => setOpen(true)}
      >
        Add Restaurant
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="restaurant-add-form"
      className="grid gap-3 rounded-2xl border border-border bg-background p-5"
    >
      <h3 className="text-base font-semibold">Add a restaurant for {businessName}</h3>
      <div className="grid gap-1.5">
        <Label htmlFor="restaurant-add-name">Restaurant name</Label>
        <Input
          id="restaurant-add-name"
          data-testid="restaurant-add-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={160}
          required
          disabled={saving}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          This creates a real listing record assigned to your business. Address, hours and photos
          can be filled in on the next screen.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive" data-testid="restaurant-add-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} className="min-h-11" data-testid="restaurant-add-submit">
          {saving ? "Creating…" : "Create restaurant"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
