import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  ranges: [] as Array<[number, number]>,
  countErrorTable: null as string | null,
  leadsRows: [] as Array<Record<string, unknown>>,
  showingsRows: [] as Array<Record<string, unknown>>,
  countRanges: [] as Array<{ table: string; start: number; end: number }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: h.getUser },
    rpc: h.rpc,
    from: (table: string) => {
      let rows = table === "apartments" ? [...h.rows]
        : table === "leads" ? [...h.leadsRows]
        : table === "showings" ? [...h.showingsRows] : [];
      const query = {
        select: () => query,
        order: (column: string) => {
          rows.sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")));
          return query;
        },
        limit: (count: number) => { rows = rows.slice(0, count); return query; },
        eq: (field: string, value: string) => {
          if (field === "metadata->>is_test_fixture") {
            rows = rows.filter((row) => {
              const metadata = row.metadata as Record<string, unknown> | null;
              return String(metadata?.is_test_fixture ?? "") === value;
            });
          } else {
            rows = rows.filter((row) => String(row[field] ?? "") === value);
          }
          return query;
        },
        contains: (_field: string, expected: Record<string, unknown>) => {
          rows = rows.filter((row) => {
            const metadata = row.metadata as Record<string, unknown> | null;
            return Object.entries(expected).every(([key, value]) => metadata?.[key] === value);
          });
          return query;
        },
        range: (start: number, end: number) => {
          if (table === "apartments") h.ranges.push([start, end]);
          else h.countRanges.push({ table, start, end });
          rows = rows.slice(start, end + 1);
          return query;
        },
        in: (field: string, values: string[]) => {
          rows = rows.filter((row) => values.includes(String(row[field])));
          return query;
        },
        then: (resolve: (result: { data: typeof rows | null; error: { message: string } | null }) => unknown) =>
          Promise.resolve(h.countErrorTable === table
            ? { data: null, error: { message: "database unavailable" } }
            : { data: rows, error: null }).then(resolve),
      };
      return query;
    },
  })),
}));

import { GET, POST } from "./route";

const request = (body: Record<string, unknown>) => new Request("http://localhost/api/admin/rentals/test", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const fields = {
  action: "create", title: "Development test", neighborhood: "Laureles", address: "Calle 10",
  availableFrom: "2026-11-01", imageUrl: "https://example.com/test.webp", priceMonthly: 2500000,
  currency: "COP",
};

beforeEach(() => {
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: "admin-id", email: "admin@example.com" } } });
  h.rpc.mockReset().mockImplementation(async (name: string) => name === "is_admin"
    ? { data: true, error: null }
    : { data: { id: "new-test-rental" }, error: null });
  h.rows = [];
  h.ranges = [];
  h.countErrorTable = null;
  h.countRanges = [];
  h.leadsRows = [];
  h.showingsRows = [];
});

describe("GET /api/admin/rentals/test", () => {
  it("denies non-admin users before querying apartments", async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET()).status).toBe(403);
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
  });

  it("keeps all old test fixtures beyond the newest 100 with deduped rows and counts", async () => {
    h.rows = [
      ...Array.from({ length: 120 }, (_, i) => ({ id: `normal-${i}`, metadata: {} })),
      ...Array.from({ length: 125 }, (_, i) => ({ id: `fixture-${i}`, metadata: { is_test_fixture: i % 2 === 0 ? "true" : true } })),
    ];
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rentals).toHaveLength(225); // newest 100 + all 125 older fixtures
    expect(new Set(body.rentals.map((row: { id: string }) => row.id)).size).toBe(225);
    expect(body.rentals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "normal-0" }),
      expect.objectContaining({ id: "fixture-124" }),
    ]));
    expect(Object.keys(body.counts)).toHaveLength(125);
    expect(body.counts["fixture-124"]).toEqual({ leads: 0, showings: 0 });
    expect(h.ranges).toEqual([[0, 99], [100, 199]]);
  });

  it.each(["leads", "showings"])("returns a server error when %s counts cannot be retrieved", async (table) => {
    h.rows = [{ id: "test-row", metadata: { is_test_fixture: "true" } }];
    h.countErrorTable = table;
    const response = await GET();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/could not load .* counts/i);
  });

  it("counts all lead/showing rows beyond the 1,000-row PostgREST limit", async () => {
    h.rows = [{ id: "fixture-1", metadata: { is_test_fixture: "true" } }];
    h.leadsRows = Array.from({ length: 1_107 }, (_, i) => ({ id: `l-${String(i).padStart(5, "0")}`, apartment_id: "fixture-1" }));
    h.showingsRows = Array.from({ length: 1_203 }, (_, i) => ({ id: `s-${String(i).padStart(5, "0")}`, apartment_id: "fixture-1" }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts["fixture-1"]).toEqual({ leads: 1107, showings: 1203 });
    expect(h.countRanges.filter((r) => r.table === "leads")).toHaveLength(6);
    expect(h.countRanges.filter((r) => r.table === "showings")).toHaveLength(7);
  });

  it("does not duplicate test listings appearing among the newest 100", async () => {
    h.rows = [
      { id: "new-test", metadata: { is_test_fixture: true } },
      { id: "recent", metadata: {} },
      { id: "old-test", metadata: { is_test_fixture: true } },
    ];
    const body = await (await GET()).json();
    expect(body.rentals.map((row: { id: string }) => row.id)).toEqual(["new-test", "recent", "old-test"]);
    expect(Object.keys(body.counts)).toEqual(["new-test", "old-test"]);
  });
});

describe("POST /api/admin/rentals/test admin viewing", () => {
  it("denies unauthenticated and non-admin requests before calling the viewing RPC", async () => {
    const body = { action: "request-viewing", apartmentId: "fixture-1", preferredAt: "2099-11-01T10:00" };
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request(body))).status).toBe(403);
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(body))).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalledWith("admin_request_test_viewing", expect.anything());
  });

  it("requires valid future Medellín time and uses the authenticated admin email", async () => {
    const invalid = await POST(request({ action: "request-viewing", apartmentId: "fixture-1", preferredAt: "2001-01-01T10:00" }));
    expect(invalid.status).toBe(400);
    h.rpc.mockImplementation(async (name: string) => name === "is_admin"
      ? { data: true, error: null }
      : { data: { lead: { id: "lead-one" }, showing: { id: "showing-one" }, idempotent_replay: false }, error: null });
    const valid = await POST(request({ action: "request-viewing", apartmentId: "fixture-1", preferredAt: "2099-11-01T10:00", email: "spoofed@example.com" }));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ success: true, leadId: "lead-one", showingId: "showing-one", idempotentReplay: false });
    expect(h.rpc).toHaveBeenCalledWith("admin_request_test_viewing", expect.objectContaining({
      p_apartment_id: "fixture-1", p_email: "admin@example.com",
    }));
  });
});

describe("POST /api/admin/rentals/test create validation", () => {
  it("rejects missing and invalid prices with a specific validation error", async () => {
    for (const priceMonthly of [null, "", -10, 0, false]) {
      const response = await POST(request({ ...fields, priceMonthly }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("priceMonthly must be a positive number");
    }
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("rejects EUR instead of silently falling back to COP", async () => {
    const response = await POST(request({ ...fields, currency: "EUR" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("currency must be COP or USD");
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("rejects malformed, impossible, and non-ISO availableFrom dates", async () => {
    for (const availableFrom of ["next month", "2026-02-30", "2026-2-3", "2026-13-01"]) {
      const res = await POST(request({ ...fields, availableFrom }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/availableFrom/i);
    }
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("rejects insecure or malformed imageUrl values before calling create RPC", async () => {
    for (const imageUrl of ["http://example.com/photo.jpg", "https://", "javascript:alert(1)"]) {
      const res = await POST(request({ ...fields, imageUrl }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/imageUrl.*HTTPS/i);
    }
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("accepts valid COP currency and passes the exact numeric price to the RPC", async () => {
    const response = await POST(request({ ...fields, currency: "cop" }));
    expect(response.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("admin_create_test_rental", expect.objectContaining({
      p_currency: "COP", p_price_monthly: 2500000,
    }));
  });
});


describe("POST /api/admin/rentals/test clone validation", () => {
  const clone = { action: "clone-test", apartmentId: "f1460000-0000-4000-8000-000000000021", availableFrom: "2026-11-01", imageUrl: "https://example.com/test.webp" };

  it("rejects malformed UUIDs before calling the clone RPC", async () => {
    for (const apartmentId of ["12345678-123456789012345678901234567", "f1460000000040008000000000000021", "f1460000-0000-4000-8000-00000000002z"]) {
      const res = await POST(request({ ...clone, apartmentId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/valid source/i);
    }
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("rejects impossible calendar dates and malformed HTTPS URLs consistently with create", async () => {
    for (const changes of [{ availableFrom: "2026-02-30" }, { imageUrl: "https://" }, { imageUrl: "http://example.com/photo.jpg" }]) {
      const res = await POST(request({ ...clone, ...changes }));
      expect(res.status).toBe(400);
    }
    expect(h.rpc.mock.calls.every(([name]) => name === "is_admin")).toBe(true);
  });

  it("accepts canonical UUID, valid ISO date and secure photo URL", async () => {
    const res = await POST(request(clone));
    expect(res.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("admin_clone_rental_for_testing", expect.objectContaining({
      p_source_apartment_id: clone.apartmentId,
      p_available_from: clone.availableFrom,
      p_test_image_url: clone.imageUrl,
    }));
  });
});


describe.each([
  { action: "assign-test-operator", rpc: "admin_assign_rental_test_operator", extra: { enabled: false }, args: { p_apartment_id: "fixture-id", p_enabled: false } },
  { action: "publish", rpc: "admin_publish_test_rental", extra: {}, args: { p_apartment_id: "fixture-id" } },
  { action: "cleanup", rpc: "admin_cleanup_test_rental", extra: {}, args: { p_apartment_id: "fixture-id" } },
])("POST /api/admin/rentals/test $action", ({ action, rpc, extra, args }) => {
  const payload = { action, apartmentId: "fixture-id", ...extra };

  it("rejects signed-out and non-admin users before the write RPC", async () => {
    h.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(request(payload))).status).toBe(401);
    h.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await POST(request(payload))).status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalledWith(rpc, expect.anything());
  });

  it("rejects missing apartmentId before the write RPC", async () => {
    const response = await POST(request({ action, ...extra }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/apartmentId is required/i);
    expect(h.rpc).not.toHaveBeenCalledWith(rpc, expect.anything());
  });

  it("returns a clear RPC error rather than claiming success", async () => {
    h.rpc.mockImplementation(async (name: string) => name === "is_admin"
      ? { data: true, error: null } : { data: null, error: { message: "database refused write" } });
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("database refused write");
    expect(h.rpc).toHaveBeenCalledWith(rpc, args);
  });

  it("calls only the expected RPC and preserves the returned rental", async () => {
    const response = await POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rental: { id: "new-test-rental" } });
    expect(h.rpc).toHaveBeenCalledWith(rpc, args);
  });
});

describe("POST /api/admin/rentals/test operator flag validation", () => {
  it("rejects non-boolean enabled values", async () => {
    for (const enabled of ["true", 1, null, undefined]) {
      const res = await POST(request({ action: "assign-test-operator", apartmentId: "fixture-id", enabled }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/enabled must be boolean/i);
    }
    expect(h.rpc).not.toHaveBeenCalledWith("admin_assign_rental_test_operator", expect.anything());
  });
});
