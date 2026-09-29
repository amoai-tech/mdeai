import { describe, expect, it } from "vitest";
import {
  availableBrokerViewingActions,
  brokerViewingStatusLabel,
  isBrokerViewingAction,
  isBrokerViewingStatusReadOnly,
} from "@/lib/rentals/broker-viewing-action";

describe("SAN-1206 broker viewing action decisions", () => {
  describe("brokerViewingStatusLabel", () => {
    // The whole point of this mapping: the database says `scheduled`, the broker is waiting on
    // an answer, so the card must read "Requested". If this ever renders "Scheduled" again the
    // broker sees a database value instead of a decision they still have to make.
    it("reads a persisted scheduled row as Requested", () => {
      expect(brokerViewingStatusLabel("scheduled")).toBe("Requested");
    });

    it("title-cases the other persisted statuses", () => {
      expect(brokerViewingStatusLabel("confirmed")).toBe("Confirmed");
      expect(brokerViewingStatusLabel("cancelled")).toBe("Cancelled");
      expect(brokerViewingStatusLabel("completed")).toBe("Completed");
      expect(brokerViewingStatusLabel("no_show")).toBe("No show");
    });

    it("degrades to Unknown rather than rendering an empty badge", () => {
      expect(brokerViewingStatusLabel("")).toBe("Unknown");
    });
  });

  describe("availableBrokerViewingActions", () => {
    it("offers confirm, decline and reschedule while the request is unanswered", () => {
      expect(availableBrokerViewingActions("scheduled")).toEqual([
        "confirm",
        "cancel",
        "reschedule",
      ]);
    });

    // A confirmed appointment can be cancelled, but SAN-1206 deliberately does not move it to a
    // new time: there is no renter communication/acceptance contract for that yet.
    it("offers only decline once the viewing is confirmed", () => {
      expect(availableBrokerViewingActions("confirmed")).toEqual(["cancel"]);
    });

    it.each(["cancelled", "completed", "no_show"])(
      "offers nothing once the viewing is %s",
      (status) => {
        expect(availableBrokerViewingActions(status)).toEqual([]);
        expect(isBrokerViewingStatusReadOnly(status)).toBe(true);
      },
    );

    it("offers nothing for an unrecognised status rather than guessing", () => {
      expect(availableBrokerViewingActions("something_new")).toEqual([]);
      expect(availableBrokerViewingActions("")).toEqual([]);
    });
  });

  describe("isBrokerViewingAction", () => {
    it("accepts exactly the three transitions the database implements", () => {
      expect(isBrokerViewingAction("confirm")).toBe(true);
      expect(isBrokerViewingAction("cancel")).toBe(true);
      expect(isBrokerViewingAction("reschedule")).toBe(true);
    });

    it("rejects anything else", () => {
      expect(isBrokerViewingAction("complete")).toBe(false);
      expect(isBrokerViewingAction("")).toBe(false);
      expect(isBrokerViewingAction(null)).toBe(false);
      expect(isBrokerViewingAction(7)).toBe(false);
    });
  });
});
