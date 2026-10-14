"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type AdminRentalRow = {
  id: string;
  title: string | null;
  neighborhood: string | null;
  address: string | null;
  price_monthly: number | null;
  currency: string | null;
  available_from: string | null;
  status: string;
  moderation_status: string;
  listing_workflow_status: string;
  verified: boolean | null;
  metadata: Record<string, unknown> | null;
};

type Counts = Record<string, { leads: number; showings: number }>;

type LoadResult =
  | { ok: true; rentals: AdminRentalRow[]; counts: Counts }
  | { ok: false; message: string };

const isTest = (row: AdminRentalRow) => String(row.metadata?.is_test_fixture ?? "") === "true";

async function fetchRentals(): Promise<LoadResult> {
  try {
    const res = await fetch("/api/admin/rentals/test");
    const json = (await res.json()) as {
      rentals?: AdminRentalRow[];
      counts?: Counts;
      error?: string;
    };
    if (!res.ok) return { ok: false, message: json.error ?? "Could not load rentals." };
    return { ok: true, rentals: json.rentals ?? [], counts: json.counts ?? {} };
  } catch {
    return { ok: false, message: "Network error — please retry." };
  }
}

export function RentalTestModePanel({ adminEmail }: { adminEmail: string }) {
  const [rentals, setRentals] = useState<AdminRentalRow[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "Admin test — Laureles 2BR",
    neighborhood: "Laureles",
    address: "Calle 10 #42-15, Laureles",
    priceMonthly: "2400000",
    currency: "COP",
    availableFrom: "",
    imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
  });

  const applyResult = useCallback((result: LoadResult) => {
    if (result.ok) {
      setError(null);
      setRentals(result.rentals);
      setCounts(result.counts);
    } else {
      setError(result.message);
    }
  }, []);

  const load = useCallback(async () => {
    applyResult(await fetchRentals());
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;
    // setState lives in the .then callback (not synchronous in the effect body).
    fetchRentals().then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  const act = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      setError(null);
      setMessage(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/rentals/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Request failed");
  }, []);

  const createTest = () =>
    act("create", async () => {
      await post({
        action: "create",
        title: form.title,
        neighborhood: form.neighborhood,
        address: form.address,
        priceMonthly: Number(form.priceMonthly),
        currency: form.currency,
        availableFrom: form.availableFrom,
        imageUrl: form.imageUrl,
      });
      setMessage("Test rental created (draft, test-marked).");
    });

  const publish = (id: string) =>
    act("publish:" + id, async () => {
      await post({ action: "publish", apartmentId: id });
      setMessage("Test rental published (internal only; verified=false; not customer-visible).");
    });

  const cloneAsTest = (id: string) =>
    act("clone:" + id, async () => {
      await post({ action: "clone-test", apartmentId: id,
        availableFrom: form.availableFrom, imageUrl: form.imageUrl });
      setMessage("MDE-managed development copy is active / approved / published for testing, with test-only verification and photo approvals. The original listing is unchanged.");
    });

  const assignTestOperator = (id: string, enabled: boolean) =>
    act("operator:" + id, async () => {
      await post({ action: "assign-test-operator", apartmentId: id, enabled });
      setMessage(enabled
        ? "MDE test operations assigned to your admin account. The property's landlord and verification are unchanged."
        : "MDE test operations assignment cleared.");
    });

  const cleanup = (id: string) =>
    act("cleanup:" + id, async () => {
      await post({ action: "cleanup", apartmentId: id });
      setMessage("Test leads/showings removed; listing returned to draft.");
    });

  const requestViewing = (row: AdminRentalRow) =>
    act("viewing:" + row.id, async () => {
      const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const preferredAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
      const res = await fetch("/api/leads/schedule-viewing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: row.id,
          listingTitle: row.title ?? "Admin test listing",
          neighborhood: row.neighborhood ?? "Medellín",
          name: "Admin test renter",
          email: adminEmail,
          preferredAt,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        leadId?: string;
        showingId?: string;
        error?: { message?: string };
      };
      if (!res.ok || !body.success || !body.showingId) {
        throw new Error(body.error?.message ?? "Viewing request failed");
      }
      setMessage(`Test viewing committed: lead ${body.leadId} + showing ${body.showingId}.`);
    });

  return (
    <div className="space-y-6" data-testid="admin-rental-test-panel">
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Create a test rental</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Test-marked (is_test_fixture) — never visible to customers, never marked verified.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["title", "Title"],
              ["neighborhood", "Neighbourhood"],
              ["address", "Address"],
              ["priceMonthly", "Monthly price"],
              ["currency", "Currency"],
              ["availableFrom", "Available from (YYYY-MM-DD)"],
              ["imageUrl", "Image URL"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs">
              <span className="text-muted-foreground">{label}</span>
              <input
                data-testid={`admin-test-${key}`}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <Button
          type="button"
          className="mt-3"
          data-testid="admin-test-create"
          disabled={busy !== null}
          onClick={() => void createTest()}
        >
          {busy === "create" ? "Working…" : "Create test rental"}
        </Button>
      </section>

      {message ? (
        <p className="text-sm" data-testid="admin-test-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" data-testid="admin-test-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-border">
        <table className="w-full text-left text-sm" data-testid="admin-rental-table">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Listing</th>
              <th className="p-2">State</th>
              <th className="p-2">Test</th>
              <th className="p-2">Leads / showings</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((row) => {
              const test = isTest(row);
              const c = counts[row.id] ?? { leads: 0, showings: 0 };
              return (
                <tr key={row.id} className="border-b border-border/60 align-top">
                  <td className="p-2">
                    <div className="font-medium">{row.title ?? "(untitled)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.neighborhood} · {row.currency} {row.price_monthly ?? "—"} · avail {row.available_from ?? "—"}
                    </div>
                  </td>
                  <td className="p-2 text-xs">
                    {row.status}/{row.moderation_status}/{row.listing_workflow_status}
                    <div className="text-muted-foreground">verified={String(row.verified)}</div>
                  </td>
                  <td className="p-2 text-xs">{test ? "TEST" : "—"}</td>
                  <td className="p-2 text-xs">{test ? `${c.leads} / ${c.showings}` : "—"}</td>
                  <td className="p-2">
                    {test ? (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`admin-test-publish-${row.id}`}
                          disabled={busy !== null}
                          onClick={() => void publish(row.id)}
                        >
                          Publish
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`admin-test-viewing-${row.id}`}
                          disabled={busy !== null || row.listing_workflow_status !== "published"}
                          onClick={() => void requestViewing(row)}
                        >
                          Request viewing
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`admin-test-cleanup-${row.id}`}
                          disabled={busy !== null}
                          onClick={() => void cleanup(row.id)}
                        >
                          Cleanup
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          data-testid={`admin-clone-test-${row.id}`}
                          disabled={busy !== null || !form.availableFrom || !form.imageUrl}
                          onClick={() => void cloneAsTest(row.id)}
                          title="Creates an MDE-owned, approved and published development fixture. Original listing is unchanged."
                        >
                          Make MDE test copy
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`admin-test-operator-${row.id}`}
                        disabled={busy !== null}
                        onClick={() => void assignTestOperator(
                          row.id,
                          row.metadata?.admin_test_operator_active !== true,
                        )}
                      >
                        {row.metadata?.admin_test_operator_active === true
                          ? "Clear MDE test operator" : "Assign MDE test operator"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
