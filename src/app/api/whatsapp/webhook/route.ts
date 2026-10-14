/**
 * Meta WhatsApp Cloud API webhook (SAN-1444).
 *
 * The installed Mastra WhatsApp adapter owns the GET verification challenge and POST
 * X-Hub-Signature-256 check. MDE runs Mastra in-process (see src/app/api/copilotkit), so this
 * route is the actual reachable ingress; it delegates to the adapter rather than reimplementing
 * transport. The MDE-side signature check runs first so future durable work is never recorded
 * from an unverified payload.
 *
 * Unconfigured (no WHATSAPP_* env) returns 503 and constructs nothing.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { mastra } from "@/mastra";
import { readWhatsAppChannelEnv } from "@/lib/whatsapp/channel-env";
import { verifyMetaSignature } from "@/lib/whatsapp/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function whatsappChannels() {
  // Mastra registers agents by registry key ("conciergeAgent"), not by the agent's own id.
  const agent = mastra.getAgent("conciergeAgent");
  const channels = agent?.getChannels?.() ?? null;
  if (!channels || !channels.hasAdapter("whatsapp")) return null;
  return channels;
}

function unavailable() {
  return NextResponse.json(
    { error: "WhatsApp channel is not configured" },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!readWhatsAppChannelEnv()) return unavailable();
  const channels = whatsappChannels();
  if (!channels) return unavailable();
  return channels.handleWebhookEvent("whatsapp", request, {
    waitUntil: (promise) => after(() => promise),
  });
}

export async function POST(request: NextRequest) {
  const env = readWhatsAppChannelEnv();
  if (!env) return unavailable();
  const channels = whatsappChannels();
  if (!channels) return unavailable();
  const raw = await request.clone().text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), env.appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  return channels.handleWebhookEvent("whatsapp", request, {
    waitUntil: (promise) => after(() => promise),
  });
}
