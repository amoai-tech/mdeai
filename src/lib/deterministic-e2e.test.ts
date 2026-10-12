import { afterEach, describe, expect, it, vi } from "vitest";
import { isDeterministicE2E } from "./deterministic-e2e";

afterEach(() => vi.unstubAllEnvs());

describe("deterministic chat build flag", () => {
  it.each([
    { nodeEnv: "production", flag: "1", expected: false },
    { nodeEnv: "production", flag: "0", expected: false },
    { nodeEnv: "development", flag: "1", expected: true },
    { nodeEnv: "development", flag: "0", expected: false },
    { nodeEnv: "test", flag: "1", expected: true },
  ])("NODE_ENV=$nodeEnv, E2E flag=$flag => $expected", ({ nodeEnv, flag, expected }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", flag);
    expect(isDeterministicE2E()).toBe(expected);
  });
});
