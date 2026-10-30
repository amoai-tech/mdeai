import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getTestSession, QA_HOST_EMAIL, QA_SUPER_ADMIN_EMAIL } from "./auth";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const listUsers = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
  listUsers.mockReset();
  generateLink.mockReset();
  verifyOtp.mockReset();
  vi.mocked(createClient).mockReset().mockImplementation((_url, key) => {
    const auth = key === "test-service"
      ? { admin: { listUsers, generateLink } }
      : { verifyOtp };
    return { auth } as unknown as ReturnType<typeof createClient>;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("QA magic-link safety", () => {
  it("fails before generating a link when the permanent QA account is absent", async () => {
    listUsers.mockResolvedValue({
      data: { users: [], nextPage: null },
      error: null,
    });

    await expect(getTestSession()).rejects.toThrow("refusing magic-link auto-creation");
    expect(generateLink).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("uses the pre-existing QA account and returns a real-shaped session", async () => {
    const session = { access_token: "qa-jwt", refresh_token: "qa-refresh" };
    listUsers.mockResolvedValue({
      data: { users: [{ email: QA_HOST_EMAIL }], nextPage: null },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { email_otp: "test-otp" } }, error: null,
    });
    verifyOtp.mockResolvedValue({ data: { session }, error: null });

    await expect(getTestSession(QA_HOST_EMAIL)).resolves.toEqual(session);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: QA_HOST_EMAIL });
  });

  it("refuses to auto-create the permanent Super Admin QA identity", async () => {
    listUsers.mockResolvedValue({ data: { users: [], nextPage: null }, error: null });
    await expect(getTestSession(QA_SUPER_ADMIN_EMAIL)).rejects.toThrow(
      "refusing magic-link auto-creation",
    );
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("accepts the already-existing Super Admin QA identity", async () => {
    listUsers.mockResolvedValue({ data: { users: [{ email: QA_SUPER_ADMIN_EMAIL }], nextPage: null }, error: null });
    generateLink.mockResolvedValue({ data: { properties: { email_otp: "test-otp" } }, error: null });
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "admin-test-jwt" } }, error: null });
    await expect(getTestSession(QA_SUPER_ADMIN_EMAIL)).resolves.toHaveProperty("access_token", "admin-test-jwt");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: QA_SUPER_ADMIN_EMAIL });
  });

  it("leaves explicitly provisioned throwaway accounts on the existing path", async () => {
    const email = "temporary-test@qa-isolation.mdeai.co";
    generateLink.mockResolvedValue({
      data: { properties: { email_otp: "test-otp" } }, error: null,
    });
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: "temporary-jwt" } },
      error: null,
    });

    await expect(getTestSession(email)).resolves.toHaveProperty("access_token", "temporary-jwt");
    expect(listUsers).not.toHaveBeenCalled();
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email });
  });
});
