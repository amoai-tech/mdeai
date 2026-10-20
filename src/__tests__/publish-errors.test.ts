import { describe, expect, it } from "vitest";
import { classifyPublishError } from "../../supabase/functions/approval-commit/publish-errors";

describe("classifyPublishError", () => {
  it("maps a slug unique violation to a retryable slug conflict", () => {
    expect(
      classifyPublishError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "events_slug_uk"',
      }),
    ).toEqual({
      status: 409,
      code: "SLUG_CONFLICT",
      message: "That event link is already in use. Try publishing again.",
    });
  });

  it("does not mislabel another unique violation as a slug conflict", () => {
    expect(
      classifyPublishError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "events_approval_request_id_uk"',
      }),
    ).toEqual({
      status: 409,
      code: "CONFLICT",
      message: "This publish conflicted with another write. Retry shortly.",
    });
  });

  it("asks for a host profile when the organizer row is missing", () => {
    expect(classifyPublishError({ code: "23503" })).toMatchObject({
      status: 403,
      code: "PROFILE_REQUIRED",
    });
  });

  it.each(["22007", "22008"])(
    "classifies Postgres datetime error %s as user input",
    (code) => {
      expect(classifyPublishError({ code, message: "invalid input syntax" })).toEqual({
        status: 400,
        code: "INVALID_EVENT_DATE",
        message: "Enter a valid event date and time.",
      });
    },
  );

  it("maps authentication and ownership errors", () => {
    expect(classifyPublishError({ code: "28000" })).toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    expect(
      classifyPublishError({ code: "42501", message: "FOREIGN_PROPOSAL" }),
    ).toMatchObject({ status: 403, code: "FOREIGN_PROPOSAL" });
  });

  it("keeps stable domain codes for validation and conflicts", () => {
    expect(
      classifyPublishError({ code: "22023", message: "INVALID_TICKET_TIERS" }),
    ).toMatchObject({ status: 400, code: "INVALID_TICKET_TIERS" });
    expect(
      classifyPublishError({ code: "P0001", message: "DRAFT_CHANGED" }),
    ).toMatchObject({ status: 409, code: "DRAFT_CHANGED" });
    expect(
      classifyPublishError({ code: "P0001", message: "DECISION_CONFLICT" }),
    ).toMatchObject({ status: 409, code: "DECISION_CONFLICT" });
  });

  it("hides unexpected database messages behind a generic 500", () => {
    expect(
      classifyPublishError({
        code: "XX000",
        message: "internal database detail that must not reach the browser",
      }),
    ).toEqual({
      status: 500,
      code: "PUBLISH_FAILED",
      message: "Could not publish event",
    });
  });
});
