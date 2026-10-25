import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadWorkspaceResolution,
  type WorkspaceLookup,
} from "@/lib/app/workspace-resolution";

type Result = { data: unknown; error: { message: string } | null };

function table(result: Result) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "limit", "maybeSingle"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: Result) => unknown) => resolve(result);
  return builder;
}

const EMPTY: Result = { data: [], error: null };
const USER = { data: { user: { id: "user-1", email: "ana@example.com" } }, error: null };

function fakeClient(options: {
  auth?: { data: { user: unknown }; error: { message: string } | null };
  landlord?: Result;
  events?: Result;
  memberships?: Result;
  partners?: Result;
  admin?: { data: boolean | null; error: { message: string } | null };
}) {
  const tables: Record<string, Result> = {
    landlord_profiles: options.landlord ?? EMPTY,
    events: options.events ?? EMPTY,
    partner_members: options.memberships ?? EMPTY,
    partners: options.partners ?? EMPTY,
  };
  return {
    auth: { getUser: async () => options.auth ?? USER },
    from: (name: string) => table(tables[name] ?? EMPTY),
    rpc: async () => options.admin ?? { data: false, error: null },
  } as unknown as WorkspaceLookup;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadWorkspaceResolution", () => {
  it("returns unauthenticated when there is no session", async () => {
    const result = await loadWorkspaceResolution(
      fakeClient({ auth: { data: { user: null }, error: null } }),
    );
    expect(result.status).toBe("unauthenticated");
  });

  it("turns an auth failure into a recoverable error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadWorkspaceResolution(
      fakeClient({ auth: { data: { user: null }, error: { message: "boom" } } }),
    );
    expect(result).toMatchObject({ status: "error" });
  });

  it("turns a membership query failure into an error, never an empty account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadWorkspaceResolution(
      fakeClient({ landlord: { data: null, error: { message: "db down" } } }),
    );
    expect(result).toMatchObject({ status: "error" });
    expect(result.status).not.toBe("none");
  });

  it("refuses to drop a membership whose partner row is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadWorkspaceResolution(
      fakeClient({
        memberships: {
          data: [{ partner_id: "p1" }, { partner_id: "p2" }],
          error: null,
        },
        partners: {
          data: [{ id: "p1", type: "venue", settings: { businessName: "Cafe" } }],
          error: null,
        },
      }),
    );
    expect(result).toMatchObject({ status: "error" });
  });

  it("resolves the contexts a real membership set supports", async () => {
    const result = await loadWorkspaceResolution(
      fakeClient({
        landlord: { data: [{ id: "landlord-1" }], error: null },
        memberships: { data: [{ partner_id: "p1" }], error: null },
        partners: {
          data: [
            { id: "p1", type: "venue", settings: { businessName: "Cafe Roma" } },
          ],
          error: null,
        },
        admin: { data: true, error: null },
      }),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.contexts.map((context) => context.kind)).toEqual([
      "personal",
      "rentals",
      "partners",
      "team",
    ]);
    expect(result.contexts[2].label).toBe("Cafe Roma");
  });

  it("labels a business without a name as Partners, never its raw type", async () => {
    const result = await loadWorkspaceResolution(
      fakeClient({
        memberships: { data: [{ partner_id: "p1" }], error: null },
        partners: {
          data: [{ id: "p1", type: "host", settings: {} }],
          error: null,
        },
      }),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.contexts.find((context) => context.kind === "partners")?.label).toBe(
      "Partners",
    );
    expect(result.contexts.map((context) => context.label)).not.toContain("Host");
  });
});
