/**
 * SAN-1653 — one activation path for event Details.
 *
 * Native cards pass the control that was pressed; generated A2UI cards pass none,
 * so the current active element is used. Either way the trigger is remembered so
 * closing the panel restores focus to the control the user actually activated.
 * Returns false (and performs no side effect) when the id is not in the visible
 * results, which keeps a stale card from opening a phantom panel.
 */
export function activateEventDetails({
  id,
  visibleIds,
  trigger,
  activeElement,
  select,
  open,
  rememberTrigger,
}: {
  id: string;
  visibleIds: readonly string[];
  trigger?: HTMLElement | null;
  activeElement?: Element | null;
  select: (id: string) => void;
  open: (id: string) => void;
  rememberTrigger: (element: HTMLElement | null) => void;
}): boolean {
  if (!visibleIds.includes(id)) return false;
  const element =
    trigger ??
    (typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement
      ? activeElement
      : null);
  if (element) rememberTrigger(element);
  select(id);
  open(id);
  return true;
}
