import { renderNewLeadMessage, renderReminderMessage } from "../_shared/lead-notify-templates.ts";

Deno.test("new inquiry notification includes the reply destination and only grounded listing context", () => {
  const output = renderNewLeadMessage({
    landlordFirstName: "Luis",
    apartmentTitle: "Laureles furnished flat",
    apartmentNeighborhood: "Laureles",
    renterName: "Camila",
    moveWhen: "soon",
    messageSnippet: "Can I see the flat next week?",
    leadUrl: "https://www.mdeai.co/app/rentals/inbox",
  });
  if (!output.includes("Camila") || !output.includes("Laureles") ||
      !output.includes("/app/rentals/inbox")) {
    throw new Error("Notification omitted renter, listing, or host inbox route");
  }
  if (output.length > 1600) throw new Error("Notification exceeds provider body limit");
});

Deno.test("reminder is bounded even when a listing has a very long title", () => {
  const output = renderReminderMessage({
    ageLabel: "30 minutos",
    renterName: "Camila",
    apartmentTitle: "A".repeat(800),
    leadUrl: "https://www.mdeai.co/app/rentals/inbox",
  });
  if (output.length > 1600 || !output.includes("Camila")) {
    throw new Error("Reminder is invalid");
  }
});
