"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon } from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_PARTNER_TYPES, type ContactPartnerType } from "@/lib/partners/contact-lead-schema";
import { PARTNER_TYPE_LABELS } from "@/lib/partners/parse-partner-signup-params";
import { submitContactLead } from "@/lib/partners/submit-contact-lead";

const FIELD = "h-11 text-base md:text-sm";
const OPTIONS: Record<ContactPartnerType, string> = { general: "General question", ...PARTNER_TYPE_LABELS };

export function ContactLeadForm({ initialType = "general" }: { initialType?: ContactPartnerType }) {
  const requestId = useRef<string | null>(null);
  // Until React has hydrated, a submit would fall back to a native GET and put
  // the guest's name, email and message in the URL without saving anything.
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [partnerType, setPartnerType] = useState<ContactPartnerType>(initialType);
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Preserve the UUID on retries, including uncertain network outcomes.
      requestId.current ??= crypto.randomUUID();
      const leadId = await submitContactLead({
        requestId: requestId.current,
        name,
        email,
        partnerType,
        businessName,
        message,
      });
      setReceipt(leadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your inquiry");
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <section data-testid="contact-success" className="rounded-2xl border border-border bg-background-elevated p-7" role="status">
        <CheckCircleIcon className="size-8 text-success" aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-semibold">Your inquiry is saved</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you. Our team can use this reference when following up.
        </p>
        <p data-testid="contact-receipt" className="mt-4 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
          Reference: {receipt}
        </p>
        <Link href="/partners" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
          Explore partner programs <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <form data-testid="contact-lead-form" onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7">
      <div className="grid gap-1.5">
        <Label htmlFor="contact-name">Your name</Label>
        <Input id="contact-name" data-testid="contact-name" name="name" autoComplete="name" required minLength={2} maxLength={120} className={FIELD} value={name} onChange={e => setName(e.target.value)} disabled={submitting} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" data-testid="contact-email" name="email" type="email" autoComplete="email" required maxLength={160} className={FIELD} value={email} onChange={e => setEmail(e.target.value)} disabled={submitting} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-type">How can we help?</Label>
        <select id="contact-type" name="partnerType" data-testid="contact-type" className="h-11 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" value={partnerType} onChange={e => setPartnerType(e.target.value as ContactPartnerType)} disabled={submitting}>
          {CONTACT_PARTNER_TYPES.map(type => <option key={type} value={type}>{OPTIONS[type]}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-business">Business name <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="contact-business" name="businessName" data-testid="contact-business" maxLength={160} className={FIELD} value={businessName} onChange={e => setBusinessName(e.target.value)} disabled={submitting} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-message">Tell us what you need</Label>
        <Textarea id="contact-message" name="message" data-testid="contact-message" required minLength={10} maxLength={2000} rows={5} className="text-base md:text-sm" placeholder="Tell us about your business or your question…" value={message} onChange={e => setMessage(e.target.value)} disabled={submitting} />
      </div>
      {error && <p role="alert" data-testid="contact-error" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" data-testid="contact-submit" disabled={submitting || !hydrated}>
        {submitting ? "Sending inquiry…" : "Send inquiry"}
        {!submitting && <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />}
      </Button>
      <p className="text-xs text-muted-foreground">
        We save your inquiry to follow up. No account is needed to contact us.
      </p>
    </form>
  );
}
