import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import type { PlaceCardData } from "@/lib/discovery/fetch-discovery-rows";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function cardHref({ href, query }: Pick<PlaceCardData, "href" | "query">): string {
  return href ?? `/chat?q=${encodeURIComponent(query)}`;
}

/**
 * One real record. With a photo it is photo-led; without one it is an honest text card
 * (a tinted header, never a stand-in picture of something that is not that place).
 */
export function PlaceCard(props: Omit<PlaceCardData, "id">) {
  const { name, kind, rating, meta, why, image, query, href } = props;
  const hasPhoto = isRenderableRemoteImage(image);
  return (
    <Link href={cardHref({ href, query })} className={`group block rounded-xl ${FOCUS}`}>
      <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow duration-200 group-hover:shadow-md motion-reduce:transition-none">
        {hasPhoto ? (
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
            <Image
              src={image}
              alt={name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
            <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90 text-xs font-semibold backdrop-blur-sm">
              {kind}
            </Badge>
          </div>
        ) : (
          <div className="bg-linear-to-br from-primary/10 via-primary/5 to-accent/10 px-4 pb-6 pt-4">
            <Badge variant="secondary" className="bg-background/80 text-xs font-semibold">
              {kind}
            </Badge>
          </div>
        )}

        <CardContent className="flex flex-1 flex-col gap-1.5 p-4">
          <p className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{name}</p>
          {(rating != null || meta) && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground/80">
              {rating != null && <span className="font-bold text-accent-foreground">★ {rating}</span>}
              {meta && <span>{meta}</span>}
            </p>
          )}
          {why && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{why}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

const dayParts = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Bogota" });

/** An event is about *when*: the date leads, in Medellín time, from the event's real start. */
export function EventListRow({ name, kind, meta, why, query, href, startsAt }: Omit<PlaceCardData, "id">) {
  const parts = startsAt ? dayParts.formatToParts(new Date(startsAt)) : [];
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return (
    <Link
      href={cardHref({ href, query })}
      className={`group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none ${FOCUS}`}
    >
      {month && day && (
        <div aria-hidden="true" className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
          <span className="text-sm font-semibold leading-none">{month}</span>
          <span className="mt-1 text-2xl font-bold leading-none">{day}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug text-foreground">{name}</p>
        {meta && <p className="mt-0.5 text-sm font-medium text-foreground/80">{meta}</p>}
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {kind}
          {why ? ` · ${why}` : ""}
        </p>
      </div>
      <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </Link>
  );
}
