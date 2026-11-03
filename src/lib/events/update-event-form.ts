import { eventUpdateInputSchema } from "./update-event-core";

/**
 * SAN-885 — map a submitted edit form to the validated input contract.
 *
 * The `<form action>` contract means the server reads the browser values, so
 * every field is re-validated here before any database access.
 */
export function eventUpdateInputFromFormData(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  return eventUpdateInputSchema.safeParse({
    eventId: text("eventId"),
    expectedUpdatedAt: text("expectedUpdatedAt"),
    name: text("name"),
    description: text("description"),
    eventStartTime: text("eventStartTime"),
    eventEndTime: text("eventEndTime"),
    address: text("address"),
    city: text("city"),
  });
}
