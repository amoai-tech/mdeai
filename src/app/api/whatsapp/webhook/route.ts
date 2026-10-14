/**
 * Meta WhatsApp Cloud API webhook (SAN-1444).
 *
 * GET  — the adapter owns the hub.challenge handshake.
 * POST — verify the raw-body signature, then DURABLY RECORD every inbound message before
 *        acknowledging. If the record fails we return 500 and let Meta retry, so an
 *        acknowledged message is always recoverable. Processing is claimed atomically and
 *        runs after the response; a crash leaves the row pending for the sweeper.
 *
 * Unconfigured (no WHATSAPP_* env) returns 503 and constructs nothing.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { mastra } from "@/mastra";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { readWhatsAppChannelEnv } from "@/lib/whatsapp/channel-env";
import {
  extractInboundMessages,
  extractWhatsAppStatuses,
  recordDeliveryStatus,
  recordInboundMessage,
  type InboundRpcClient,
} from "@/lib/whatsapp/inbound-store";
import { reportInboundProcessingFailure } from "@/lib/whatsapp/monitoring";
import { processDueInbound } from "@/lib/whatsapp/process-inbound";
import {
  MAX_WEBHOOK_BYTES,
  readBodyWithLimit,
  signWebhookBody,
  verifyMetaSignature,
} from "@/lib/whatsapp/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function whatsappChannels() {
  // Mastra registers agents by registry key ("conciergeAgent"), not by the agent's own id.
  const agent = mastra.getAgent("conciergeAgent");
  const channels = agent?.getChannels?.() ?? null;
  if (!channels?.hasAdapter("whatsapp")) return null;
  return channels;
}

function unavailable() {
  return NextResponse.json({ error: "WhatsApp channel is not configured" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  if (!readWhatsAppChannelEnv()) return unavailable();
  const channels = whatsappChannels();
  if (!channels) return unavailable();
  return await channels.handleWebhookEvent("whatsapp", request, {
    waitUntil: (promise) => {
      after(() => promise);
    },
  });
}

export async function POST(request: NextRequest) {
  const env = readWhatsAppChannelEnv();
  if (!env) return unavailable();
  const channels = whatsappChannels();
  if (!channels) return unavailable();

  const limited = await readBodyWithLimit(request.clone(), MAX_WEBHOOK_BYTES);
  if (!limited.ok) {
    const tooLarge = limited.reason === "too_large";
    return new NextResponse(tooLarge ? "Payload Too Large" : "Unreadable body", {
      status: tooLarge ? 413 : 400,
    });
  }
  if (!verifyMetaSignature(limited.body, request.headers.get("x-hub-signature-256"), env.appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(limited.body);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const client = createServiceRoleClient();
  if (!client) return unavailable();
  const rpcClient = client as unknown as InboundRpcClient;

  // Delivery callbacks are receipts, not messages: persist them before acknowledging and never
  // run the agent for a status-only webhook.
  const statuses = extractWhatsAppStatuses(parsed);
  if (statuses.length > 0) {
    try {
      for (const event of statuses) await recordDeliveryStatus(rpcClient, event);
    } catch (error) {
      console.error("[whatsapp] delivery status persist failed", error);
      return new NextResponse("Could not persist delivery status", { status: 500 });
    }
  }

  const messages = extractInboundMessages(parsed);
  if (messages.length === 0) {
    // Nothing actionable (e.g. a status-only payload): acknowledge so Meta stops retrying.
    return NextResponse.json({ statuses: statuses.length, received: 0, duplicates: 0 });
  }

  let received = 0;
  let duplicates = 0;
  try {
    for (const message of messages) {
      const result = await recordInboundMessage(rpcClient, message);
      if (result.isNew) received += 1;
      else duplicates += 1;
    }
  } catch (error) {
    // The message is NOT durably recorded: do not acknowledge, let Meta retry.
    console.error("[whatsapp] durable inbound record failed", error);
    return new NextResponse("Could not durably record the message", { status: 500 });
  }

  const workerId = "webhook:" + crypto.randomUUID();
  after(() =>
    processDueInbound({
      client: rpcClient,
      webhookUrl: new URL("/api/whatsapp/webhook", request.nextUrl.origin).toString(),
      sign: (body) => signWebhookBody(body, env.appSecret),
      adapterWebhook: (req, waitUntil) => channels.handleWebhookEvent("whatsapp", req, { waitUntil }),
      workerId,
    }).catch((error) => {
      // The response is already sent, so surface the failure instead of swallowing it.
      reportInboundProcessingFailure(error, { workerId, stage: "webhook_after" });
    }),
  );

  return NextResponse.json({ received, duplicates });
}
