\ir ../_disposable_guard.sql
-- Disposable schema-only adapter. Native runner-local auth.users remains the
-- authoritative Auth relation; this file deliberately does not create it.

create table public.users (
  user_id text,
  role text not null,
  status text not null
);

-- These relations are required by the authorization migration's fixed policy
-- loop. No application columns have been verified for these four relations, so
-- the baseline intentionally does not invent any.
create table public.donors ();
create table public.blood_stock ();
create table public.blood_banks ();
create table public.hospitals ();

-- These are the only blood-request application columns evidenced by both the
-- prepared submit and demo-seed Edge Functions. demo_batch_id is intentionally
-- absent here; 202608120004 owns that addition.
create table public.blood_requests (
  patient_name text,
  blood_group text,
  hospital text,
  mobile text,
  address text
);

alter table public.users enable row level security;
alter table public.donors enable row level security;
alter table public.blood_requests enable row level security;
alter table public.blood_stock enable row level security;
alter table public.blood_banks enable row level security;
alter table public.hospitals enable row level security;

revoke all on public.users, public.donors, public.blood_requests,
  public.blood_stock, public.blood_banks, public.hospitals
  from public, anon, authenticated;
