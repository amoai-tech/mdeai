import type { ContactLeadInput } from "@/lib/partners/contact-lead-schema";

export async function submitContactLead(payload: ContactLeadInput): Promise<string> {
  const response = await fetch("/api/partners/contact-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== "object") throw new Error("Could not save your inquiry");
  const body = result as Record<string, unknown>;
  if (!response.ok || body.success !== true || typeof body.leadId !== "string") {
    const message = body.error && typeof body.error === "object"
      ? (body.error as Record<string, unknown>).message : undefined;
    throw new Error(typeof message === "string" ? message : "Could not save your inquiry");
  }
  return body.leadId;
}
