/** Non-production-only deterministic browser-test mode. */
export function isDeterministicE2E(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT === "1"
  );
}
