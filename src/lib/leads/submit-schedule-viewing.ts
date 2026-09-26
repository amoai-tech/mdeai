import {
  SCHEDULE_VIEWING_ACK_MESSAGE,
  scheduleViewingErrorCodes,
  scheduleViewingInputSchema,
  type ScheduleViewingErrorCode,
  type ScheduleViewingInput,
  type ScheduleViewingResult,
} from "./schedule-viewing-schema";

/** SAN-1203 — typed failure so callers can branch on the reason, not the prose. */
export class ScheduleViewingError extends Error {
  readonly code: ScheduleViewingErrorCode;

  constructor(code: ScheduleViewingErrorCode, message: string) {
    super(message);
    this.name = "ScheduleViewingError";
    this.code = code;
  }
}

function toErrorCode(value: unknown): ScheduleViewingErrorCode {
  return scheduleViewingErrorCodes.includes(value as ScheduleViewingErrorCode)
    ? (value as ScheduleViewingErrorCode)
    : "UPSTREAM_ERROR";
}

/**
 * Submit a rental viewing request through the canonical browser boundary.
 *
 * SAN-1203: resolves only when the backend returned BOTH a committed `leadId`
 * and a committed `showingId`. A lead-only response is a failure, never a
 * partial success.
 */
export async function submitScheduleViewing(
  input: ScheduleViewingInput,
): Promise<ScheduleViewingResult> {
  const parsed = scheduleViewingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScheduleViewingError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid viewing request",
    );
  }

  const res = await fetch("/api/leads/schedule-viewing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    leadId?: string;
    showingId?: string;
    message?: string;
    error?: { code?: string; message?: string };
  };

  if (!res.ok || !json.success || !json.leadId || !json.showingId) {
    throw new ScheduleViewingError(
      toErrorCode(json.error?.code),
      json.error?.message ?? "Could not schedule viewing",
    );
  }

  return {
    leadId: json.leadId,
    showingId: json.showingId,
    message: json.message ?? SCHEDULE_VIEWING_ACK_MESSAGE,
  };
}
