import Image from "next/image";
import {
  Archive,
  CalendarClock,
  Lock,
  PencilLine,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { VENUE_PLACEHOLDER_GRADIENT } from "@/components/browse/venue-card-placeholder";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import { cn } from "@/lib/utils";
import type { ContestState } from "@/lib/restaurants/contest-state";

/**
 * SAN-1524 · the shared visual language of a restaurant contest.
 *
 * Both public contest routes used to keep their own status label/dot maps, which drifted the
 * moment one page was touched. One definition here: the directory, the contest hero and the
 * nominee cards cannot disagree about what a state is called or what it looks like.
 *
 * Status is always text plus an icon — colour is never the only signal (WCAG 1.4.1).
 */

export const CONTEST_STATE_LABEL: Record<ContestState, string> = {
  open: "Voting open",
  upcoming: "Opens soon",
  closed: "Voting closed",
  draft: "Draft",
  archived: "Archived",
};

const STATE_ICON: Record<ContestState, LucideIcon> = {
  open: Vote,
  upcoming: CalendarClock,
  closed: Lock,
  draft: PencilLine,
  archived: Archive,
};

const STATE_TONE: Record<ContestState, string> = {
  open: "border-primary/30 bg-primary/10 text-primary",
  upcoming: "border-sky-600/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  closed: "border-border bg-muted text-muted-foreground",
  draft: "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
};

export function ContestStatusBadge({
  state,
  className,
}: {
  state: ContestState;
  className?: string;
}) {
  const Icon = STATE_ICON[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        STATE_TONE[state],
        className,
      )}
      data-state={state}
      data-testid="contest-state"
    >
      <Icon aria-hidden className="size-3.5" />
      {CONTEST_STATE_LABEL[state]}
    </span>
  );
}

/** First readable character of a title, used only as a placeholder monogram. */
function contestInitial(title: string): string {
  const match = title.normalize("NFD").match(/[a-z0-9]/i);
  return (match?.[0] ?? "M").toUpperCase();
}

/**
 * The branded cover used when a contest has no genuine image. It borrows the D-03 venue
 * placeholder surface and adds a plate motif, so "no cover yet" reads as designed rather than
 * broken — and never as a photograph of a restaurant that does not belong to this contest.
 */
function ContestCoverPlaceholder({ title }: { title: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      data-testid="contest-cover-placeholder"
      style={{ background: VENUE_PLACEHOLDER_GRADIENT }}
    >
      <div className="absolute -right-16 -top-20 size-64 rounded-full border border-primary/20" />
      <div className="absolute right-8 top-8 size-28 rounded-full border border-primary/25" />
      <div className="absolute -bottom-24 -left-16 size-56 rounded-full border border-primary/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-[clamp(2.75rem,9vw,4.5rem)] font-semibold leading-none tracking-tight text-primary/30">
          {contestInitial(title)}
        </span>
      </div>
    </div>
  );
}

/**
 * Contest cover. A database URL outside the next/image allowlist is not merely ugly — it makes
 * Next throw and takes the page down — so the check happens before the image is rendered and an
 * unexpected value falls back to the branded placeholder.
 */
export function ContestCover({
  coverUrl,
  title,
  className,
  sizes = "100vw",
  priority = false,
}: {
  coverUrl: string | null;
  title: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const hasPhoto = Boolean(coverUrl && isRenderableRemoteImage(coverUrl));
  return (
    <div
      className={cn("relative overflow-hidden bg-muted", className)}
      data-testid="contest-cover"
    >
      {hasPhoto && coverUrl ? (
        <Image
          alt=""
          aria-hidden
          className="object-cover"
          fill
          priority={priority}
          sizes={sizes}
          src={coverUrl}
        />
      ) : (
        <ContestCoverPlaceholder title={title} />
      )}
    </div>
  );
}

/**
 * The one expressive moment on the directory: an abstract plate composition, not a stock photo
 * pretending to be a venue. Decorative, so it carries no accessible name.
 */
export function ContestEditorialArt({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/60",
        className,
      )}
      style={{ background: VENUE_PLACEHOLDER_GRADIENT }}
      data-testid="contests-hero-art"
    >
      <div className="absolute -left-20 -top-16 size-56 rotate-12 rounded-[999px] border border-primary/15" />
      <div className="absolute -bottom-24 -right-16 size-64 rounded-full border border-primary/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex size-[58%] items-center justify-center rounded-full border border-primary/25">
          <div className="flex size-[64%] items-center justify-center rounded-full border border-primary/30 bg-background/40 backdrop-blur-sm">
            <div className="size-[44%] rounded-full bg-primary/15" />
          </div>
        </div>
      </div>
    </div>
  );
}
