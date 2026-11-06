import { describe, expect, it, vi } from "vitest";
import { settleOwnedCleanup } from "./auth";

/**
 * A failed cleanup must never be silent. The helper that deletes a disposable
 * identity throws on partial cleanup on purpose; swallowing that is what previously
 * left orphaned rows behind.
 */
describe("settleOwnedCleanup", () => {
  it("rethrows a cleanup failure when the test body passed", async () => {
    // A green run must prove nothing leaked, so this fails the test.
    const cleanup = vi.fn().mockRejectedValue(new Error("Mastra rows remain after 3 cleanup attempts"));
    await expect(
      settleOwnedCleanup({ email: "qa-x@qa-isolation.mdeai.co", bodyError: null, cleanup }),
    ).rejects.toThrow(/Mastra rows remain/);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("reports the cleanup failure but preserves the original error when the body failed", async () => {
    const logged: string[] = [];
    const cleanup = vi.fn().mockRejectedValue(new Error("delete identity: 502"));
    await expect(
      settleOwnedCleanup({
        email: "qa-y@qa-isolation.mdeai.co",
        bodyError: new Error("seed insert failed"),
        cleanup,
        log: (message) => logged.push(message),
      }),
    ).resolves.toBeUndefined();
    // The cleanup problem is surfaced, so an operator can find the account.
    expect(logged.join("\n")).toContain("qa-y@qa-isolation.mdeai.co");
    expect(logged.join("\n")).toContain("delete identity: 502");
  });

  it("does nothing when cleanup succeeds", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    await expect(
      settleOwnedCleanup({ email: "qa-z@qa-isolation.mdeai.co", bodyError: null, cleanup }),
    ).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
