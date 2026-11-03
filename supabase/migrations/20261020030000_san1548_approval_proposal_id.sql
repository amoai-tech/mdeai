-- SAN-1548: one stable event-review proposal per approval retry.
-- The proposal id is client-generated and stable across a lost response; a unique
-- index makes a concurrent retry reuse the winner instead of creating a second
-- approval request. Existing rows stay NULL and are unaffected.

alter table public.approval_requests
  add column if not exists proposal_id text;

create unique index if not exists approval_requests_proposal_id_uk
  on public.approval_requests (proposal_id)
  where proposal_id is not null;

comment on column public.approval_requests.proposal_id is
  'Stable SAN-1548 review proposal id. Unique when present; used to deduplicate approval retries before an approvalRequestId is available.';
