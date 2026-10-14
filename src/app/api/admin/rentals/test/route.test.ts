import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  ranges: [] as Array<[number, number]>,
  countErrorTable: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: h.getUser },
    rpc: h.rpc,
    from: (table: string) => {
      let rows = table === "apartments" ? [...h.rows] : [];
      const query = {
        select: () => query,
        order: () => query,
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
          h.ranges.push([start, end]);
          rows = rows.slice(start, end + 1);
          return query;
        },
        in: () => query,
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
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: "admin-id" } } });
  h.rpc.mockReset().mockImplementation(async (name: string) => name === "is_admin"
    ? { data: true, error: null }
    : { data: { id: "new-test-rental" }, error: null });
  h.rows = [];
  h.ranges = [];
  h.countErrorTable = null;
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

  it("accepts valid COP currency and passes the exact numeric price to the RPC", async () => {
    const response = await POST(request({ ...fields, currency: "cop" }));
    expect(response.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("admin_create_test_rental", expect.objectContaining({
      p_currency: "COP", p_price_monthly: 2500000,
    }));
  });
});
