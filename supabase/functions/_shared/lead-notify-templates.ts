/**
 * WhatsApp message templates for lead notifications — D11.5.
 *
 * Plain text bodies in Spanish (es-CO), formal "tú" register since
 * landlords are peers (not customers). Two templates:
 *
 *   1. New lead — fired on landlord_inbox INSERT (channel='form').
 *   2. 30-min reminder — fired by lead-reminder-tick if status='new'
 *      and reminder_sent_at IS NULL after 30 min.
 *
 * Pure functions. The deno test asserts content + length so a careless
 * edit doesn't blow past Twilio's 1600-char limit.
 */ const MOVE_WHEN_LABEL_ES = {
  now: "ahora (próximas semanas)",
  soon: "pronto (1-3 meses)",
  later: "más adelante (sin apuro)"
};
type MoveWhen = "now" | "soon" | "later";
type NewLeadNotification = {
  landlordFirstName: string;
  apartmentTitle: string;
  apartmentNeighborhood: string | null;
  renterName: string;
  moveWhen: MoveWhen | null;
  messageSnippet: string;
  leadUrl: string;
};
type ReminderNotification = {
  ageLabel: string;
  renterName: string;
  apartmentTitle: string;
  leadUrl: string;
};
const PROMPT_LABEL = "📬 Ver y responder";
function truncate(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trim()}…` : trimmed;
}
/** Body for the FIRST send (when the lead lands). */ export function renderNewLeadMessage(input: NewLeadNotification) {
  const greeting = `Hola ${input.landlordFirstName.trim() || "Anfitrión"} 👋`;
  const where = input.apartmentNeighborhood ? `${truncate(input.apartmentTitle, 60)} (${input.apartmentNeighborhood})` : truncate(input.apartmentTitle, 60);
  const renter = truncate(input.renterName, 40);
  const moveLine = input.moveWhen ? `🗓️ Quiere mudarse: ${MOVE_WHEN_LABEL_ES[input.moveWhen]}` : `🗓️ Sin fecha indicada`;
  const message = truncate(input.messageSnippet, 200);
  return [
    `${greeting} — tienes una nueva consulta en mdeai 🏠`,
    "",
    `📍 ${where}`,
    `👤 ${renter} pregunta:`,
    `"${message}"`,
    "",
    moveLine,
    "",
    `${PROMPT_LABEL}: ${input.leadUrl}`
  ].join("\n");
}
/** Body for the 30-minute reminder. */ export function renderReminderMessage(input: ReminderNotification) {
  return [
    `⏰ Recordatorio (${input.ageLabel})`,
    "",
    `${input.renterName} aún espera respuesta sobre "${truncate(input.apartmentTitle, 60)}".`,
    "",
    "Las primeras horas son las más importantes — los renters comparan 3-5 anuncios y reservan rápido.",
    "",
    `${PROMPT_LABEL}: ${input.leadUrl}`
  ].join("\n");
}
