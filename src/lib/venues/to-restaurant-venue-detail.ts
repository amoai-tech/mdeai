import type { RestaurantVenueDetail } from "@/components/chat/rental-ui-context";

export function toRestaurantVenueDetail(input: {
  pinId: string;
  title: string;
  restaurantId?: string | null;
  placeId?: string | null;
  mapsUrl?: string | null;
  neighborhood?: string;
  cuisine?: string;
  rating?: number;
  aiSummary?: string | null;
  rank?: number;
}): RestaurantVenueDetail {
  return {
    kind: "restaurant",
    pinId: input.pinId,
    title: input.title,
    restaurantId: input.restaurantId ?? undefined,
    placeId: input.placeId ?? undefined,
    mapsUrl: input.mapsUrl ?? undefined,
    neighborhood: input.neighborhood,
    cuisine: input.cuisine,
    rating: input.rating,
    summary: input.aiSummary ?? undefined,
    rank: input.rank,
  };
}
