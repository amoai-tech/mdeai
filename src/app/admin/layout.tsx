import Link from "next/link";

/**
 * SAN-1526 · minimal shared admin shell. The previous admin pages were standalone; this adds
 * one navigation row so contest management is reachable without changing those pages.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-border/60" aria-label="Admin">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <span className="font-semibold">Admin</span>
          <Link className="text-muted-foreground hover:text-foreground" href="/admin/contests">
            Contests
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/admin/event-bookings">
            Event requests
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/admin/rentals">
            Rentals
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}