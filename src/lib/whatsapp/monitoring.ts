/**
 * SAN-1444 — observability for background inbound processing.
 *
 * The webhook must acknowledge fast, so processing runs in after(); a failure there can no
 * longer change the HTTP response. Instead of swallowing it, every infrastructure failure is
 * emitted as one structured line and forwarded to an optional sink, so operators (or a later
 * Sentry/alerting wiring) can see sweeper failures.
 */
export type InboundFailureStage = "webhook_after" | "sweeper";

export type InboundFailureContext = {
  workerId: string;
  stage: InboundFailureStage;
  summary?: unknown;
};

export type InboundFailureEvent = {
  event: "whatsapp.inbound.processing_failed";
  error: unknown;
  context: InboundFailureContext;
};

export type InboundFailureSink = (event: InboundFailureEvent) => void;

let sink: InboundFailureSink | null = null;

/** Wire a real sink (Sentry, alerting) once; unset by default. */
export function setInboundFailureSink(next: InboundFailureSink | null): void {
  sink = next;
}

export function reportInboundProcessingFailure(
  error: unknown,
  context: InboundFailureContext,
): void {
  const payload = {
    event: "whatsapp.inbound.processing_failed",
    workerId: context.workerId,
    stage: context.stage,
    // Logs are long-lived and widely readable: never emit the raw message or stack, which can
    // carry customer text, phone numbers or URLs. The full error still reaches the sink
    // (Sentry/alerting); the durable row keeps it in last_error for operator triage.
    errorName: error instanceof Error ? error.name : typeof error,
    errorLength: error instanceof Error ? error.message.length : 0,
    summary: context.summary,
  };
  console.error(JSON.stringify(payload));
  if (!sink) return;
  try {
    sink({ event: "whatsapp.inbound.processing_failed", error, context });
  } catch (sinkError) {
    console.error("[whatsapp] inbound failure sink threw", sinkError);
  }
}
