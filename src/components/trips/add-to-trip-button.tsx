"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";

import {
  addTripItem,
  listTripOptions,
  type TripOption,
} from "@/app/trips/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MapPin } from "@/platform/contracts";

type AddToTripButtonProps = {
  pin: MapPin;
};

/**
 * One Add-to-trip path for the map overlay and the trip page.
 * The server action owns auth, source resolution and the canonical RPC.
 */
export function AddToTripButton({ pin }: AddToTripButtonProps) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripId, setTripId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function openDialog() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setSavedId(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listTripOptions()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setTrips([]);
          return;
        }
        setTrips(result.trips);
        setTripId((current) => current || result.trips[0]?.id || "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    if (!tripId || saving) return;
    setSaving(true);
    setError(null);
    const result = await addTripItem({
      tripId,
      pinId: pin.id,
      category: pin.category,
      placeId: pin.placeId,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedId(result.itemId);
  }

  return (
    <>
      <button
        type="button"
        data-testid="selected-place-overlay-add-trip"
        title="Add to trip"
        aria-label={`Add ${pin.title} to a trip`}
        onClick={openDialog}
        className="flex size-9 items-center justify-center rounded-full bg-black/55 text-lg text-white backdrop-blur-sm hover:bg-black/70"
      >
        <Plus className="size-4" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="add-to-trip-dialog">
          <DialogHeader>
            <DialogTitle>Add to a trip</DialogTitle>
            <DialogDescription>
              Save <span className="font-medium text-foreground">{pin.title}</span> to
              one of your trips. Nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading your trips…
            </p>
          ) : savedId ? (
            <div className="space-y-2" data-testid="add-to-trip-success">
              <p className="text-sm font-medium">Added to the trip.</p>
              <p className="text-xs text-muted-foreground">
                It is already in this trip if you tried again — retries do not create a
                duplicate.
              </p>
              <Link
                href={`/trips/${tripId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open the trip
              </Link>
            </div>
          ) : trips.length === 0 ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                You need a trip first. Create or open one from the Trips page, then
                return to this place.
              </p>
              <Link href="/trips" className="font-medium text-primary hover:underline">
                Go to Trips
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Trip</span>
                <select
                  data-testid="add-to-trip-select"
                  value={tripId}
                  onChange={(event) => setTripId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Start (optional)</span>
                  <input
                    type="datetime-local"
                    data-testid="add-to-trip-start"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">End (optional)</span>
                  <input
                    type="datetime-local"
                    data-testid="add-to-trip-end"
                    value={endAt}
                    onChange={(event) => setEndAt(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
              </div>
            </div>
          )}

          {error ? (
            <p role="alert" data-testid="add-to-trip-error" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-md border border-input px-3 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="add-to-trip-confirm"
              disabled={!tripId || saving || Boolean(savedId) || trips.length === 0}
              onClick={() => void save()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add to trip"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
