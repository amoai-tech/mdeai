// @vitest-environment jsdom
/**
 * SAN-1421 — the in-column "Ask MDE" composer.
 *
 * What this proves: one press sends one message on the existing thread, a failed answer keeps the
 * user's words (and Retry resends them), a running answer can be stopped, and a signed-out visitor is
 * asked to sign in instead of being sent to a runtime that would answer 401.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const chat = vi.hoisted(() => ({
  appendMessage: vi.fn(() => Promise.resolve(true)),
  isLoading: false,
  stopActiveRun: vi.fn(),
}));
const session = vi.hoisted(() => ({ user: { id: "user-1" } as { id: string } | null, loading: false }));
const agent = vi.hoisted(() => ({ messages: [] as Array<{ id: string; role: string; content: string }> }));
const coagent = vi.hoisted(() => ({ present: true }));
const errorVersion = vi.hoisted(() => ({ value: 0 }));

vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    appendMessage: chat.appendMessage,
    isLoading: chat.isLoading,
    stopActiveRun: chat.stopActiveRun,
  }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => {
  const value = () => (coagent.present ? { agent } : null);
  return { useConciergeCoAgent: value, useOptionalConciergeCoAgent: value };
});
vi.mock("@/hooks/use-session", () => ({ useSession: () => session }));
vi.mock("@/lib/concierge-error-store", () => ({
  getConciergeErrorVersion: () => errorVersion.value,
}));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));

import { RentalAskComposer } from "../rental-ask-composer";

function type(text: string) {
  fireEvent.change(screen.getByLabelText("Ask MDE about rentals"), { target: { value: text } });
}

beforeEach(() => {
  chat.appendMessage.mockReset().mockResolvedValue(true);
  chat.stopActiveRun.mockReset();
  chat.isLoading = false;
  session.user = { id: "user-1" };
  session.loading = false;
  agent.messages = [];
  coagent.present = true;
  errorVersion.value = 0;
});

afterEach(cleanup);

describe("RentalAskComposer (SAN-1421)", () => {
  it("sends one message on Enter and clears the box", async () => {
    render(<RentalAskComposer />);
    type("  cheaper two-bedroom apartments in Laureles  ");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter" });

    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(1));
    expect(chat.appendMessage).toHaveBeenCalledWith("cheaper two-bedroom apartments in Laureles");
    await waitFor(() =>
      expect((screen.getByLabelText("Ask MDE about rentals") as HTMLTextAreaElement).value).toBe(""),
    );
  });

  it("keeps Shift+Enter as a newline instead of sending", () => {
    render(<RentalAskComposer />);
    type("only in Laureles");
    fireEvent.keyDown(screen.getByLabelText("Ask MDE about rentals"), { key: "Enter", shiftKey: true });
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("keeps the question when the answer fails, and Retry sends it again", async () => {
    chat.appendMessage.mockResolvedValueOnce(false);
    render(<RentalAskComposer />);
    type("does this one have a balcony?");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    const alert = await screen.findByTestId("rental-ask-error");
    expect(alert.textContent).toContain("Your question is still here");
    expect((screen.getByLabelText("Ask MDE about rentals") as HTMLTextAreaElement).value).toBe(
      "does this one have a balcony?",
    );

    chat.appendMessage.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByTestId("rental-ask-retry"));
    await waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(2));
    expect(chat.appendMessage).toHaveBeenLastCalledWith("does this one have a balcony?");
  });

  it("reports an answer that failed after it started, using CopilotKit's error signal", async () => {
    chat.appendMessage.mockImplementationOnce(async () => {
      errorVersion.value = 1;
      return true;
    });
    render(<RentalAskComposer />);
    type("2BR in Envigado");
    fireEvent.click(screen.getByTestId("rental-ask-send"));

    expect(await screen.findByTestId("rental-ask-error")).not.toBeNull();
    expect((screen.getByLabelText("Ask MDE about rentals") as HTMLTextAreaElement).value).toBe(
      "2BR in Envigado",
    );
  });

  it("offers Stop while an answer is running", () => {
    chat.isLoading = true;
    render(<RentalAskComposer />);
    fireEvent.click(screen.getByTestId("rental-ask-stop"));
    expect(chat.stopActiveRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
  });

  it("asks a signed-out visitor to sign in, and offers no send", () => {
    session.user = null;
    render(<RentalAskComposer />);
    expect(screen.getByTestId("rental-ask-signed-out").textContent).toContain("Sign in");
    expect(screen.queryByLabelText("Ask MDE about rentals")).toBeNull();
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
  });

  it("renders an inert box, with no send, where no concierge provider is mounted", () => {
    coagent.present = false;
    render(<RentalAskComposer />);
    expect(screen.getByTestId("rental-ask-inert")).not.toBeNull();
    expect(screen.queryByTestId("rental-ask-send")).toBeNull();
    expect(screen.queryByLabelText("Ask MDE about rentals")).toBeNull();
  });

  it("shows the conversation on demand, using the same thread's turns", async () => {
    agent.messages = [
      { id: "u1", role: "user", content: "cheaper 2BR in Laureles" },
      { id: "a1", role: "assistant", content: "Here are three apartments under 3M COP." },
    ];
    render(<RentalAskComposer />);
    expect(screen.queryByTestId("rental-ask-transcript")).toBeNull();

    fireEvent.click(screen.getByTestId("rental-ask-toggle-transcript"));
    const transcript = screen.getByTestId("rental-ask-transcript");
    expect(transcript.textContent).toContain("cheaper 2BR in Laureles");
    expect(transcript.textContent).toContain("Here are three apartments under 3M COP.");
  });
});
