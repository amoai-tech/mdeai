import { describe, expect, it } from "vitest";
import {
  contestBasePath,
  contestBaseToken,
  contestDetailHref,
} from "../contest-admin-paths";

describe("contest management base paths", () => {
  it("maps the app token to the /app destination", () => {
    expect(contestBaseToken("app")).toBe("app");
    expect(contestBasePath("app")).toBe("/app/contests");
    expect(contestDetailHref("app", "contest-1")).toBe("/app/contests/contest-1");
  });

  it("keeps the legacy admin destination as the default", () => {
    expect(contestBaseToken("admin")).toBe("admin");
    expect(contestBaseToken(undefined)).toBe("admin");
    expect(contestBaseToken("https://evil.example/x")).toBe("admin");
    expect(contestBasePath("admin")).toBe("/admin/contests");
    expect(contestDetailHref("admin", "contest-1")).toBe("/admin/contests/contest-1");
  });
});
