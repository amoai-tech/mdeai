import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { deleteThrowawayIdentity } from "./auth";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const identity = {
  email: "qa-cleanup-test-unique@qa-isolation.mdeai.co",
  userId: "00000000-0000-4000-8000-000000000001",
};
const threadId = "00000000-0000-4000-8000-000000000002";
type Row = { id: string };
type DbResult = { data: Row[] | null; error: { message: string } | null; count?: number };

function simulatedAdmin({
  permanentFailure = false,
}: { permanentFailure?: boolean } = {}) {
  const threads = new Set([threadId]);
  const messages = new Set(["message-1", "message-2"]);
  const profiles = new Set([identity.userId]);
  let authExists = true;
  let messageDeleteAttempts = 0;
  let profileDeleteAttempts = 0;

  const from = (table: string) => {
    let operation: "select" | "delete" = "select";
    let countOnly = false;
    const execute = (field: string, value: unknown): Promise<DbResult> => {
      if (operation === "delete" && table === "mastra_messages") {
        messageDeleteAttempts++;
        if (permanentFailure) return Promise.resolve({ data: null, error: { message: "permission denied" } });
        if (messageDeleteAttempts === 1) return Promise.reject(new TypeError("fetch failed"));
        messages.clear();
      }
      if (operation === "delete" && table === "mastra_threads") threads.clear();
      if (operation === "delete" && table === "profiles") {
        profileDeleteAttempts++;
        if (profileDeleteAttempts === 1) return Promise.resolve({ data: null, error: { message: "502 Bad Gateway" } });
        profiles.clear();
      }
      const ids = table === "mastra_threads"
        ? [...threads]
        : table === "mastra_messages" ? [...messages] : [...profiles];
      const selected = ids.filter(() => {
        if (table === "mastra_threads") return field === "resourceId" && value === identity.userId;
        if (table === "mastra_messages") return field === "thread_id" && Array.isArray(value) && value.includes(threadId);
        return field === "id" && value === identity.userId;
      }).map((id) => ({ id }));
      return Promise.resolve({ data: countOnly ? null : selected, count: countOnly ? selected.length : undefined, error: null });
    };
    const chain = {
      select(_columns: string, options?: { head?: boolean }) { operation = "select"; countOnly = Boolean(options?.head); return chain; },
      delete() { operation = "delete"; return chain; },
      eq(field: string, value: unknown) { return execute(field, value); },
      in(field: string, value: unknown[]) { return execute(field, value); },
    };
    return chain;
  };
  const admin = {
    from,
    auth: { admin: {
      deleteUser: async () => { authExists = false; return { error: null }; },
      getUserById: async () => ({ data: { user: authExists ? { id: identity.userId } : null }, error: null }),
    } },
  };
  return { admin, state: () => ({
    threads: threads.size, messages: messages.size, profiles: profiles.size,
    authExists, messageDeleteAttempts, profileDeleteAttempts,
  }) };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
  vi.mocked(createClient).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("disposable QA cleanup", () => {
  it("retries only transient deletes and proves no orphan messages, threads, profile or auth user", async () => {
    const { admin, state } = simulatedAdmin();
    vi.mocked(createClient).mockReturnValue(admin as unknown as ReturnType<typeof createClient>);
    await deleteThrowawayIdentity(identity);
    expect(state()).toMatchObject({
      threads: 0, messages: 0, profiles: 0, authExists: false,
      messageDeleteAttempts: 2, profileDeleteAttempts: 2,
    });
  });

  it("does not hide a permission failure or endlessly retry it", async () => {
    const { admin, state } = simulatedAdmin({ permanentFailure: true });
    vi.mocked(createClient).mockReturnValue(admin as unknown as ReturnType<typeof createClient>);
    await expect(deleteThrowawayIdentity(identity)).rejects.toThrow("delete messages: permission denied");
    expect(state().messageDeleteAttempts).toBe(1);
    // Do not delete the QA auth owner and strand uncleanable private thread rows.
    expect(state()).toMatchObject({ authExists: true, profiles: 1, threads: 1, messages: 2 });
  });

  it("refuses a non-QA account before touching the service-role client", async () => {
    await expect(deleteThrowawayIdentity({ ...identity, email: "real@example.com" }))
      .rejects.toThrow("non-disposable QA identity");
    expect(createClient).not.toHaveBeenCalled();
  });
});
