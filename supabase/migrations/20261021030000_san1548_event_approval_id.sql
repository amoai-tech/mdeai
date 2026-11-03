-- SAN-1548: one event per approved event-publish request.
-- Concurrent retries that both reach the event insert attempt the same approval
-- id; the unique index makes the second insert fail and the edge function returns
-- the winner's existing event receipt instead of creating a duplicate.

alter table public.events
  add column if not exists approval_request_id uuid
  references public.approval_requests(id);

create unique index if not exists events_approval_request_id_uk
  on public.events (approval_request_id)
  where approval_request_id is not null;

comment on column public.events.approval_request_id is
  'SAN-1548: approval request that authorized this host-published event. Unique when present; NULL for seeded/legacy events.';
