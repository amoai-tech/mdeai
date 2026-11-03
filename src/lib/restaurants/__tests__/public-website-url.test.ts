import { describe, expect, it } from "vitest";

import { normalizePublicRestaurantUrl } from "@/lib/restaurants/public-website-url";

describe("normalizePublicRestaurantUrl", () => {
  it("normalizes a public website", () => {
    expect(normalizePublicRestaurantUrl("restaurant.example/menu")).toBe(
      "https://restaurant.example/menu",
    );
    expect(normalizePublicRestaurantUrl("https://restaurant.example/#top")).toBe(
      "https://restaurant.example/",
    );
  });

  it("blocks local, private and internal targets", () => {
    for (const value of [
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://192.168.1.10",
      "http://172.16.0.9",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://service.internal",
      "http://printer.local",
    ]) {
      expect(normalizePublicRestaurantUrl(value), value).toBeNull();
    }
  });

  it("blocks unexpected schemes, credentials and ports", () => {
    expect(normalizePublicRestaurantUrl("file:///etc/passwd")).toBeNull();
    expect(normalizePublicRestaurantUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePublicRestaurantUrl("https://user:pass@restaurant.example")).toBeNull();
    expect(normalizePublicRestaurantUrl("http://restaurant.example:8080")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(normalizePublicRestaurantUrl("   ")).toBeNull();
  });
});
