create extension if not exists pgcrypto;

create table if not exists fashionos_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text unique not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  details jsonb not null default '{}'::jsonb
);

create table if not exists fashionos_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  provider text not null,
  source_url text not null,
  raw_text text,
  run_id text,
  created_at timestamptz not null default now(),
  unique(provider, source_url)
);

create table if not exists fashionos_companies (
  id uuid primary key default gen_random_uuid(),
  name text,
  website_url text,
  location text,
  created_at timestamptz not null default now(),
  unique(website_url)
);

create table if not exists fashionos_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references fashionos_companies(id) on delete set null,
  name text,
  email text,
  phone text,
  location text,
  created_at timestamptz not null default now(),
  unique(email)
);

create table if not exists fashionos_leads (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references fashionos_sources(id) on delete set null,
  company_id uuid references fashionos_companies(id) on delete set null,
  person_id uuid references fashionos_people(id) on delete set null,
  source_platform text not null,
  source_url text not null,
  provider text not null,
  post_text text,
  lead_summary text,
  buying_intent text,
  urgency text,
  confidence_score integer not null check (confidence_score between 0 and 100),
  lead_score integer not null check (lead_score between 0 and 100),
  status text not null default 'needs_human_review',
  created_at timestamptz not null default now(),
  unique(provider, source_url)
);

create table if not exists fashionos_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references fashionos_leads(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fashionos_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references fashionos_leads(id) on delete cascade,
  channel text not null default 'manual_review',
  draft_text text not null,
  status text not null default 'pending_human_approval',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('pending_human_approval', 'approved', 'rejected'))
);

create table if not exists fashionos_activity_log (
  id uuid primary key default gen_random_uuid(),
  run_id text,
  level text not null,
  step text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fashionos_leads_score_idx on fashionos_leads(lead_score desc);
create index if not exists fashionos_leads_status_idx on fashionos_leads(status);
create index if not exists fashionos_activity_log_run_idx on fashionos_activity_log(run_id, created_at);
