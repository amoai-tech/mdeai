import {
  venueLeadInputSchema,
  type VenueLeadInput,
  type VenueLeadResult,
} from "./venue-lead-schema";

/**
 * SAN-661 · MKT — For Venues landing (/venues).
 * Client helper: validates then POSTs to /api/partners/venue-leads.
 */
export async function submitVenueLead(
  input: VenueLeadInput,
): Promise<VenueLeadResult> {
  // Safe-parse so the form shows the first human validation message instead of
  // Zod's serialized issue list (the default ZodError.message).
  const parsed = venueLeadInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Please check the form and try again",
    );
  }
  const payload = parsed.data;

  const res = await fetch("/api/partners/venue-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as {
    success?: boolean;
    leadId?: string;
    message?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.success || !json.leadId) {
    throw new Error(json.error?.message ?? "Could not send your request");
  }

  return {
    leadId: json.leadId,
    message: json.message ?? "Thanks — we'll be in touch within 1 business day.",
  };
}
