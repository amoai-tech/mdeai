import { describe, expect, it, vi } from "vitest";

const result = vi.hoisted(() => ({ current: { status: "not-found" } as unknown }));
vi.mock("@/lib/events/get-public-event", () => ({
  getPublicEventResult: async () => result.current,
}));
vi.mock("@/lib/events/event-interest-server", () => ({
  getEventInterest: async () => ({ signedIn: false, following: false }),
}));

const { generateMetadata } = await import("../page");

const meta = (status: string) => {
  result.current = status === "ok"
    ? { status: "ok", event: { id: "a1b2c3d4-0001-0001-0001-000000000003", slug: "feria", name: "Feria de las Flores", description: null, imageUrl: null } }
    : { status };
  return generateMetadata({ params: Promise.resolve({ slug: "x" }), searchParams: Promise.resolve({}) } as never);
};

describe("SAN-1620 — a missing event must not be indexed as a real event page", () => {
  it("marks a genuinely missing event noindex", async () => {
    const m = await meta("not-found");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.title).toBe("Event not found · mdeai");
  });

  it("keeps a temporary read failure out of the index but distinct from not-found", async () => {
    const m = await meta("unavailable");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.title).toBe("Event unavailable · mdeai");
  });

  it("leaves a real event indexable with its canonical URL", async () => {
    const m = await meta("ok");
    expect(m.robots).toBeUndefined();
    expect(m.alternates).toEqual({ canonical: "/events/feria" });
  });
});
