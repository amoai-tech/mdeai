// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The shared crash boundary. Error boundaries only catch during the client commit phase, so
 * these render with react-dom/client rather than renderToStaticMarkup.
 *
 * The maps slot depends on this contract: a Google Maps throw must leave the ballot on screen.
 */
import { AppErrorBoundary } from "@/components/errors/error-boundary";

let container: HTMLElement;
let root: Root;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
    /* swallow React's caught-boundary logs; assertions read the spy's calls */
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleErrorSpy.mockRestore();
});

// skipcq: JS-0067 - module-local test helper; not browser global scope
function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

// skipcq: JS-0067 - module-local test helper; not browser global scope
function Boom(): React.ReactElement {
  throw new Error("google maps detached node");
}

describe("AppErrorBoundary", () => {
  it("renders children while healthy", () => {
    render(
      <AppErrorBoundary fallback={<span data-testid="fb">fallback</span>} label="browse-map">
        <span data-testid="child">ok</span>
      </AppErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="fb"]')).toBeNull();
  });

  it("contains a crashing child and keeps the surrounding content", () => {
    render(
      <div>
        <span data-testid="ballot">the ballot</span>
        <AppErrorBoundary fallback={<span data-testid="fb">map unavailable</span>} label="browse-map">
          <Boom />
        </AppErrorBoundary>
      </div>,
    );
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();
    // The crash must not escape the boundary.
    expect(container.querySelector('[data-testid="ballot"]')).not.toBeNull();
    const loggedOurBreadcrumb = consoleErrorSpy.mock.calls.some(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("[browse-map crashed]"),
    );
    expect(loggedOurBreadcrumb).toBe(true);
  });

  it("includes the product scope in the breadcrumb when one is given", () => {
    render(
      <AppErrorBoundary fallback={<span data-testid="fb">fallback</span>} label="page-body" scope="host-os">
        <Boom />
      </AppErrorBoundary>,
    );
    const loggedOurBreadcrumb = consoleErrorSpy.mock.calls.some(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("[host-os page-body crashed]"),
    );
    expect(loggedOurBreadcrumb).toBe(true);
  });
});
