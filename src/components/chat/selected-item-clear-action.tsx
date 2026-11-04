"use client";

/**
 * The sticky mobile escape hatch for a selected discovery item.
 *
 * The card's own "Clear selection" button remains the primary control. When the
 * Ask MDE transcript grows, the sticky composer can cover the last card on a
 * 390px phone, so this repeats the SAME selected-item state and handler in the
 * always-reachable composer. It creates no second selection store.
 */
export function SelectedItemClearAction({
  label = "Place selected",
  onClear,
  testId,
}: {
  label?: string;
  onClear?: () => void;
  testId: string;
}) {
  if (!onClear) return null;
  return (
    <div
      data-testid={`${testId}-banner`}
      className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5"
    >
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        data-testid={testId}
        onClick={onClear}
        aria-label="Clear selected item"
        className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear selection
      </button>
    </div>
  );
}
