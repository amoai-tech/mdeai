// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RentalFastPathProvider, useRentalFastPath } from "../rental-fast-path-context";

function Probe() {
  const { toolResult, toolResults, setToolResult, clearToolResults } = useRentalFastPath();
  return (
    <div>
      <span data-testid="current">{toolResult ? "yes" : "no"}</span>
      <span data-testid="history">{toolResults.length}</span>
      <button onClick={() => setToolResult({ results: [{ id: "old" }] })}>add</button>
      <button onClick={() => setToolResult(null)}>fail</button>
      <button onClick={clearToolResults}>clear</button>
    </div>
  );
}

describe("RentalFastPathProvider history", () => {
  it("keeps history on a failed search but clears it on new chat", () => {
    render(<RentalFastPathProvider><Probe /></RentalFastPathProvider>);
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("history").textContent).toBe("1");
    fireEvent.click(screen.getByText("fail"));
    expect(screen.getByTestId("current").textContent).toBe("no");
    expect(screen.getByTestId("history").textContent).toBe("1");
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("history").textContent).toBe("0");
  });
});
