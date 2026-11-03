import { Heart } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { EmptyState } from "@/components/empty/empty-state";
import { SavedCollectionsGrid } from "@/components/saved/saved-collections-grid";
import { getServerUser } from "@/lib/auth/session";
import { loadUserCollections } from "@/lib/saved/load-user-collections";

export const metadata = {
  title: "Saved · mdeai",
};

// skipcq: JS-0067 - Next.js App Router page export
export default async function PersonalSavedPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me/saved");

  const result = await loadUserCollections(user.id);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Saved</h1>
        <p className="text-sm text-muted-foreground">
          Shortlists from chat — rentals, events, and places you hearted.
        </p>
      </header>

      {result.status === "error" ? (
        <AccountLoadError
          message={result.message}
          retryHref="/app/me/saved"
          title="Your saved collections are temporarily unavailable"
        />
      ) : result.value.length === 0 ? (
        <EmptyState
          testId="saved-empty-collections"
          title="No collections yet"
          description="Heart a rental or event in chat — collections will appear here."
          icon={<Heart className="size-8" />}
        />
      ) : (
        <SavedCollectionsGrid collections={result.value} />
      )}
    </section>
  );
}
