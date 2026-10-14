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
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
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
