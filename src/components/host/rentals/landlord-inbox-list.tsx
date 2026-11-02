import Link from "next/link";

export type InboxItem = {
  id: string;
  apartment_id: string | null;
  renter_name: string | null;
  renter_email: string | null;
  raw_message: string;
  status: string;
  created_at: string;
};

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
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {item.renter_email ? (
              <a className="text-primary underline-offset-2 hover:underline"
                href={`mailto:${encodeURIComponent(item.renter_email)}`}>
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
