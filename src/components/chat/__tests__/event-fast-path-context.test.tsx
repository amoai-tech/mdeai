// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventFastPathProvider, useEventFastPath } from "../event-fast-path-context";

function Probe() {
  const { toolResults, setToolResult, clearToolResults } = useEventFastPath();
  return (
    <div>
      <span data-testid="history">{toolResults.length}</span>
      <button onClick={() => setToolResult({ results: [{ id: "event-1" }] })}>add</button>
      <button onClick={() => setToolResult(null)}>fail</button>
      <button onClick={clearToolResults}>clear</button>
    </div>
  );
}

describe("EventFastPathProvider history", () => {
  it("keeps history on failure and clears it on New Chat", () => {
    render(<EventFastPathProvider><Probe /></EventFastPathProvider>);
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("history").textContent).toBe("1");
    fireEvent.click(screen.getByText("fail"));
    expect(screen.getByTestId("history").textContent).toBe("1");
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("history").textContent).toBe("0");
  });
});
