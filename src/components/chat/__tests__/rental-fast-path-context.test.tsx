// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RentalFastPathProvider, useRentalFastPath } from "../rental-fast-path-context";

function Probe() {
  const { toolResult, toolResults, setToolResult, restoreToolResult, clearToolResults } = useRentalFastPath();
  return (
    <div>
      <span data-testid="current">{toolResult ? "yes" : "no"}</span>
      <span data-testid="history">{toolResults.length}</span>
      <button onClick={() => setToolResult({ results: [{ id: "old" }] })}>add</button>
      <button onClick={() => setToolResult(null)}>fail</button>
      <button onClick={() => restoreToolResult({ results: [{ id: "restored" }] })}>rehydrate</button>
      <button onClick={clearToolResults}>clear</button>
    </div>
  );
}

describe("RentalFastPathProvider history", () => {
  it("restores an empty thread but never overwrites results from a newer live search", () => {
    render(<RentalFastPathProvider><Probe /></RentalFastPathProvider>);
    fireEvent.click(screen.getByText("rehydrate"));
    expect(screen.getByTestId("current").textContent).toBe("yes");
    expect(screen.getByTestId("history").textContent).toBe("1");
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("rehydrate"));
    expect(screen.getByTestId("history").textContent).toBe("2");
    fireEvent.click(screen.getByText("clear"));
    fireEvent.click(screen.getByText("rehydrate"));
    expect(screen.getByTestId("history").textContent).toBe("1");
  });

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

function RecoveryProbe({ onRetry }: { onRetry: () => void }) {
  const {
    toolResult, searchFailure, setToolResult, reportSearchFailure,
    retryFailedSearch, clearToolResults,
  } = useRentalFastPath();
  return (
    <div>
      <span data-testid="previous"> {toolResult ? "yes" : "no"} </span>
      <span data-testid="failure-status">{searchFailure?.status ?? "none"}</span>
      <button onClick={() => setToolResult({ results: [{ id: "real-001" }] })}>seed</button>
      <button onClick={() => reportSearchFailure(
        { status: 503, code: "rental_search_unavailable", retryable: true }, onRetry,
      )}>outage</button>
      <button onClick={retryFailedSearch}>retry</button>
      <button onClick={clearToolResults}>new-chat</button>
    </div>
  );
}

describe("Rental fast-path recovery state", () => {
  it("retains real results through an outage, retries once, and clears on thread reset", () => {
    const retry = vi.fn();
    render(<RentalFastPathProvider><RecoveryProbe onRetry={retry} /></RentalFastPathProvider>);
    fireEvent.click(screen.getByText("seed"));
    fireEvent.click(screen.getByText("outage"));
    expect(screen.getByTestId("previous").textContent?.trim()).toBe("yes");
    expect(screen.getByTestId("failure-status").textContent).toBe("503");
    fireEvent.click(screen.getByText("retry"));
    fireEvent.click(screen.getByText("retry"));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("failure-status").textContent).toBe("none");
    expect(screen.getByTestId("previous").textContent?.trim()).toBe("yes");
    fireEvent.click(screen.getByText("outage"));
    fireEvent.click(screen.getByText("new-chat"));
    expect(screen.getByTestId("failure-status").textContent).toBe("none");
    expect(screen.getByTestId("previous").textContent?.trim()).toBe("no");
    fireEvent.click(screen.getByText("retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
