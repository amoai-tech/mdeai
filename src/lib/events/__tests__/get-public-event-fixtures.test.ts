import { describe, expect, it, vi } from "vitest";
import { NON_QA_EVENT_SLUG_FILTER, QA_EVENT_NAME_SQL_PATTERN } from "../public-event-fixtures";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { getPublicEvent } from "../get-public-event";

describe("getPublicEvent public details", () => {
  it("excludes known QA markers even for a direct UUID or slug lookup", async () => {
    const q = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(q) } as never);

    expect(await getPublicEvent("qa-hidden-fixture")).toBeNull();
    expect(q.not).toHaveBeenCalledWith("name", "imatch", QA_EVENT_NAME_SQL_PATTERN);
    expect(q.or).toHaveBeenCalledWith(NON_QA_EVENT_SLUG_FILTER);
    expect(q.eq).toHaveBeenCalledWith("slug", "qa-hidden-fixture");

    expect(await getPublicEvent("5f043381-8794-4d39-b8f8-e699f48a8561")).toBeNull();
    expect(q.eq).toHaveBeenCalledWith("id", "5f043381-8794-4d39-b8f8-e699f48a8561");
  });
});
