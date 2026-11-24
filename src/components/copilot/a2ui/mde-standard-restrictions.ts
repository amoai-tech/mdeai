import { createElement, type ComponentType } from "react";
import { z } from "zod";
import { standardUI } from "@copilotkit/react-core/v2/generative-ui";
import { remoteImageRules } from "@/lib/images/remote-image-hosts";

/**
 * SAN-1675 — official Standard Catalog components that take a URL or a
 * sensitive input mode, re-registered with the official renderer and a
 * narrower schema. CopilotKit validates literal props in the browser against the schema;
 * the guarded renderer also validates bound
 * values. Manifest descriptions alone are not an enforcement boundary.
 *
 * - Image URLs: only the hosts `next/image` already trusts (`remote-image-hosts.ts`).
 * - Links: only MDE's own pages. `safeHref` in the SDK opens absolute http(s)
 *   only, so a relative path would silently do nothing.
 * - "Opens this URL in a new tab" props on cards/media/Pressable are removed;
 *   navigation from those uses events bound to registered MDE functions.
 * - TextField loses `variant: "obscured"`: no model-built password fields.
 *
 * The SDK validates literal props with these schemas but skips a prop bound to
 * the data model (`{"@path": "/img"}`), whose value arrives later. So each
 * URL component also re-checks the resolved value when it renders: an
 * untrusted image or link renders nothing instead of reaching the browser.
 */

/** Keep raw browser-normalized characters out before parsing an absolute URL. */
function parseTrustedCandidate(value: unknown): URL | null {
  if (typeof value !== "string" || /[\s"'<>\\]/.test(value)) return null;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return null;
  }
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function siteOrigins(): string[] {
  // Fixed canonical MDE deployment domains; configuration may add a trusted
  // preview/dev origin, but cannot replace these production destinations.
  const origins = ["https://www.mdeai.co", "https://mdeai.co"];
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const url = parseTrustedCandidate(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
    const local = url?.hostname === "localhost" || url?.hostname === "127.0.0.1";
    if (url && (url.protocol === "https:" || (local && url.protocol === "http:"))
      && url.pathname === "/" && !url.search && !url.hash) {
      origins.push(url.origin);
    } else {
      console.warn("[MDE GenUI] Invalid NEXT_PUBLIC_SITE_URL; using canonical MDE origins.");
    }
  }
  return [...new Set(origins)];
}

type StandardName = Parameters<typeof standardUI.components.get>[0];
type Definition = NonNullable<ReturnType<typeof standardUI.components.get>>;
type Shape = Record<string, z.ZodTypeAny>;

/**
 * The official definition with its props reshaped. Returns null when an SDK
 * upgrade changes the shape we expect, so the caller can omit the component
 * instead of exposing an unrestricted version or crashing every surface.
 */
type Props = Record<string, unknown>;

function guarded(Official: ComponentType<Props>, sanitize: (props: Props) => Props | null) {
  function GuardedStandardComponent(props: Props) {
    const safe = sanitize(props);
    return safe ? createElement(Official, safe) : null;
  }
  GuardedStandardComponent.displayName = `MdeGuarded(${Official.displayName ?? Official.name ?? "Standard"})`;
  return GuardedStandardComponent;
}

function restrict(
  name: StandardName,
  edit: (props: z.ZodObject<Shape>) => z.ZodObject<Shape> | null,
  sanitize?: (props: Props) => Props | null,
): Definition | null {
  const official = standardUI.components.get(name);
  if (!official || !(official.props instanceof z.ZodObject)) return null;
  let props: z.ZodObject<Shape> | null;
  try {
    props = edit(official.props as z.ZodObject<Shape>);
  } catch {
    return null;
  }
  if (!props) return null;
  const { parameterOrder, ...rest } = official as Definition & { parameterOrder?: readonly string[] };
  // The SDK requires every listed name to still be a prop, slot or event.
  const kept = new Set([
    ...Object.keys(props.shape),
    ...Object.keys((official as { slots?: object }).slots ?? {}),
    ...Object.keys((official as { events?: object }).events ?? {}),
  ]);
  return {
    ...rest,
    ...(parameterOrder ? { parameterOrder: parameterOrder.filter((key) => kept.has(key)) } : {}),
    ...(sanitize ? { component: guarded(official.component as ComponentType<Props>, sanitize) } : {}),
    props: props.strict(),
  } as Definition;
}

/** The element schema of an optional array prop, or null when the shape drifted. */
function arrayElement(props: z.ZodObject<Shape>, key: string): z.ZodObject<Shape> | null {
  let field: z.ZodTypeAny | undefined = props.shape[key];
  while (field instanceof z.ZodOptional || field instanceof z.ZodNullable) field = field.unwrap();
  if (!(field instanceof z.ZodArray) || !(field.element instanceof z.ZodObject)) return null;
  return field.element as z.ZodObject<Shape>;
}

function has(props: z.ZodObject<Shape>, ...keys: string[]): boolean {
  return keys.every((key) => key in props.shape);
}

export function buildRestrictedStandardComponents() {
  const rules = remoteImageRules();
  const origins = siteOrigins();
  const isImage = (value: unknown): boolean => {
    const url = parseTrustedCandidate(value);
    if (!url || typeof value !== "string" || url.protocol !== "https:") return false;
    return rules.some((rule) => {
      const prefix = rule.pathPrefix ?? "/";
      return value.startsWith(`https://${rule.hostname}${prefix}`) &&
        url.hostname === rule.hostname && !url.port && url.pathname.startsWith(prefix);
    });
  };
  const isLink = (value: unknown): boolean => {
    const url = parseTrustedCandidate(value);
    if (!url || typeof value !== "string" || !origins.includes(url.origin)) return false;
    const path = value.slice(url.origin.length);
    return value.startsWith(`${url.origin}/`) && !path.startsWith("//") && !url.pathname.startsWith("//");
  };
  const imageUrl = z.string().refine(isImage, "Only stored MDE media URLs").describe("HTTPS stored media from trusted MDE image hosts");
  const mdeLink = z.string().refine(isLink, "Only links to MDE pages").describe("Absolute links to trusted MDE pages");
  // Drop an untrusted optional image; drop new-tab props even if bound.
  const without = (props: Props, ...keys: string[]) => {
    const copy = { ...props };
    for (const key of keys) delete copy[key];
    return copy;
  };
  const optionalImage = (props: Props, key: string) =>
    props[key] === undefined || isImage(props[key]) ? props : without(props, key);

  const definitions: Record<string, Definition | null> = {
    Pressable: restrict("Pressable", (props) =>
      has(props, "href") ? props.omit({ href: true }) : null,
    (props) => without(props, "href")),
    TextField: restrict("TextField", (props) =>
      has(props, "variant")
        ? props.extend({
            variant: z.enum(["shortText", "longText", "number", "email", "url", "tel"]).optional(),
          })
        : null,
    (props) => props.variant === "obscured" ? { ...props, variant: "shortText" } : props),
    EntityCard: restrict("EntityCard", (props) =>
      has(props, "href", "actions", "image")
        ? props.omit({ href: true, actions: true }).extend({ image: imageUrl.optional() })
        : null,
    (props) => optionalImage(without(props, "href", "actions"), "image")),
    Image: restrict("Image", (props) =>
      has(props, "url", "actionOverlay")
        ? props.omit({ actionOverlay: true }).extend({ url: imageUrl })
        : null,
    (props) => isImage(props.url) ? without(props, "actionOverlay") : null),
    ImageGrid: restrict("ImageGrid", (props) => {
      const item = arrayElement(props, "images");
      if (!item || !has(item, "url", "href")) return null;
      return props.extend({
        images: z.array(item.omit({ href: true }).extend({ url: imageUrl }).strict()).optional(),
      });
    }, (props) => {
      if (!Array.isArray(props.images)) return props;
      const images = props.images.flatMap((entry: unknown) =>
        entry && typeof entry === "object" && isImage((entry as Props).url)
          ? [without(entry as Props, "href")]
          : []);
      return images.length > 0 ? { ...props, images } : null;
    }),
    CarouselMediaItem: restrict("CarouselMediaItem", (props) =>
      has(props, "url", "href") ? props.omit({ href: true }).extend({ url: imageUrl }) : null,
    (props) => isImage(props.url) ? without(props, "href") : null),
    Link: restrict("Link", (props) =>
      has(props, "href") ? props.extend({ href: mdeLink }) : null,
    (props) => isLink(props.href) ? props : null),
    LinkCard: restrict("LinkCard", (props) =>
      has(props, "href", "image")
        ? props.extend({ href: mdeLink, image: imageUrl.optional() })
        : null,
    (props) => isLink(props.href) ? optionalImage(props, "image") : null),
  };
  return definitions;
}

export const MDE_RESTRICTED_STANDARD_NAMES = [
  "Pressable", "TextField", "EntityCard", "Image", "ImageGrid", "CarouselMediaItem", "Link", "LinkCard",
] as const;
