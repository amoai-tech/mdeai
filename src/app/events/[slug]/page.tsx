import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventCheckoutNotice } from "@/components/events/event-checkout-notice";
import { EventDetailView } from "@/components/events/event-detail-view";
import { getPublicEventResult } from "@/lib/events/get-public-event";
import { EventUnavailable } from "@/components/events/event-unavailable";

type EventDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: EventDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicEventResult(slug);
  // A temporary read failure must not be titled "Event not found".
  if (result.status !== "ok") {
    return { title: result.status === "not-found" ? "Event not found · mdeai" : "Event unavailable · mdeai" };
  }
  const event = result.event;
  return {
    title: `${event.name} · mdeai`,
    description: event.description ?? `Event information for ${event.name} in Medellín`,
    alternates: { canonical: `/events/${event.slug ?? event.id}` },
    openGraph: {
      title: event.name,
      description: event.description ?? `Event information for ${event.name} in Medellín`,
      ...(event.imageUrl ? { images: [{ url: event.imageUrl }] } : {}),
    },
  };
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { slug } = await params;
  // Allowlist, not a redirect target: only the literal "chat" changes the back link.
  const { from } = await searchParams;
  const result = await getPublicEventResult(slug);
  // Only a genuinely absent event is a 404. A failed read is recoverable.
  if (result.status === "not-found") notFound();
  if (result.status === "unavailable") return <EventUnavailable />;
  const event = result.event;

  return (
    <>
      <Suspense fallback={null}>
        <EventCheckoutNotice />
      </Suspense>
      <EventDetailView event={event} backTo={from === "chat" ? "chat" : "events"} />
    </>
  );
}
