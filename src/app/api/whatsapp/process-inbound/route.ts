/**
 * SAN-1444 — recovery sweeper. A scheduler (pg_cron / external) calls this to retry pending,
 * failed and lease-expired inbound messages when no new webhook traffic arrives.
 *
 * Disabled unless WHATSAPP_PROCESS_SECRET is set; requires the matching header.
 */
import { NextResponse, type NextRequest } from "next/server";
import { mastra } from "@/mastra";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { readWhatsAppChannelEnv } from "@/lib/whatsapp/channel-env";
import type { InboundRpcClient } from "@/lib/whatsapp/inbound-store";
import { processDueInbound } from "@/lib/whatsapp/process-inbound";
import { constantTimeEqual, signWebhookBody } from "@/lib/whatsapp/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_PROCESS_SECRET;
  if (!secret) return NextResponse.json({ error: "sweeper disabled" }, { status: 503 });
  if (!constantTimeEqual(request.headers.get("x-whatsapp-process-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const env = readWhatsAppChannelEnv();
  if (!env) return NextResponse.json({ error: "WhatsApp channel is not configured" }, { status: 503 });
  const client = createServiceRoleClient();
  if (!client) return NextResponse.json({ error: "service client unavailable" }, { status: 503 });

  const channels = mastra.getAgent("conciergeAgent")?.getChannels?.() ?? null;
  if (!channels?.hasAdapter("whatsapp")) {
    return NextResponse.json({ error: "channel unavailable" }, { status: 503 });
  }

  const summary = await processDueInbound({
    client: client as unknown as InboundRpcClient,
    webhookUrl: new URL("/api/whatsapp/webhook", request.nextUrl.origin).toString(),
    sign: (body) => signWebhookBody(body, env.appSecret),
    adapterWebhook: (req, waitUntil) => channels.handleWebhookEvent("whatsapp", req, { waitUntil }),
    workerId: "sweeper:" + crypto.randomUUID(),
  });
  return NextResponse.json(summary);
}
