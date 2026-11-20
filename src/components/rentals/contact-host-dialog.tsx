"use client";

import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type MoveWhen = "now" | "soon" | "later";

/** Contact Host is an inquiry, never a booking or an appointment confirmation. */
export function ContactHostDialog({ apartmentId, title }: { apartmentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [moveWhen, setMoveWhen] = useState<MoveWhen>("soon");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  // A stable request ID survives in-modal retries and prevents duplicate inbox rows.
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || status === "saved") return;
    submitting.current = true;
    setStatus("saving");
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const { data, error: invokeError } = await createClient().functions.invoke("lead-from-form", {
        body: {
          apartment_id: apartmentId,
          request_id: requestId.current,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          move_when: moveWhen,
          message: message.trim(),
        },
      });
      if (invokeError || !data?.success || !data?.data?.lead_id) {
        throw new Error("Inquiry was not confirmed as saved");
      }
      setStatus("saved");
    } catch {
      // A transport error might follow a successful commit. Retain requestId for safe retry.
      setError("We couldn't confirm your inquiry. Please retry; your message will not be duplicated.");
      setStatus("idle");
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (status !== "saving") setOpen(next); }}>
      <DialogTrigger render={<Button type="button" variant="outline" data-testid="rental-contact-host-cta" />}>
        Contact Host
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="rental-contact-host-dialog">
        <DialogHeader>
          <DialogTitle>Contact Host</DialogTitle>
          <DialogDescription>
            Ask about {title}. This sends an inquiry to the host, not a confirmed booking.
          </DialogDescription>
        </DialogHeader>
        {status === "saved" ? (
          <div role="status" data-testid="rental-contact-host-success" className="space-y-3">
            <p>Your inquiry was saved. The host can reply to the email you provided.</p>
            <Button type="button" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" data-testid="rental-contact-host-form">
            <label className="block text-sm font-medium" htmlFor="contact-host-name">Your name</label>
            <input id="contact-host-name" name="name" autoComplete="name" required maxLength={60}
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2" />
            <label className="block text-sm font-medium" htmlFor="contact-host-email">Email for the host to reply</label>
            <input id="contact-host-email" name="email" type="email" autoComplete="email" required maxLength={254}
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2" />
            <label className="block text-sm font-medium" htmlFor="contact-host-when">When do you want to move?</label>
            <select id="contact-host-when" value={moveWhen}
              onChange={(e) => setMoveWhen(e.target.value as MoveWhen)}
              className="w-full rounded-md border border-input bg-background p-2">
              <option value="now">As soon as possible</option>
              <option value="soon">Within 1–3 months</option>
              <option value="later">Later / flexible</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="contact-host-message">Message (optional)</label>
            <textarea id="contact-host-message" rows={3} maxLength={1000}
              value={message} onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2" />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={status === "saving"} data-testid="rental-contact-host-submit">
              {status === "saving" ? "Sending inquiry…" : "Send inquiry"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
