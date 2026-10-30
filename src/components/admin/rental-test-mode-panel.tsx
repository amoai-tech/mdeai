"use client";

import { nextMedellinTestViewingWallClock } from "@/lib/leads/schedule-viewing-time";

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

export type TestAccessRow = {
  id: string;
  user_id: string;
  access_role: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  /** Server-computed: not revoked and not expired. */
  active: boolean;
};

export type TestEventRow = {
  id: number;
  apartment_id: string | null;
  actor_id: string | null;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Counts = Record<string, { leads: number; showings: number }>;

type LoadResult =
  | { ok: true; rentals: AdminRentalRow[]; counts: Counts; testAccess: TestAccessRow[]; testEvents: TestEventRow[] }
  | { ok: false; message: string };

const isTest = (row: AdminRentalRow) => String(row.metadata?.is_test_fixture ?? "") === "true";
const hasTestOperator = (row: AdminRentalRow) => String(row.metadata?.admin_test_operator_active ?? "") === "true";
const metaString = (row: AdminRentalRow, key: string) => String(row.metadata?.[key] ?? "");

async function fetchRentals(): Promise<LoadResult> {
  try {
    const res = await fetch("/api/admin/rentals/test");
    const json = (await res.json()) as {
      rentals?: AdminRentalRow[];
      counts?: Counts;
      testAccess?: TestAccessRow[];
      testEvents?: TestEventRow[];
      error?: string;
    };
    if (!res.ok) return { ok: false, message: json.error ?? "Could not load rentals." };
    return {
      ok: true,
      rentals: json.rentals ?? [],
      counts: json.counts ?? {},
      testAccess: json.testAccess ?? [],
      testEvents: json.testEvents ?? [],
    };
  } catch {
    return { ok: false, message: "Network error — please retry." };
  }
}

const ACCESS_ROLES = ["owner", "broker", "renter"] as const;

export function RentalTestModePanel() {
  const [rentals, setRentals] = useState<AdminRentalRow[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [testAccess, setTestAccess] = useState<TestAccessRow[]>([]);
  const [testEvents, setTestEvents] = useState<TestEventRow[]>([]);
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
  const [accessForm, setAccessForm] = useState({
    userId: "",
    accessRole: "renter",
    expiresAt: "",
    note: "",
  });
  const [ownerUserId, setOwnerUserId] = useState("");
  const [brokerUserId, setBrokerUserId] = useState("");

  const applyResult = useCallback((result: LoadResult) => {
    if (result.ok) {
      setError(null);
      setRentals(result.rentals);
      setCounts(result.counts);
      setTestAccess(result.testAccess);
      setTestEvents(result.testEvents);
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
    void fetchRentals().then((result) => {
      if (!cancelled) applyResult(result);
    }).catch(() => {
      if (!cancelled) setError("Could not load rentals. Please retry.");
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

  const grantAccess = () =>
    act("grant-access", async () => {
      await post({
        action: "grant-test-access",
        userId: accessForm.userId,
        accessRole: accessForm.accessRole,
        expiresAt: accessForm.expiresAt || null,
        note: accessForm.note || null,
      });
      setMessage("Development access granted. Audited; it authorizes testing only, not ownership or copyright.");
    });

  const revokeAccess = (userId: string, accessRole: string) =>
    act("revoke-access:" + userId + ":" + accessRole, async () => {
      await post({ action: "revoke-test-access", userId, accessRole });
      setMessage("Development access revoked. It takes effect immediately.");
    });

  const assignParty = (id: string, kind: "owner" | "broker") =>
    act(kind + ":" + id, async () => {
      const target = (kind === "owner" ? ownerUserId : brokerUserId).trim();
      await post(kind === "owner"
        ? { action: "assign-test-owner", apartmentId: id, ownerUserId: target }
        : { action: "assign-test-broker", apartmentId: id, brokerUserId: target });
      setMessage(kind === "owner"
        ? "Development owner recorded on the test listing (not legal ownership)."
        : "Responsible test broker assigned; that broker alone can see the listing's leads and showings.");
    });

  const setRight = (id: string, right: "photo" | "publishing", state: string) =>
    act("right:" + right + ":" + id, async () => {
      await post({ action: "set-test-rights", apartmentId: id, right, state });
      setMessage(
        right === "publishing" && state !== "approved"
          ? "Development publishing right withdrawn — the listing is no longer offered to authorized testers."
          : "Development rights updated.",
      );
    });

  const approve = (id: string) =>
    act("approve:" + id, async () => {
      await post({ action: "approve-test-listing", apartmentId: id });
      setMessage("Development listing approved and test-published (verified stays false).");
    });

  const reject = (id: string) =>
    act("reject:" + id, async () => {
      await post({ action: "reject-test-listing", apartmentId: id, reason: "Rejected in admin test mode" });
      setMessage("Development listing rejected; its publishing right is withdrawn.");
    });

  const reopen = (id: string) =>
    act("reopen:" + id, async () => {
      await post({ action: "reopen-test-listing", apartmentId: id });
      setMessage("Development listing reopened to draft for re-review.");
    });

  const requestViewing = (row: AdminRentalRow) =>
    act("viewing:" + row.id, async () => {
      const preferredAt = nextMedellinTestViewingWallClock();
      const res = await fetch("/api/admin/rentals/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request-viewing",
          apartmentId: row.id,
          preferredAt,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        leadId?: string;
        showingId?: string;
        error?: string;
      };
      if (!res.ok || !body.success || !body.showingId) {
        throw new Error(body.error ?? "Viewing request failed");
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
              ["title", "Title", form.title],
              ["neighborhood", "Neighbourhood", form.neighborhood],
              ["address", "Address", form.address],
              ["priceMonthly", "Monthly price", form.priceMonthly],
              ["currency", "Currency", form.currency],
              ["availableFrom", "Available from (YYYY-MM-DD)", form.availableFrom],
              ["imageUrl", "Image URL", form.imageUrl],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="text-xs">
              <span className="text-muted-foreground">{label}</span>
              <input
                data-testid={`admin-test-${key}`}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={value}
                onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); }}
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

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Development access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Authorizes a distinct test identity to act in development journeys. Testing only — never legal ownership,
          verification or photo copyright. Revoking takes effect immediately.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="text-xs">
            <span className="text-muted-foreground">User ID (UUID)</span>
            <input
              data-testid="admin-test-access-userId"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={accessForm.userId}
              onChange={(e) => { setAccessForm((f) => ({ ...f, userId: e.target.value })); }}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Role</span>
            <select
              data-testid="admin-test-access-role"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={accessForm.accessRole}
              onChange={(e) => { setAccessForm((f) => ({ ...f, accessRole: e.target.value })); }}
            >
              {ACCESS_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Expires at (optional)</span>
            <input
              data-testid="admin-test-access-expiresAt"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              placeholder="2026-11-01T00:00:00Z"
              value={accessForm.expiresAt}
              onChange={(e) => { setAccessForm((f) => ({ ...f, expiresAt: e.target.value })); }}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Note (optional)</span>
            <input
              data-testid="admin-test-access-note"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={accessForm.note}
              onChange={(e) => { setAccessForm((f) => ({ ...f, note: e.target.value })); }}
            />
          </label>
        </div>
        <Button
          type="button"
          className="mt-3"
          data-testid="admin-test-access-grant"
          disabled={busy !== null || !accessForm.userId}
          onClick={() => void grantAccess()}
        >
          Grant access
        </Button>

        {/* Only the table scrolls sideways on narrow screens; the page itself never does. */}
        <div
          className="mt-3 max-w-full overflow-x-auto"
          role="region"
          aria-label="Development access grants"
          tabIndex={0}
          data-testid="admin-test-access-scroll"
        >
          <table className="w-full min-w-[560px] text-left text-xs" data-testid="admin-test-access-list">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-2">User</th>
                <th className="p-2">Role</th>
                <th className="p-2">Granted</th>
                <th className="p-2">Expires</th>
                <th className="p-2">State</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {testAccess.length === 0 ? (
                <tr><td className="p-2 text-muted-foreground" colSpan={6}>No development grants yet.</td></tr>
              ) : testAccess.map((row) => {
                const active = row.active;
                return (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="p-2 font-mono">{row.user_id.slice(0, 8)}…</td>
                    <td className="p-2">{row.access_role}</td>
                    <td className="p-2">{new Date(row.granted_at).toLocaleDateString()}</td>
                    <td className="p-2">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—"}</td>
                    <td className="p-2">{active ? "active" : row.revoked_at ? "revoked" : "expired"}</td>
                    <td className="p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid={`admin-test-access-revoke-${row.user_id}-${row.access_role}`}
                        disabled={busy !== null || !active}
                        onClick={() => void revokeAccess(row.user_id, row.access_role)}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      <section className="rounded-lg border border-border p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            <span className="text-muted-foreground">Owner user ID for assignment (UUID)</span>
            <input
              data-testid="admin-test-owner-input"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Broker user ID for assignment (UUID)</span>
            <input
              data-testid="admin-test-broker-input"
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={brokerUserId}
              onChange={(e) => setBrokerUserId(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-border">
        <div
          className="max-w-full overflow-x-auto"
          role="region"
          aria-label="Rental listings"
          tabIndex={0}
          data-testid="admin-rental-table-scroll"
        >
          <table className="w-full min-w-[760px] text-left text-sm" data-testid="admin-rental-table">
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
                      {test ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          publish={metaString(row, "admin_test_publish_state") || "—"} · photo={metaString(row, "admin_test_photo_rights") || "—"}
                          {metaString(row, "admin_test_owner_user_id") ? ` · owner ${metaString(row, "admin_test_owner_user_id").slice(0, 8)}…` : ""}
                          {metaString(row, "admin_test_broker_user_id") ? ` · broker ${metaString(row, "admin_test_broker_user_id").slice(0, 8)}…` : ""}
                        </div>
                      ) : null}
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
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-publish-${row.id}`} disabled={busy !== null}
                            onClick={() => void publish(row.id)}>Publish</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-approve-${row.id}`} disabled={busy !== null}
                            onClick={() => void approve(row.id)}>Approve</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-reject-${row.id}`} disabled={busy !== null}
                            onClick={() => void reject(row.id)}>Reject</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-reopen-${row.id}`} disabled={busy !== null}
                            onClick={() => void reopen(row.id)}>Reopen</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-photo-${row.id}`} disabled={busy !== null}
                            onClick={() => void setRight(row.id, "photo",
                              metaString(row, "admin_test_photo_rights") === "revoked" ? "authorized" : "revoked")}>
                            {metaString(row, "admin_test_photo_rights") === "revoked" ? "Grant photo" : "Revoke photo"}
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-publish-right-${row.id}`} disabled={busy !== null}
                            onClick={() => void setRight(row.id, "publishing",
                              metaString(row, "admin_test_publish_state") === "approved" ? "revoked" : "approved")}>
                            {metaString(row, "admin_test_publish_state") === "approved" ? "Withdraw publishing" : "Restore publishing"}
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-owner-${row.id}`} disabled={busy !== null || !ownerUserId}
                            onClick={() => void assignParty(row.id, "owner")}>Assign owner</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-broker-${row.id}`} disabled={busy !== null || !brokerUserId}
                            onClick={() => void assignParty(row.id, "broker")}>Assign broker</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-viewing-${row.id}`}
                            disabled={busy !== null || row.listing_workflow_status !== "published"}
                            onClick={() => void requestViewing(row)}>Request viewing</Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-cleanup-${row.id}`} disabled={busy !== null}
                            onClick={() => void cleanup(row.id)}>Cleanup</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="default"
                            data-testid={`admin-clone-test-${row.id}`}
                            disabled={busy !== null || !form.availableFrom || !form.imageUrl}
                            onClick={() => void cloneAsTest(row.id)}
                            title="Creates an MDE-owned, approved and published development fixture. Original listing is unchanged.">
                            Make MDE test copy
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            data-testid={`admin-test-operator-${row.id}`}
                            disabled={busy !== null}
                            onClick={() => void assignTestOperator(row.id, !hasTestOperator(row))}>
                            {hasTestOperator(row) ? "Clear MDE test operator" : "Assign MDE test operator"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Development audit trail</h2>
        <p className="mt-1 text-xs text-muted-foreground">Append-only: UPDATE and DELETE are blocked by the database.</p>
        <div
          className="mt-3 max-w-full overflow-x-auto"
          role="region"
          aria-label="Development audit trail"
          tabIndex={0}
          data-testid="admin-test-events-scroll"
        >
          <table className="w-full min-w-[520px] text-left text-xs" data-testid="admin-test-events">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Event</th>
                <th className="p-2">Listing</th>
                <th className="p-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {testEvents.length === 0 ? (
                <tr><td className="p-2 text-muted-foreground" colSpan={4}>No development events yet.</td></tr>
              ) : testEvents.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="p-2">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-2">{row.event_type}</td>
                  <td className="p-2 font-mono">{row.apartment_id ? `${row.apartment_id.slice(0, 8)}…` : "—"}</td>
                  <td className="p-2 font-mono">{row.actor_id ? `${row.actor_id.slice(0, 8)}…` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
