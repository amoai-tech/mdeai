/**
 * SAN-1089 — the rental detail page must say "temporarily unavailable" (with a retry) when the
 * database cannot be read, show its generic error for anything else, and never write a raw driver
 * message to the server log.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";

const getRentalDetail = vi.fn();

vi.mock("@/lib/rentals/get-rental-detail", () => ({
  getRentalDetail: (...args: unknown[]) => getRentalDetail(...args),
}));
const createServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createServerClient(...args),
}));
vi.mock("@/components/rentals/rental-detail-view", () => ({
  RentalDetailView: () => null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import RentalDetailPage from "../page";

function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const element = node as ReactElement<{ children?: unknown }>;
  return textOf(element.props?.children);
}

async function render(id = "rnt_lau_001", searchParams?: Record<string, string>) {
  return (await RentalDetailPage({
    params: Promise.resolve({ id }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  })) as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  getRentalDetail.mockReset();
  createServerClient.mockReset().mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/rentals/[id]", () => {
  it("shows 'temporarily unavailable' with a retry when the database cannot be read", async () => {
    getRentalDetail.mockRejectedValue(new RentalSearchUnavailableError("client_unavailable"));
    const page = await render("abc");
    expect(page.props["data-testid"]).toBe("rental-detail-error");
    expect(textOf(page)).toMatch(/temporarily unavailable/i);
    expect(textOf(page)).toMatch(/retry/i);
  });

  it("shows the generic error for any other failure", async () => {
    getRentalDetail.mockRejectedValue(new Error("boom"));
    const page = await render("abc");
    expect(page.props["data-testid"]).toBe("rental-detail-error");
    expect(textOf(page)).toMatch(/couldn.t load this rental/i);
    expect(textOf(page)).not.toMatch(/temporarily unavailable/i);
  });

  it("never writes a raw driver message to the server log", async () => {
    getRentalDetail.mockRejectedValue(new Error("connection refused to db.prod.internal:5432"));
    await render("abc");
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(" | ");
    expect(logged).not.toContain("db.prod.internal");
  });

  it("a missing rental is a 404, not an error page", async () => {
    getRentalDetail.mockResolvedValue(null);
    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  describe("Back to results keeps the renter's filters (SAN-486)", () => {
    const detail = { id: "abc", title: "Loft" };

    it("passes the validated browse filters to the detail view as the back link", async () => {
      getRentalDetail.mockResolvedValue(detail);
      const page = await render("abc", { neighborhood: "Laureles", beds: "2", from: "2026-11-01", through: "2026-11-30", evil: "x" });
      const backHref = page.props.backHref as string;
      expect(backHref).toBe("/rentals?neighborhood=Laureles&beds=2&from=2026-11-01&through=2026-11-30");
      expect(backHref).not.toContain("evil");
    });

    it("drops an impossible date instead of carrying it back", async () => {
      getRentalDetail.mockResolvedValue(detail);
      const page = await render("abc", { from: "2026-02-31", neighborhood: "Laureles" });
      expect(page.props.backHref).toBe("/rentals?neighborhood=Laureles");
    });

    it("is plain /rentals when the renter arrived without filters", async () => {
      getRentalDetail.mockResolvedValue(detail);
      expect((await render("abc")).props.backHref).toBe("/rentals");
    });
  });
});

// SAN-1503 — an unknown slug answered HTTP 200 with a "not found" page. Cause: a `loading.tsx` directly
// under `app/rentals/` wrapped this page in a Suspense boundary; Next.js sends 200 once a loading
// boundary starts streaming, so the page's own notFound() could no longer change the status. The
// skeleton now lives in `app/rentals/(browse)/` and covers only the list. Guard the file layout, because
// nothing in a unit render would notice it coming back.
// https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes
describe("/rentals/[id] status code", () => {
  it("has no loading boundary above it, so an unknown listing can answer 404", () => {
    const rentalsDir = resolve(__dirname, "../..");
    for (const name of ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"]) {
      expect(existsSync(resolve(rentalsDir, name))).toBe(false);
    }
    expect(existsSync(resolve(rentalsDir, "(browse)", "loading.tsx"))).toBe(true);
  });
});
