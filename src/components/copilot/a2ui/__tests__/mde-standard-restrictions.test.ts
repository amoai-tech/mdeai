import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { ComponentType, ReactElement } from "react";
import { standardUI } from "@copilotkit/react-core/v2/generative-ui";
import { validateOperation } from "@copilotkit/shared";
import { buildRestrictedStandardComponents, MDE_RESTRICTED_STANDARD_NAMES } from "../mde-standard-restrictions";
import { mdeUI } from "../mde-ui-catalog";

describe("MDE standard component security restrictions", () => {
  it("re-registers every restricted component, delegating to the official renderer", () => {
    for (const name of MDE_RESTRICTED_STANDARD_NAMES) {
      const restricted = mdeUI.components.get(name);
      expect(restricted, name).toBeDefined();
      const official = standardUI.components.get(name)?.component as ComponentType<Record<string, unknown>>;
      const element = (restricted?.component as (props: Record<string, unknown>) => ReactElement | null)({
        url: "https://picsum.photos/seed/a/400/300", href: "https://www.mdeai.co/rentals/1",
        title: "x", text: "x", images: [{ url: "https://picsum.photos/seed/a/400/300" }],
      });
      expect(element?.type, name).toBe(official);
    }
  });

  it("re-checks data-bound URLs when rendering: an untrusted value renders nothing", () => {
    const render = (name: string, props: Record<string, unknown>) =>
      (mdeUI.components.get(name)?.component as (p: Record<string, unknown>) => ReactElement | null)(props);
    const evil = "https://evil.example/a.jpg";
    expect(render("Image", { url: evil })).toBeNull();
    expect(render("CarouselMediaItem", { url: evil })).toBeNull();
    expect(render("Link", { text: "x", href: "https://evil.example/" })).toBeNull();
    expect(render("LinkCard", { title: "x", href: "https://evil.example/" })).toBeNull();
    expect(render("ImageGrid", { images: [{ url: evil }] })).toBeNull();
    const card = render("EntityCard", { title: "x", image: evil, href: "https://evil.example/" });
    expect(card?.props).toEqual({ title: "x" });
    const field = render("TextField", { label: "x", variant: "obscured" });
    expect((field?.props as { variant?: string }).variant).toBe("shortText");
  });

  it("rejects model-chosen URLs and new-tab links, accepts trusted MDE media and pages", () => {
    const props = (name: string) => mdeUI.components.get(name)?.props as z.ZodTypeAny;
    const media = "https://picsum.photos/seed/laureles/800/600";
    const page = "https://www.mdeai.co/rentals/123";
    // Accepted
    expect(props("Image").safeParse({ url: media, description: "Living room" }).success).toBe(true);
    expect(props("Link").safeParse({ text: "Open listing", href: page }).success).toBe(true);
    expect(props("LinkCard").safeParse({ href: page, title: "Listing" }).success).toBe(true);
    expect(props("ImageGrid").safeParse({ images: [{ url: media }] }).success).toBe(true);
    expect(props("CarouselMediaItem").safeParse({ url: media }).success).toBe(true);
    expect(props("EntityCard").safeParse({ title: "Bright 2BR", image: media }).success).toBe(true);
    // Rejected: other hosts, script schemes, protocol-relative, lookalike hosts and new-tab hrefs
    for (const url of ["https://evil.example/x.jpg", "javascript:alert(1)", "//picsum.photos/x", "https://picsum.photos.evil.example/x"]) {
      expect(props("Image").safeParse({ url }).success, url).toBe(false);
      expect(props("CarouselMediaItem").safeParse({ url }).success, url).toBe(false);
      expect(props("ImageGrid").safeParse({ images: [{ url }] }).success, url).toBe(false);
    }
    for (const href of ["https://evil.example/", "https://www.mdeai.co.evil.example/", "javascript:alert(1)", "/rentals/1", "https://www.mdeai.co//evil.example"]) {
      expect(props("Link").safeParse({ text: "x", href }).success, href).toBe(false);
      expect(props("LinkCard").safeParse({ href, title: "x" }).success, href).toBe(false);
    }
    expect(props("Pressable").safeParse({ href: page }).success).toBe(false);
    expect(props("EntityCard").safeParse({ title: "x", href: page }).success).toBe(false);
    expect(props("EntityCard").safeParse({ title: "x", actions: [{ label: "Go", href: page }] }).success).toBe(false);
    expect(props("Image").safeParse({ url: media, actionOverlay: { label: "Go", href: page } }).success).toBe(false);
    expect(props("ImageGrid").safeParse({ images: [{ url: media, href: page }] }).success).toBe(false);
  });

  it("checks normalized storage paths, exact origins and bound values without dynamic regexes", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://qa-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com");
    try {
      const components = buildRestrictedStandardComponents();
      const image = components.Image!.props as z.ZodTypeAny;
      const link = components.Link!.props as z.ZodTypeAny;
      const renderImage = components.Image!.component as (p: Record<string, unknown>) => ReactElement | null;
      const renderLink = components.Link!.component as (p: Record<string, unknown>) => ReactElement | null;
      const publicPhoto = "https://qa-project.supabase.co/storage/v1/object/public/photos/a.jpg";
      expect(image.safeParse({ url: publicPhoto }).success).toBe(true);
      expect(renderImage({ url: publicPhoto })).not.toBeNull();
      for (const url of [
        "https://qa-project.supabase.co/storage/v1/object/sign/photos/a.jpg",
        "https://qa-project.supabase.co/storage/v1/object/public/../sign/photos/a.jpg",
        "https://qa-project.supabase.co/storage/v1/object/public/%2e%2e/sign/photos/a.jpg",
        "https://qa-project.supabase.co:444/storage/v1/object/public/photos/a.jpg",
        "https://picsum.photos@evil.example/x",
        "https://picsum.photos/" + String.fromCharCode(10) + "x",
        "https://upload.wikimedia.org/wikipedia/commons/../private/x.jpg",
      ]) {
        expect(image.safeParse({ url }).success, url).toBe(false);
        expect(renderImage({ url }), url).toBeNull();
      }
      for (const href of ["https://preview.example.com/rentals", "https://mdeai.co/rentals"]) {
        expect(link.safeParse({ text: "Open", href }).success).toBe(true);
        expect(renderLink({ text: "Open", href })).not.toBeNull();
      }
      for (const href of [
        "https://preview.example.com.evil.example/rentals",
        "https://www.mdeai.co@evil.example/rentals",
        "https://www.mdeai.co:444/rentals",
        "https://www.mdeai.co/a/..//evil.example",
        "https://www.mdeai.co/" + String.fromCharCode(92) + "evil.example",
      ]) {
        expect(link.safeParse({ text: "Open", href }).success, href).toBe(false);
        expect(renderLink({ text: "Open", href }), href).toBeNull();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports malformed configured origins without exposing the value or dropping canonical origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://invalid.example/path");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const link = buildRestrictedStandardComponents().Link!.props as z.ZodTypeAny;
      expect(warn).toHaveBeenCalledWith("[MDE GenUI] Invalid NEXT_PUBLIC_SITE_URL; using canonical MDE origins.");
      expect(link.safeParse({ text: "Open", href: "https://invalid.example/rentals" }).success).toBe(false);
      expect(link.safeParse({ text: "Open", href: "https://www.mdeai.co/rentals" }).success).toBe(true);
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("never lets the model build a password field", () => {
    const props = mdeUI.components.get("TextField")?.props as z.ZodTypeAny;
    expect(props.safeParse({ label: "Name", variant: "shortText" }).success).toBe(true);
    expect(props.safeParse({ label: "Password", variant: "obscured" }).success).toBe(false);
  });

  it("documents that the installed manifest validator does not enforce custom URL refinements", () => {
    const options = { manifest: { catalogId: mdeUI.id, components: mdeUI.manifestComponents }, knownSurfaces: new Set<string>() };
    const op = (image: Record<string, unknown>) => ({
      version: "1.0",
      createSurface: { surfaceId: "media", components: [{ id: "root", component: "Image", ...image }] },
    });
    expect(validateOperation(op({ url: "https://picsum.photos/seed/a/400/300" }), options)).toEqual({ ok: true });
    // Installed 1.88.0 manifest validation does not enforce custom URL refinements;
    // the browser rejects literal values through the zod schema (above) and the
    // guarded renderer covers data-bound values. Pin that so an SDK change is noticed.
    expect(validateOperation(op({ url: "https://evil.example/a.jpg" }), options)).toEqual({ ok: true });
  });
});
