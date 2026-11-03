"use client";

/** SAN-1543 · removing a nominee is guarded and shows a pending state. */
import { useFormStatus } from "react-dom";
import { unlinkRestaurantAction } from "../actions";

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md border border-border/60 px-4 text-sm disabled:opacity-60"
      data-testid="contest-unlink-submit"
      disabled={pending}
      type="submit"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function RemoveNomineeButton({
  contestId,
  restaurantId,
  name,
}: {
  contestId: string;
  restaurantId: string;
  name: string;
}) {
  return (
    <form
      action={unlinkRestaurantAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Remove " + name + " from this contest? Existing ballots will be preserved.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input name="contest_id" type="hidden" value={contestId} />
      <input name="restaurant_id" type="hidden" value={restaurantId} />
      <RemoveButton />
    </form>
  );
}