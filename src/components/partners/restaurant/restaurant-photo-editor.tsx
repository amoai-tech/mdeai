"use client";

import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import type { ListingImage } from "@/lib/restaurants/restaurant-owner-schema";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp";

function extensionFor(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * SAN-1541 — cover + gallery for one restaurant.
 *
 * Uploads go to the public `restaurant-photos` bucket under the caller's partner
 * folder, whose storage policy is the same server-controlled assignment as the
 * listing writer. Every image keeps its source so attribution stays truthful.
 */
export function RestaurantPhotoEditor({
  partnerId,
  restaurantId,
  images,
  coverUrl,
  onChange,
  disabled,
}: {
  partnerId: string;
  restaurantId: string;
  images: ListingImage[];
  coverUrl: string;
  onChange: (images: ListingImage[], coverUrl: string) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");

  async function upload(file: File) {
    setError(null);
    if (!ACCEPTED.split(",").includes(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is larger than 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${partnerId}/${restaurantId}/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error: uploadError } = await supabase.storage
        .from("restaurant-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from("restaurant-photos").getPublicUrl(path);
      if (!data.publicUrl) throw new Error("The uploaded photo has no public URL.");
      const next = [...images, { url: data.publicUrl, source: "Uploaded by the restaurant" }];
      onChange(next, coverUrl || data.publicUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload that photo. Try again or add an image URL.",
      );
    } finally {
      setUploading(false);
    }
  }

  function addByUrl(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      setError("Enter a public http(s) image URL.");
      return;
    }
    if (!isRenderableRemoteImage(trimmed)) {
      setError(
        "That host is not approved for public display. Upload the photo here so it is served from MDE storage.",
      );
      return;
    }
    const entry: ListingImage = { url: trimmed };
    if (source.trim()) entry.source = source.trim();
    onChange([...images, entry], coverUrl || trimmed);
    setUrl("");
    setSource("");
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next, coverUrl);
  }

  function remove(index: number) {
    const next = images.filter((_, position) => position !== index);
    const removed = images[index];
    onChange(next, coverUrl === removed.url ? (next[0]?.url ?? "") : coverUrl);
  }

  return (
    <section aria-labelledby="restaurant-photos" data-testid="restaurant-photo-editor">
      <h3 id="restaurant-photos" className="text-base font-semibold">
        Photos
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The cover photo appears on public cards and the restaurant page. Photos keep the source you
        enter, so attribution stays accurate.
      </p>

      {images.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No photos yet. Upload one or add a public image URL.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => {
            const isCover = image.url === coverUrl;
            return (
              <li
                key={`${image.url}-${index}`}
                className="overflow-hidden rounded-xl border border-border"
                data-testid="restaurant-photo-item"
              >
                <div className="relative h-40 w-full bg-muted">
                  <Image
                    src={image.url}
                    alt={image.alt ?? ""}
                    fill
                    sizes="(max-width: 640px) 90vw, 320px"
                    className="object-cover"
                    unoptimized
                  />
                  {isCover ? (
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-xs font-semibold">
                      Cover
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 p-2">
                  <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => move(index, -1)}>
                    ↑
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => move(index, 1)}>
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={disabled || isCover}
                    onClick={() => onChange(images, image.url)}
                  >
                    Use as cover
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-11 text-destructive" disabled={disabled} onClick={() => remove(index)}>
                    Remove
                  </Button>
                  {image.source ? (
                    <span className="w-full truncate text-xs text-muted-foreground">Source: {image.source}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid gap-2">
        <Label htmlFor="restaurant-photo-upload">Upload a photo</Label>
        <input
          id="restaurant-photo-upload"
          data-testid="restaurant-photo-upload"
          type="file"
          accept={ACCEPTED}
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
          className="block w-full text-sm"
        />
        {uploading ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}
      </div>

      {/* Deliberately not a <form>: this control lives inside the listing form, and
          nested forms are invalid HTML (the inner submit would save the listing). */}
      <div className="mt-4 grid gap-2 rounded-xl border border-border p-3">
        <Label htmlFor="restaurant-photo-url">Or add an image URL</Label>
        <Input
          id="restaurant-photo-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addByUrl();
            }
          }}
          placeholder="https://example.com/photo.jpg"
          disabled={disabled}
          maxLength={1000}
        />
        <Input
          aria-label="Photo source (optional)"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Source (optional, e.g. restaurant website)"
          disabled={disabled}
          maxLength={120}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled || uploading}
          onClick={() => addByUrl()}
        >
          Add photo
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="restaurant-photo-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
