"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gallery image with an explicit unavailable state. A failed or missing Storage
 * photo must render a placeholder instead of a broken image.
 */
export function GalleryImage({
  src,
  alt,
  className,
  loading,
  testId,
}: {
  src: string;
  alt: string;
  className: string;
  loading: "eager" | "lazy";
  testId?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        data-testid={testId ? `${testId}-unavailable` : undefined}
        className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}
      >
        <Building2 className="mr-1 size-4" aria-hidden /> Photo unavailable
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      data-testid={testId}
      onError={() => setFailed(true)}
    />
  );
}
