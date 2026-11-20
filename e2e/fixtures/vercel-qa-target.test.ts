import { describe, expect, it } from "vitest";
import { validateMdeAuthenticatedQaOrigin } from "./vercel-bypass";

describe("SAN-1445 authenticated QA origin allowlist", () => {
  it.each([
    "https://www.mdeai.co", "https://mdeai.co",
    "https://mdeai-abc123-amo-agency.vercel.app",
  ])("permits the controlled MDE deployment origin %s", (url) => {
    expect(validateMdeAuthenticatedQaOrigin(url).origin).toBe(url);
  });

  it.each([
    "https://attacker.example", "https://mdeai.co.evil.test",
    "http://www.mdeai.co", "https://user:pw@www.mdeai.co",
    "https://www.mdeai.co:8080", "https://www.mdeai.co/other",
    "https://www.mdeai.co/?target=evil", "https://mdeai-evil.vercel.app",
    "https://mdeai-foo-elsewhere.vercel.app",
    "https://mdeai-foo-amo-agency.vercel.app.evil.test",
  ])("refuses potentially untrusted URL %s", (url) => {
    expect(() => validateMdeAuthenticatedQaOrigin(url)).toThrow();
  });
});
