/**
 * C1 in the harness: keep the browser attempt id and server request id for the turn
 * under test, so a failure message names the exact turn instead of "it was empty".
 *
 * The browser sends `x-mde-attempt-id` on every AI request; the runtime echoes
 * `x-mde-request-id`. Recording both lets a failed Playwright run be matched to server
 * log lines without storing any conversation content.
 */
import type { Page, Request, Response } from "@playwright/test";

export interface TurnDiagnostics {
  attemptIds: string[];
  requestIds: string[];
  statuses: string[];
  /** One line for a failure message; never contains message text. */
  summary(): string;
}

export function watchTurnDiagnostics(page: Page): TurnDiagnostics {
  const attemptIds: string[] = [];
  const requestIds: string[] = [];
  const statuses: string[] = [];

  const onRequest = (request: Request) => {
    const id = request.headers()["x-mde-attempt-id"];
    if (id) attemptIds.push(id);
  };
  const onResponse = (response: Response) => {
    const id = response.headers()["x-mde-request-id"];
    if (id) requestIds.push(id);
    if (response.url().includes("/api/copilotkit")) statuses.push(String(response.status()));
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  return {
    attemptIds,
    requestIds,
    statuses,
    summary() {
      const last = (values: string[]) => values[values.length - 1] ?? "none";
      return `attemptId=${last(attemptIds)} requestId=${last(requestIds)} status=${last(statuses)}`;
    },
  };
}
