import { describe, expect, it, vi } from "vitest";

const result = vi.hoisted(() => ({ current: { status: "not-found" } as unknown }));
// The real loader is async; return a Promise explicitly instead of a redundant `async` mock.
vi.mock("@/lib/events/get-public-event", () => ({
  getPublicEventResult: () => Promise.resolve(result.current),
}));
vi.mock("@/lib/events/event-interest-server", () => ({
  getEventInterest: () => Promise.resolve({ signedIn: false, following: false }),
}));

const { generateMetadata } = await import("../page");

const metadataFor = (status: string) => {
  result.current = status === "ok"
    ? {
        status: "ok",
        event: {
          id: "a1b2c3d4-0001-0001-0001-000000000003",
          slug: "feria",
          name: "Feria de las Flores",
          description: null,
          imageUrl: null,
        },
      }
    : { status };
  return generateMetadata({
    params: Promise.resolve({ slug: "x" }),
    searchParams: Promise.resolve({}),
  } as never);
};

describe("SAN-1620 — a missing event must not be indexed as a real event page", () => {
  it("marks a genuinely missing event noindex", async () => {
    const metadata = await metadataFor("not-found");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe("Event not found · mdeai");
  });

  it("does not deindex a valid event during a temporary read failure", async () => {
    // Google drops a URL that answers noindex. A Supabase blip on a real event must
    // never cost that event its search placement, so no robots directive is emitted.
    const metadata = await metadataFor("unavailable");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toBe("Event unavailable · mdeai");
  });

  it("leaves a real event indexable with its canonical URL", async () => {
    const metadata = await metadataFor("ok");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toEqual({ canonical: "/events/feria" });
  });
});
