import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/events/list-published-events", () => ({ listPublishedEvents: mock.list }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import { GET } from "./route";

beforeEach(() => {
  mock.list.mockReset();
  mock.create.mockReset();
  mock.create.mockResolvedValue({});
  mock.list.mockResolvedValue({ results: [], total: 0, limit: 24, offset: 0, error: null });
});

describe("GET /api/events/public event-ID selection", () => {
  it("accepts an actual UUID containing digits and forwards it to the public catalog", async () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    const response = await GET(new Request(`http://localhost/api/events/public?ids=${id}`));
    expect(response.status).toBe(200);
    expect(mock.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ids: [id] }));
  });

  it("rejects a forged event identifier before querying the catalog", async () => {
    const response = await GET(new Request("http://localhost/api/events/public?ids=not-a-uuid"));
    expect(response.status).toBe(400);
    expect(mock.list).not.toHaveBeenCalled();
  });
});
