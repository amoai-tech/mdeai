/**
 * Deterministic public URL slug for a host-event publish.
 *
 * The slug must be stable for a retry of the same review proposal: a lost
 * response must not produce a different URL, and two hosts publishing the same
 * title must not collide. The stable proposal id is therefore the uniqueness
 * suffix instead of a wall-clock timestamp.
 */
export function publishSlug(title: string, proposalId: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55)
    // The 55-character cut can land on a word separator. Trim again after the
    // cut, otherwise `${base}-${suffix}` produces `--`, which the SQL slug
    // guard rejects and aborts an otherwise valid publish.
    .replace(/-+$/g, "");
  // Use the *trailing* 12 alphanumeric characters of the proposal id: UUID
  // fixtures (and real ids) can share a leading prefix but differ at the tail,
  // and 12 hex chars keep the collision space large enough for public slugs.
  const suffix =
    (proposalId.toLowerCase().match(/[a-z0-9]/g)?.join("") ?? "").slice(-12) ||
    "proposal";
  return `${base || "event"}-${suffix}`.slice(0, 80);
}
