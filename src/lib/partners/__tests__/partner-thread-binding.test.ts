import { describe, expect, it, vi } from "vitest";
import type { RequestedThread } from "@/lib/copilotkit-thread-ownership";

import { enforcePartnerThreadBinding, PARTNER_THREAD_METADATA_KEY } from "../partner-thread-binding";

const USER = "6b51e65f-f7b1-4ad7-9185-f2ecae22eb00";
const CAFE_A = "6a9167cc-7cb6-4837-a7e0-2039654f138c";
const CAFE_B = "17243544-7b84-4f74-b631-f3a44c193e40";

function service(metadata: Record<string, unknown> | null, insertError: { code: string } | null = null) {
  const insert = vi.fn(async () => ({ error: insertError }));
  return {
    insert,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: metadata ? { metadata } : null, error: null }),
          }),
        }),
        insert,
      }),
    } as never,
  };
}

describe("SAN-705 partner thread binding", () => {
  it("rejects a same-user cross-business thread replay", async () => {
    const existing: RequestedThread = { kind: "existing", threadId: "t-a", resourceId: USER };
    const response = await enforcePartnerThreadBinding(
      existing,
      USER,
      CAFE_B,
      service({ [PARTNER_THREAD_METADATA_KEY]: CAFE_A }).client,
    );
    expect(response?.status).toBe(403);
  });

  it("allows the same business and binds a new thread", async () => {
    const same: RequestedThread = { kind: "existing", threadId: "t-a", resourceId: USER };
    expect(
      await enforcePartnerThreadBinding(
        same,
        USER,
        CAFE_A,
        service({ [PARTNER_THREAD_METADATA_KEY]: CAFE_A }).client,
      ),
    ).toBeNull();

    const created = service(null);
    expect(
      await enforcePartnerThreadBinding(
        { kind: "new", threadId: "t-new" },
        USER,
        CAFE_A,
        created.client,
      ),
    ).toBeNull();
    expect(created.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "t-new",
        resourceId: USER,
        metadata: { [PARTNER_THREAD_METADATA_KEY]: CAFE_A },
      }),
    );
  });

  it("rejects a partner thread from a general Concierge request", async () => {
    const response = await enforcePartnerThreadBinding(
      { kind: "existing", threadId: "t-a", resourceId: USER },
      USER,
      null,
      service({ [PARTNER_THREAD_METADATA_KEY]: CAFE_A }).client,
    );
    expect(response?.status).toBe(403);
  });

  it("allows a general thread with no partner binding", async () => {
    expect(
      await enforcePartnerThreadBinding(
        { kind: "existing", threadId: "t-general", resourceId: USER },
        USER,
        null,
        service(null).client,
      ),
    ).toBeNull();
  });

  it("fails closed when thread storage is unavailable", async () => {
    const response = await enforcePartnerThreadBinding(
      { kind: "existing", threadId: "t-a", resourceId: USER },
      USER,
      CAFE_A,
      null,
    );
    expect(response?.status).toBe(503);
  });
});
