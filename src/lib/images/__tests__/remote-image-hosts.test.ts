import { describe, expect, it, vi, afterEach } from "vitest";
import { isRenderableRemoteImage, remoteImageRules } from "../remote-image-hosts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("remote image allowlist", () => {
  it("accepts the declared static hosts over https", () => {
    expect(isRenderableRemoteImage("https://images.unsplash.com/photo-1.jpg")).toBe(true);
    expect(isRenderableRemoteImage("https://picsum.photos/seed/a/400")).toBe(true);
  });

  it("rejects a host that next.config does not declare", () => {
    expect(isRenderableRemoteImage("https://evil.example.com/x.jpg")).toBe(false);
    expect(isRenderableRemoteImage("http://images.unsplash.com/photo.jpg")).toBe(false);
  });

  it("rejects junk without throwing", () => {
    expect(isRenderableRemoteImage(null)).toBe(false);
    expect(isRenderableRemoteImage("")).toBe(false);
    expect(isRenderableRemoteImage("not a url")).toBe(false);
  });

  it("allows Wikimedia Commons files only, not other paths or hosts of that site", () => {
    const commons = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Comuna_13.jpg/960px-Comuna_13.jpg";
    expect(isRenderableRemoteImage(commons)).toBe(true);
    expect(isRenderableRemoteImage("https://upload.wikimedia.org/w/index.php?title=x")).toBe(false);
    expect(isRenderableRemoteImage("https://commons.wikimedia.org/wiki/File:X.jpg")).toBe(false);
    expect(isRenderableRemoteImage(commons.replace("https:", "http:"))).toBe(false);
  });

  it("allows the Supabase storage host only under the public object prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    expect(
      isRenderableRemoteImage("https://abcdefgh.supabase.co/storage/v1/object/public/restaurants/a.jpg"),
    ).toBe(true);
    expect(isRenderableRemoteImage("https://abcdefgh.supabase.co/rest/v1/private.jpg")).toBe(false);
  });

  it("adds no Supabase rule when the project url is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(remoteImageRules().some((rule) => rule.hostname.endsWith(".supabase.co"))).toBe(false);
  });
});
