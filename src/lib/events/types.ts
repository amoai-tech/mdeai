export type PublicEventTicket = {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  qtyTotal: number;
  qtySold: number;
  position: number;
};

/** Denormalized host snapshot from events.details.host_display (SAN-135 Option C). */
export type PublicEventHost = {
  name: string;
  avatarUrl: string | null;
};

export type PublicEventVenue = {
  name: string;
  address: string | null;
  city: string | null;
};

/** Optional practical details stored in events.details; every field is shown only when present. */
export type PublicEventFacts = {
  artist: string | null;
  genre: string | null;
  ticketInfo: string | null;
  listingSource: string | null;
  highlights: string[];
};

export type PublicEventDetail = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  startsAt: string;
  endsAt: string | null;
  imageUrl: string | null;
  source?: string | null;
  mapsUrl?: string | null;
  currency: string | null;
  latitude: number | null;
  longitude: number | null;
  host: PublicEventHost | null;
  venue: PublicEventVenue | null;
  facts?: PublicEventFacts | null;
  tickets: PublicEventTicket[];
};
