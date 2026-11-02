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
