-- SAN-1623 · Contact Host — record when (and whether) a host was actually notified.
--
-- The deployed lead-from-form handler already updates landlord_inbox.whatsapp_sent_at after a
-- successful WhatsApp send, but the column never existed, so the stamp silently failed and the
-- reminder tick could re-fire the "first" notification. The column is additive and nullable:
-- NULL means "not notified via WhatsApp" (no number configured, or the send failed), which is
-- exactly the state the renter-facing response now reports honestly.

alter table public.landlord_inbox
  add column if not exists whatsapp_sent_at timestamptz;

comment on column public.landlord_inbox.whatsapp_sent_at is
  'When a WhatsApp notification for this inquiry was accepted by the provider. NULL = not notified (no host number, or the send failed). The inquiry itself is stored regardless.';


-- A stable client-generated ID makes retries/concurrent submits save exactly one inquiry.
-- Nullable for legacy chat leads; only the Contact Host form supplies the UUID.
alter table public.landlord_inbox
  add column if not exists form_request_id uuid;

create unique index if not exists landlord_inbox_form_request_id_unique
  on public.landlord_inbox (form_request_id) where form_request_id is not null;
