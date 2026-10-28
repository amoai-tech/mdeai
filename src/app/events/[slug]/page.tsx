import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventCheckoutNotice } from "@/components/events/event-checkout-notice";
import { EventDetailView } from "@/components/events/event-detail-view";
import { getPublicEvent } from "@/lib/events/get-public-event";

type EventDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: EventDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) {
    return { title: "Event not found · mdeai" };
  }
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
  const event = await getPublicEvent(slug);
  if (!event) notFound();

  return (
    <>
      <Suspense fallback={null}>
        <EventCheckoutNotice />
      </Suspense>
      <EventDetailView event={event} backTo={from === "chat" ? "chat" : "events"} />
    </>
  );
}
