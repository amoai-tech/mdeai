import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Home,
  Map,
  MapPin,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Ticket,
} from "lucide-react";

import type { PartnerSignupType } from "@/lib/partners/partner-types";

export type PartnerTypePickerMeta = {
  description: string;
  cta: string;
  Icon: LucideIcon;
};

export const PARTNER_TYPE_PICKER: Record<PartnerSignupType, PartnerTypePickerMeta> = {
  host: {
    description:
      "Publish salsa nights, workshops, and ticketed experiences.",
    cta: "Start as host",
    Icon: Ticket,
  },
  venue: {
    description:
      "Rooftops, clubs, and spaces — get discovered in chat and on the map.",
    cta: "Start as venue",
    Icon: MapPin,
  },
  broker: {
    description:
      "List units and receive qualified viewing requests from renters.",
    cta: "Start as broker",
    Icon: Home,
  },
  sponsor: {
    description:
      "Reach tourists and locals through events and curated placements.",
    cta: "Start as sponsor",
    Icon: Sparkles,
  },
  agency: {
    description:
      "Manage multiple clients — events, listings, and campaigns.",
    cta: "Start as agency",
    Icon: Building2,
  },
  vendor: {
    description:
      "Sell products and services surfaced in concierge recommendations.",
    cta: "Start as vendor",
    Icon: ShoppingBag,
  },
  tour: {
    description: "City tours, experiences, and activity bookings.",
    cta: "Start as tour operator",
    Icon: Map,
  },
  creator: {
    description:
      "Affiliate listings, content partnerships, and audience monetization.",
    cta: "Start as creator",
    Icon: Smartphone,
  },
};

export const PARTNER_SIGNUP_FAQ = [
  {
    id: "free",
    question: "Is signup free?",
    answer:
      "Phase 1 activation is free. Partner plans and lead fees are defined separately.",
  },
  {
    id: "gbp",
    question: "Do I need a Google Business Profile?",
    answer:
      "Not for draft activation. Verification gates going live in the full wizard (Phase 2).",
  },
  {
    id: "live-types",
    question: "Which partner programs can I join?",
    answer:
      "You can create a draft account in eight partner categories. Publishing and operating tools depend on your program and its verification requirements.",
  },
] as const;

export const PARTNER_SIGNUP_STEPS = [
  {
    id: "pick",
    title: "Pick your type",
    description: "Host, venue, broker, or five other programs.",
  },
  {
    id: "activate",
    title: "Start with a draft partner profile",
    description: "Business profile creates your draft partner account.",
  },
  {
    id: "live",
    title: "Publish when eligible",
    description: "Signing up does not publish a listing or event. Each program has its own review and publication checks.",
  },
] as const;
