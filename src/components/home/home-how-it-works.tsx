import { MessageSquareIcon, MapPinIcon, MousePointerClickIcon } from "lucide-react";

// A real sequence, so the numbering carries information. No device mock-up and no stock photos.
const steps = [
  {
    id: 1,
    Icon: MessageSquareIcon,
    title: "Ask",
    desc: "Type what you want in your own words, like \"1BR near El Poblado\" or \"cafés to work from\".",
  },
  {
    id: 2,
    Icon: MapPinIcon,
    title: "Explore on the map",
    desc: "Results appear as cards, with their places marked on the map.",
  },
  {
    id: 3,
    Icon: MousePointerClickIcon,
    title: "Open the details",
    desc: "Open a listing, save it, or ask the concierge a follow-up question.",
  },
] as const;

export function HomeHowItWorks() {
  return (
    <div id="how-it-works" className="scroll-mt-20">
      <h3 className="text-xl font-semibold tracking-tight text-foreground">How it works</h3>
      <ol className="mt-5 flex flex-col gap-5">
        {steps.map(({ id, Icon, title, desc }) => (
          <li key={id} className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground" aria-hidden="true">
              {id}
            </span>
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                {title}
              </p>
              <p className="mt-0.5 text-base leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
