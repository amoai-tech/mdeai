"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuItemRow } from "@/lib/restaurants/restaurant-owner-load";

type Draft = {
  id: string;
  section: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  position: number;
  sourceUrl: string;
};

const FIELD = "h-11 text-base md:text-sm";

function toDraft(item: MenuItemRow): Draft {
  return {
    id: item.id,
    section: item.section ?? "",
    name: item.name,
    description: item.description ?? "",
    price: item.price_amount === null ? "" : String(item.price_amount),
    currency: item.currency,
    position: item.position,
    sourceUrl: item.source_url ?? "",
  };
}

function toPayload(draft: Draft) {
  const parsedPrice = draft.price.trim() === "" ? null : Number(draft.price);
  return {
    section: draft.section.trim() || null,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    priceAmount: parsedPrice,
    currency: draft.currency.trim().toUpperCase(),
    position: draft.position,
    sourceUrl: draft.sourceUrl.trim() || null,
  };
}

/**
 * SAN-1541 — structured menu rows for one restaurant.
 *
 * Writes go through the authenticated route and are authorized by the database:
 * only the partner assigned to this restaurant can insert, update or delete.
 * Prices are shown exactly as stored; an empty price stays unknown.
 */
export function RestaurantMenuEditor({
  restaurantId,
  initialItems,
}: {
  restaurantId: string;
  initialItems: MenuItemRow[];
}) {
  const [items, setItems] = useState<Draft[]>(() => initialItems.map(toDraft));
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ section: "", name: "", price: "", currency: "COP", description: "" });

  const ordered = useMemo(
    () =>
      [...items].sort(
        (left, right) =>
          (left.section || "~").localeCompare(right.section || "~") ||
          left.position - right.position ||
          left.name.localeCompare(right.name),
      ),
    [items],
  );

  function update(id: string, patch: Partial<Draft>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setDirty((current) => ({ ...current, [id]: true }));
  }

  async function save(item: Draft) {
    setError(null);
    setSavingId(item.id);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/menu`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, ...toPayload(item) }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; item?: MenuItemRow; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success || !result.item) {
        throw new Error(result?.error?.message ?? "Could not save the menu item");
      }
      setItems((current) => current.map((entry) => (entry.id === item.id ? toDraft(result.item as MenuItemRow) : entry)));
      setDirty((current) => ({ ...current, [item.id]: false }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the menu item");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setSavingId(id);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/menu`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? "Could not remove the menu item");
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the menu item");
    } finally {
      setSavingId(null);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: newItem.section.trim() || null,
          name: newItem.name.trim(),
          description: newItem.description.trim() || null,
          priceAmount: newItem.price.trim() === "" ? null : Number(newItem.price),
          currency: newItem.currency.trim().toUpperCase(),
          position: items.length,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; item?: MenuItemRow; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success || !result.item) {
        throw new Error(result?.error?.message ?? "Could not add the menu item");
      }
      setItems((current) => [...current, toDraft(result.item as MenuItemRow)]);
      setNewItem({ section: "", name: "", price: "", currency: "COP", description: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the menu item");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-labelledby="restaurant-menu" data-testid="restaurant-menu-editor">
      <h3 id="restaurant-menu" className="text-base font-semibold">
        Menu
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Structured menu items with their exact price and currency. Leave the price empty when it is
        not published on the menu.
      </p>

      {ordered.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No menu items yet.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {ordered.map((item) => (
            <li key={item.id} className="grid gap-2 rounded-xl border border-border p-3" data-testid="restaurant-menu-item">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_6rem]">
                <Input
                  aria-label="Menu section"
                  value={item.section}
                  onChange={(event) => update(item.id, { section: event.target.value })}
                  placeholder="Section (e.g. Starters)"
                  maxLength={80}
                  className={FIELD}
                />
                <Input
                  aria-label="Menu item name"
                  value={item.name}
                  onChange={(event) => update(item.id, { name: event.target.value })}
                  maxLength={160}
                  className={FIELD}
                />
                <Input
                  aria-label="Menu item price"
                  value={item.price}
                  onChange={(event) => update(item.id, { price: event.target.value })}
                  inputMode="decimal"
                  placeholder="Price"
                  className={FIELD}
                />
                <Input
                  aria-label="Menu item currency"
                  value={item.currency}
                  onChange={(event) => update(item.id, { currency: event.target.value })}
                  maxLength={3}
                  className={FIELD}
                />
              </div>
              <Input
                aria-label="Menu item description"
                value={item.description}
                onChange={(event) => update(item.id, { description: event.target.value })}
                placeholder="Description (optional)"
                maxLength={600}
                className={FIELD}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`menu-position-${item.id}`} className="text-xs text-muted-foreground">
                  Order
                </Label>
                <Input
                  id={`menu-position-${item.id}`}
                  type="number"
                  min={0}
                  value={item.position}
                  onChange={(event) => update(item.id, { position: Number(event.target.value) || 0 })}
                  className="h-11 w-20"
                />
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={savingId === item.id || !dirty[item.id]}
                  onClick={() => void save(item)}
                >
                  {savingId === item.id ? "Saving…" : "Save item"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-destructive"
                  disabled={savingId === item.id}
                  onClick={() => void remove(item.id)}
                >
                  Remove
                </Button>
                {dirty[item.id] ? (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Saved</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 grid gap-2 rounded-xl border border-border p-3" data-testid="restaurant-menu-add">
        <h4 className="text-sm font-semibold">Add a menu item</h4>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_6rem]">
          <Input
            aria-label="New menu section"
            value={newItem.section}
            onChange={(event) => setNewItem({ ...newItem, section: event.target.value })}
            placeholder="Section"
            maxLength={80}
            className={FIELD}
          />
          <Input
            aria-label="New menu item name"
            value={newItem.name}
            onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
            placeholder="Item name"
            maxLength={160}
            required
            className={FIELD}
          />
          <Input
            aria-label="New menu item price"
            value={newItem.price}
            onChange={(event) => setNewItem({ ...newItem, price: event.target.value })}
            placeholder="Price"
            inputMode="decimal"
            className={FIELD}
          />
          <Input
            aria-label="New menu item currency"
            value={newItem.currency}
            onChange={(event) => setNewItem({ ...newItem, currency: event.target.value })}
            maxLength={3}
            className={FIELD}
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-11" disabled={adding || !newItem.name.trim()}>
          {adding ? "Adding…" : "Add item"}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="restaurant-menu-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
