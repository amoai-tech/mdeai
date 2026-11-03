"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * One reusable crash boundary for client subtrees.
 *
 * A throw inside an isolated widget (the Google Maps slot, a host dashboard panel) must not
 * unmount the page around it. React needs a class component for `componentDidCatch`, so this
 * stays a class; every consumer supplies its own labelled, user-facing fallback.
 *
 * Reset strategy: the boundary has no internal recovery — once it catches, it stays on the
 * fallback for its lifetime. Recovery belongs to the consumer (remount with a `key`, or a route
 * `error.tsx` with `reset()`).
 *
 * Extracted from the Host OS boundary (SAN-1209-FIX) so the maps slot and the host shell share
 * one implementation instead of drifting copies.
 */

export type AppErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered in place of the crashed subtree. */
  fallback: ReactNode;
  /** Short label used in the console breadcrumb (e.g. "browse-map"). */
  label: string;
  /** Optional product area, prefixed to the breadcrumb (e.g. "host-os"). */
  scope?: string;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Diagnostic breadcrumb — survives minified prod builds (no dev overlay).
    const prefix = this.props.scope ? this.props.scope + " " : "";
    console.error(`[${prefix}${this.props.label} crashed]`, {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
