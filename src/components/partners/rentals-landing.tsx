import {
  CalendarDaysIcon,
  ClipboardListIcon,
  HouseIcon,
  MapPinIcon,
  MessageSquareIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";

import { PartnerLandingShell } from "@/components/partners/partner-landing-shell";

const SIGNUP = "/partners/signup?type=broker";
const CONTACT = "/contact?type=broker";

/** SAN-691: informative illustration only; it is not live rental inventory. */
function RentalJourneyVisual() {
  const steps = [
    { label: "Search", detail: "Explore neighbourhoods", Icon: SearchIcon },
    { label: "Details", detail: "Compare rental information", Icon: HouseIcon },
    { label: "Viewing", detail: "Ask to see a property", Icon: CalendarDaysIcon },
  ];
  return (
    <div className="w-full max-w-sm rounded-3xl border border-border bg-background/95 p-5 shadow-xl" aria-label="Example of the MDE rental discovery journey">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">How renters discover</p>
      <p className="mt-2 text-xl font-semibold text-foreground">From search to a viewing</p>
      <ol className="mt-5 grid gap-3">
        {steps.map(({ label, detail, Icon }, index) => (
          <li key={label} className="flex items-center gap-4 rounded-xl border border-border bg-background-elevated/60 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"><Icon className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{index + 1}. {label}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">Illustration of the user journey, not an available apartment or confirmed appointment.</p>
    </div>
  );
}

export function RentalsLanding() {
  return (
    <PartnerLandingShell
      testId="rentals-partner"
      hero={{
        kicker: "For landlords and rental brokers",
        h1: "Be there when renters start looking.",
        sub: "Present your Medellín rentals where people browse neighbourhoods, compare apartment details and start a viewing request. Keep your listing information accurate, with no invented availability.",
        primaryHref: SIGNUP,
        primaryLabel: "List your rental",
        secondaryHref: CONTACT,
        secondaryLabel: "Ask a question",
        visual: <RentalJourneyVisual />,
        trustPills: ["Built for Medellín rentals", "Start with existing partner signup"],
      }}
      valueProps={[
        { icon: SearchIcon, title: "Help renters find you", body: "Make your rental information discoverable alongside neighbourhood searches and apartment details." },
        { icon: CalendarDaysIcon, title: "A path to viewings", body: "Let interested renters request a viewing through MDE's existing rental journey where supported." },
        { icon: ClipboardListIcon, title: "One onboarding path", body: "Use MDE's existing broker signup to begin adding or managing listings. No separate application system." },
      ]}
      features={[
        { icon: HouseIcon, title: "Apartment details", body: "Show photos and apartment facts you can supply accurately. Unknown information stays unknown." },
        { icon: MapPinIcon, title: "Neighbourhood discovery", body: "Renters can explore locations on the map when a listing has supported coordinates." },
        { icon: MessageSquareIcon, title: "Viewing interest", body: "Connect people interested in an apartment with the existing viewing-request workflow." },
        { icon: SparklesIcon, title: "AI-assisted discovery", body: "The concierge can surface grounded apartment information from the existing rental search." },
      ]}
      howItWorks={[
        { n: 1, title: "Start broker signup", sub: "Choose the rental partner program through MDE's current onboarding flow." },
        { n: 2, title: "Add rental details", sub: "Describe your properties and use accurate prices, locations and photos." },
        { n: 3, title: "Connect with renters", sub: "Help interested renters move from discovery to viewing requests." },
      ]}
      pricingLine="Let's discuss the right approach for your rentals."
      pricingIntro="No price or commission is shown until MDE has confirmed your actual terms."
      signupHref={SIGNUP}
      audienceLabel="rental business"
      demoHeading="Have a property to share?"
      demoDescription="Get started with broker signup, or send us a question first."
      closingPrimaryLabel="List your rental"
      closingSecondaryHref={CONTACT}
      pricingHref={CONTACT}
      reassurancePills={["Existing partner signup", "Ask before you register", "Accurate listing information"]}
    />
  );
}
