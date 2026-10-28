import Link from "next/link";

import type { PartnerProfileRecord } from "@/lib/partners/partner-profile-load";
import { profileValuesFromSettings } from "@/lib/partners/partner-profile-patch";

/**
 * SAN-1579/1540 — the selected-business switcher shared by the partner profile and
 * the restaurant workspace pages. It is navigation only: the server loader decides
 * which businesses are real, so a `?partner=` value can never grant access.
 */
export function PartnerBusinessSwitcher({
  basePath,
  options,
  selectedId,
}: {
  basePath: string;
  options: PartnerProfileRecord[];
  selectedId?: string;
}) {
  if (options.length <= 1) return null;
  return (
    <nav aria-label="Choose your business" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const label =
          profileValuesFromSettings(option.settings).businessName || option.type;
        return (
          <Link
            key={option.id}
            href={`${basePath}?partner=${encodeURIComponent(option.id)}`}
            aria-current={option.id === selectedId ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium ${option.id === selectedId ? "border-accent text-accent" : "border-border text-foreground"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
