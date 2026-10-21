"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildPartnerProfilePatch, profileValuesFromSettings, type PartnerProfileValues } from "@/lib/partners/partner-profile-patch";

import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  partnerId: string;
  partnerType: string;
  partnerStatus: string;
  initial: PartnerProfileValues;
};

const FIELD = "h-11 text-base md:text-sm";

/**
 * SAN-814 — owner-scoped business profile form. Saves through the authenticated
 * server route; this component never writes partner data directly.
 */
export function PartnerProfileForm({ partnerId, partnerType, partnerStatus, initial }: Props) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [values, setValues] = useState<PartnerProfileValues>(initial);
  const [persisted, setPersisted] = useState<PartnerProfileValues>(initial);
  const dirty = buildPartnerProfilePatch(values, persisted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof PartnerProfileValues>(key: K, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || Object.keys(dirty).length === 0) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const payload = { partnerId, ...dirty };
      const response = await fetch("/api/partners/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; settings?: Record<string, unknown>; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.success || !result.settings) {
        throw new Error(result?.error?.message ?? "Could not save your profile");
      }
      const confirmed = profileValuesFromSettings(result.settings);
      setPersisted(confirmed);
      setValues(confirmed);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="partner-profile-form"
      onSubmit={submit}
      className="grid gap-5 rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-3 py-1 font-medium capitalize">
          {partnerType}
        </span>
        <span className="rounded-full bg-muted px-3 py-1 capitalize">
          {partnerStatus}
        </span>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="profile-business-name">Business name</Label>
        <Input
          id="profile-business-name"
          data-testid="profile-business-name"
          className={FIELD}
          value={values.businessName}
          onChange={(event) => update("businessName", event.target.value)}
          maxLength={160}
          disabled={saving}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="profile-category">Category</Label>
          <Input
            id="profile-category"
            data-testid="profile-category"
            className={FIELD}
            value={values.category}
            onChange={(event) => update("category", event.target.value)}
            placeholder="Café, Restaurant, Nightclub…"
            maxLength={80}
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-neighborhood">Neighborhood</Label>
          <Input
            id="profile-neighborhood"
            data-testid="profile-neighborhood"
            className={FIELD}
            value={values.neighborhood}
            onChange={(event) => update("neighborhood", event.target.value)}
            placeholder="Laureles"
            maxLength={80}
            disabled={saving}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="profile-website">Website</Label>
        <Input
          id="profile-website"
          data-testid="profile-website"
          className={FIELD}
          type="url"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
          placeholder="https://example.com"
          maxLength={300}
          disabled={saving}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="profile-description">Description</Label>
        <Textarea
          id="profile-description"
          data-testid="profile-description"
          className="text-base md:text-sm"
          rows={5}
          value={values.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="What makes your business worth visiting?"
          maxLength={1000}
          disabled={saving}
        />
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="partner-profile-error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          data-testid="partner-profile-saved"
          className="text-sm font-medium text-success"
        >
          Profile saved.
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        data-testid="partner-profile-save"
        disabled={saving || !hydrated || Object.keys(dirty).length === 0}
      >
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
