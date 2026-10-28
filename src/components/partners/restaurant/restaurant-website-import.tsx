"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RestaurantListingValues } from "@/lib/restaurants/restaurant-owner-schema";

type Draft = {
  name?: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  price_level?: number;
  hours_of_operation?: Record<string, { open: string; close: string }>;
  cuisine_types?: string[];
  unknownFields: string[];
  sources: string[];
  retrievedAt: string;
};

const LABELS: Record<string, string> = {
  name: "Restaurant name",
  description: "Description",
  website: "Website",
  phone: "Phone",
  email: "Email",
  address: "Address",
  neighborhood: "Neighborhood",
  city: "City",
  price_level: "Price level",
  hours_of_operation: "Opening hours",
  cuisine_types: "Cuisine",
};

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

/**
 * SAN-1542 — sourced website import shown as a reviewable proposal.
 *
 * Nothing here writes to the database. "Apply to form" only fills the existing
 * editor fields, and the operator still presses Save, which goes through the same
 * authorized `restaurant_owner_patch` path as a manual edit.
 */
export function RestaurantWebsiteImport({
  restaurantId,
  defaultWebsite,
  onApply,
}: {
  restaurantId: string;
  defaultWebsite?: string;
  onApply: (patch: Partial<RestaurantListingValues>) => void;
}) {
  const [url, setUrl] = useState(defaultWebsite ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applied, setApplied] = useState(false);

  async function read(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDraft(null);
    setApplied(false);
    setLoading(true);
    try {
      const response = await fetch(`/api/partners/restaurants/${restaurantId}/website-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; draft?: Draft; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success || !result.draft) {
        throw new Error(result?.error?.message ?? "Could not read that website");
      }
      setDraft(result.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that website");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!draft) return;
    const patch: Partial<RestaurantListingValues> = {};
    for (const key of [
      "name",
      "description",
      "website",
      "phone",
      "email",
      "address",
      "neighborhood",
      "city",
      "price_level",
      "hours_of_operation",
      "cuisine_types",
    ] as const) {
      const value = draft[key];
      if (value !== undefined && value !== null) {
        // The proposal shape is validated by the server before it reaches here.
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    onApply(patch);
    setApplied(true);
  }

  const entries = draft
    ? Object.entries(LABELS).filter(([field]) => {
        const value = (draft as unknown as Record<string, unknown>)[field];
        return value !== undefined && value !== null && value !== "";
      })
    : [];

  return (
    <section aria-labelledby="restaurant-website-import" data-testid="restaurant-website-import">
      <h3 id="restaurant-website-import" className="text-base font-semibold">
        Import from your website
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        We read one public page and propose only what it states. Review the suggestion, apply it to
        the form, then save. Nothing is written automatically.
      </p>

      <form onSubmit={read} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="restaurant-import-url">Restaurant website</Label>
          <Input
            id="restaurant-import-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://restaurant.example"
            maxLength={300}
            disabled={loading}
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-11" disabled={loading || !url.trim()}>
          {loading ? "Reading…" : "Read website"}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="restaurant-import-error">
          {error}
        </p>
      ) : null}

      {draft ? (
        <div className="mt-3 rounded-xl border border-border p-4" data-testid="restaurant-import-proposal">
          <p className="text-sm font-semibold">Suggested changes (review before saving)</p>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              The page was read but no editable listing fact was found.
            </p>
          ) : (
            <dl className="mt-2 grid gap-1 text-sm">
              {entries.map(([field, label]) => (
                <div key={field} className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
                  <dt className="font-medium">{label}</dt>
                  <dd className="break-words text-muted-foreground">
                    {display((draft as unknown as Record<string, unknown>)[field])}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sources read
            </p>
            <ul className="mt-1 grid gap-1 text-xs">
              {draft.sources.map((source) => (
                <li key={source}>
                  <a href={source} target="_blank" rel="noopener noreferrer" className="underline">
                    {source}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              Retrieved {new Date(draft.retrievedAt).toLocaleString()}
            </p>
            {draft.unknownFields.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Not verified on the page: {draft.unknownFields.join(", ")}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={apply} disabled={applied || entries.length === 0}>
              {applied ? "Applied to form" : "Apply to form"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setDraft(null);
                setApplied(false);
              }}
            >
              Discard
            </Button>
          </div>
          {applied ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Applied values are not saved yet. Review the form and press Save.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
