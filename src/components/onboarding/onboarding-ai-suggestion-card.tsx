"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  partnerProfileSuggestionSchema,
  type PartnerProfileSuggestion,
} from "@/lib/onboarding/ai-suggestion";

type Props = {
  suggestion: PartnerProfileSuggestion;
  onAccept: (suggestion: PartnerProfileSuggestion) => void;
  onIgnore: () => void;
};

const FIELDS = [
  { key: "businessName", label: "Business name" },
  { key: "category", label: "Category" },
  { key: "neighborhood", label: "Neighborhood" },
] as const;

/**
 * SAN-709 — every AI value is a proposal. Nothing is written until the partner
 * accepts it, and edited values are validated again before they reach the form.
 */
export function OnboardingAiSuggestionCard({ suggestion, onAccept, onIgnore }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PartnerProfileSuggestion>(suggestion);
  const [error, setError] = useState<string | null>(null);

  function saveEdited() {
    const parsed = partnerProfileSuggestionSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the suggested values");
      return;
    }
    setError(null);
    setEditing(false);
    onAccept(parsed.data);
  }

  return (
    <section
      data-testid="onboarding-suggestion-card"
      aria-label="AI profile suggestions"
      className="rounded-2xl border border-accent/40 bg-accent/5 p-4"
    >
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-accent" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">AI suggestions</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Review before applying. Nothing is saved until you activate the profile.
      </p>

      <dl className="mt-3 grid gap-1 text-sm">
        {FIELDS.map((field) =>
          suggestion[field.key] !== undefined ? (
            <div key={field.key} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">{field.label}</dt>
              <dd data-testid={"suggestion-" + field.key}>{suggestion[field.key]}</dd>
            </div>
          ) : null,
        )}
      </dl>

      {suggestion.reason ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Why: {suggestion.reason}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 grid gap-2">
          {FIELDS.map((field) => (
            <div key={field.key} className="grid gap-1">
              <Label htmlFor={"suggestion-edit-" + field.key}>{field.label}</Label>
              <Input
                id={"suggestion-edit-" + field.key}
                data-testid={"suggestion-edit-" + field.key}
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    [field.key]: event.target.value,
                  }))
                }
                maxLength={field.key === "businessName" ? 160 : 80}
              />
            </div>
          ))}
          {error ? (
            <p role="alert" data-testid="suggestion-error" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdited} data-testid="onboarding-suggestion-save">
              Apply edited values
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onAccept(suggestion)}
            data-testid="onboarding-suggestion-accept"
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(suggestion);
              setEditing(true);
            }}
            data-testid="onboarding-suggestion-edit"
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onIgnore}
            data-testid="onboarding-suggestion-ignore"
          >
            Ignore
          </Button>
        </div>
      )}
    </section>
  );
}
