import Link from "next/link";

export type InboxItem = {
  id: string;
  apartment_id: string | null;
  renter_name: string | null;
  renter_email: string | null;
  raw_message: string;
  status: string;
  created_at: string;
  structured_profile?: { move_when?: string } | null;
};

const MOVE_WHEN_LABEL: Record<string, string> = {
  now: "Wants to move: as soon as possible",
  soon: "Wants to move: within 1–3 months",
  later: "Wants to move: later / flexible",
};

/**
 * RFC 6068 keeps the "@" between local part and domain; percent-encoding it produces
 * `mailto:name%40example.com`, which some clients fail to parse as a recipient.
 */
function mailtoHref(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return `mailto:${encodeURIComponent(email)}`;
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${email.slice(at + 1)}`;
}

export function LandlordInboxList({ items }: { items: InboxItem[] }) {
  if (!items.length) {
    return <p data-testid="landlord-inbox-empty" className="rounded-lg border p-4 text-sm text-muted-foreground">
      No inquiries yet. New Contact Host messages will appear here.
    </p>;
  }
  return (
    <ul data-testid="landlord-inbox-list" className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border p-4" data-testid="landlord-inbox-item">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{item.renter_name || "Renter"}</strong>
            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString("en-CO", { timeZone: "America/Bogota" })}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.raw_message}</p>
          {item.structured_profile?.move_when ? (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="landlord-inbox-move-when">
              {MOVE_WHEN_LABEL[item.structured_profile.move_when] ?? item.structured_profile.move_when}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {item.renter_email ? (
              <a className="text-primary underline-offset-2 hover:underline"
                href={mailtoHref(item.renter_email)}>
                Reply by email
              </a>
            ) : <span className="text-muted-foreground">No reply address supplied</span>}
            {item.apartment_id ? (
              <Link className="text-primary underline-offset-2 hover:underline"
                href={`/rentals/${encodeURIComponent(item.apartment_id)}`}>
                View apartment
              </Link>
            ) : null}
            <span className="text-muted-foreground">Status: {item.status}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
