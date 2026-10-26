import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventUpdateFieldErrors } from "@/lib/events/update-event-core";

type Props = {
  defaults: {
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    address: string;
    city: string;
  };
  fieldErrors: EventUpdateFieldErrors;
};

/** One labelled control with its error message, so the form body stays short. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * SAN-885 — the editable event fields. Uncontrolled inputs with `defaultValue`
 * so the form submits through the server action without client-side state.
 */
export function HostEventFields({ defaults, fieldErrors }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="event-name">Event name</Label>
        <Input
          id="event-name"
          name="name"
          defaultValue={defaults.name}
          aria-invalid={Boolean(fieldErrors.name)}
          required
          maxLength={140}
        />
        <FieldError message={fieldErrors.name} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-description">Description</Label>
        <Textarea
          id="event-description"
          name="description"
          defaultValue={defaults.description}
          rows={5}
          maxLength={4000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-start">Starts (Medellín time)</Label>
          <Input
            id="event-start"
            name="eventStartTime"
            type="datetime-local"
            defaultValue={defaults.startTime}
            aria-invalid={Boolean(fieldErrors.eventStartTime)}
            required
          />
          <FieldError message={fieldErrors.eventStartTime} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-end">Ends (optional)</Label>
          <Input
            id="event-end"
            name="eventEndTime"
            type="datetime-local"
            defaultValue={defaults.endTime}
            aria-invalid={Boolean(fieldErrors.eventEndTime)}
          />
          <FieldError message={fieldErrors.eventEndTime} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-address">Venue address</Label>
          <Input
            id="event-address"
            name="address"
            defaultValue={defaults.address}
            maxLength={240}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-city">City</Label>
          <Input id="event-city" name="city" defaultValue={defaults.city} maxLength={80} />
        </div>
      </div>
    </div>
  );
}
