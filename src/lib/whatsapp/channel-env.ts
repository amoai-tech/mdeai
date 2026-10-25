/**
 * WhatsApp channel environment contract (SAN-1444).
 *
 * The installed adapter (@chat-adapter/whatsapp 4.41.1) reads these names and throws
 * eagerly when any is missing, so the channel is attached only when all four are present.
 * Absence means "channel disabled", never "channel open".
 */
export type WhatsAppChannelEnv = {
  accessToken: string;
  appSecret: string;
  phoneNumberId: string;
  verifyToken: string;
  userName?: string;
};

const REQUIRED = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

export function readWhatsAppChannelEnv(
  source: Record<string, string | undefined> = process.env,
): WhatsAppChannelEnv | null {
  for (const key of REQUIRED) {
    if (!source[key]?.trim()) return null;
  }
  return {
    accessToken: source.WHATSAPP_ACCESS_TOKEN!.trim(),
    appSecret: source.WHATSAPP_APP_SECRET!.trim(),
    phoneNumberId: source.WHATSAPP_PHONE_NUMBER_ID!.trim(),
    verifyToken: source.WHATSAPP_VERIFY_TOKEN!.trim(),
    userName: source.WHATSAPP_BOT_USERNAME?.trim() || undefined,
  };
}

export function isWhatsAppChannelConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return readWhatsAppChannelEnv(source) !== null;
}
