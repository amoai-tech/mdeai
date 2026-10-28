"use client";

import { useState } from "react";
import { LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingAiSuggestionCard } from "@/components/onboarding/onboarding-ai-suggestion-card";
import type { PartnerProfileSuggestion } from "@/lib/onboarding/ai-suggestion";

type Props = {
  onApply: (suggestion: PartnerProfileSuggestion) => void;
};

type Draft = {
  businessName?: string;
  category?: string;
  neighborhood?: string;
  website?: string;
  description?: string;
  sources: string[];
};

/**
 * SAN-1193 — paste a public website, let the selected AI provider propose business
 * details, then review them with the same Accept/Edit/Ignore card as SAN-709.
 */
export function BusinessUrlImportCard({ onApply }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function findDetails(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setDraft(null);
    setLoading(true);
    try {
      const response = await fetch("/api/partners/onboarding/url-draft", {
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
      setDraft({
        ...result.draft,
        sources: Array.isArray(result.draft.sources) ? result.draft.sources : [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that website");
    } finally {
      setLoading(false);
    }
  }

  const suggestion: PartnerProfileSuggestion | null = draft
    ? {
        ...(draft.businessName ? { businessName: draft.businessName } : {}),
        ...(draft.category ? { category: draft.category } : {}),
        ...(draft.neighborhood ? { neighborhood: draft.neighborhood } : {}),
        ...(draft.website ? { website: draft.website } : {}),
        ...(draft.description ? { description: draft.description } : {}),
        reason: "Suggested from the website — review before saving.",
      }
    : null;

  return (
    <section
      data-testid="business-url-import"
      aria-label="Import business details from a website"
      className="rounded-2xl border border-border bg-background p-4"
    >
      <div className="flex items-center gap-2">
        <LinkIcon className="size-4 text-accent" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">
          Autofill from your website
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste a public website to suggest details. Review them before saving.
      </p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={findDetails}>
        <div className="flex-1">
          <Label htmlFor="business-url" className="sr-only">
            Business website
          </Label>
          <Input
            id="business-url"
            data-testid="business-url-input"
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              // A draft is evidence for the requested URL, never a new one.
              setDraft(null);
            }}
            placeholder="https://yourbusiness.com"
            maxLength={500}
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="min-h-11 sm:w-auto"
          data-testid="business-url-submit"
          disabled={loading || url.trim().length === 0}
        >
          {loading ? "Reading…" : "Find details"}
        </Button>
      </form>
      {error ? (
        <p role="alert" data-testid="business-url-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {suggestion ? (
        <div className="mt-3 grid gap-2">
          <OnboardingAiSuggestionCard
            suggestion={suggestion}
            onAccept={(accepted) => {
              onApply(accepted);
              setDraft(null);
            }}
            onIgnore={() => setDraft(null)}
          />
          {draft?.sources.length ? (
            <div className="text-xs text-muted-foreground">
              <p>Successfully retrieved page:</p>
              {draft.sources.map((source) => (
                <a
                  key={source}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all underline underline-offset-2"
                >
                  {source}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
