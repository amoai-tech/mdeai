import type { Metadata } from "next";
import Link from "next/link";

import { ContactLeadForm } from "@/components/partners/contact-lead-form";
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { isPartnerType } from "@/lib/partners/parse-partner-signup-params";

export const metadata: Metadata = {
  title: "Contact MDE · Partner inquiries",
  description: "Ask about partnering with MDE, listing a rental, hosting an event, or getting started with local discovery.",
};

export default async function ContactPage({ searchParams }: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const params = await searchParams;
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialType = isPartnerType(type) ? type : "general";
  return (
    <MarketingPageShell accent="gold" mainTestId="contact-page">
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-5 lg:gap-20">
          <div className="lg:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Start a conversation</span>
            <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">Tell us what you&apos;re building.</h1>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Whether you run a rental, venue, event or local business, share what you need. We’ll save your inquiry for follow-up.
            </p>
            <p className="mt-5 text-sm text-muted-foreground">
              Ready to start now? <Link href="/partners/signup" className="font-medium text-accent underline-offset-4 hover:underline">Explore partner signup</Link>.
            </p>
          </div>
          <div className="lg:col-span-3"><ContactLeadForm initialType={initialType} /></div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
