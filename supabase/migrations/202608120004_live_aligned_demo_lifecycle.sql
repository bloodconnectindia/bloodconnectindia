-- LOCAL PREPARATION ONLY. Do not apply until the public.users identity
-- preflight and partial unique index are approved and verified separately.
-- This migration intentionally does not use either legacy identity/role table.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.users_user_id_unique_nonnull_idx') is null then
    raise exception 'Live-aligned demo migration requires the approved non-null public.users.user_id unique index';
  end if;
  if exists (
    select 1 from public.users u
    where u.user_id is not null
      and not exists (select 1 from auth.users a where a.id::text=u.user_id)
  ) then
    raise exception 'Live-aligned demo migration requires every non-null public.users.user_id to match auth.users';
  end if;
  if exists (
    select 1 from public.users u
    where lower(u.role) in ('admin', 'super admin') and u.user_id is null
  ) then
    raise exception 'Live-aligned demo migration cannot protect a privileged public.users row with null user_id';
  end if;
end;
$$;

create table if not exists public.demo_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'resetting', 'reset', 'failed')),
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  reset_requested_by_auth_user_id uuid,
  reset_requested_at timestamptz,
  reset_by_auth_user_id uuid,
  reset_at timestamptz,
  reset_request_id uuid
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='demo_batches' and column_name='created_by_auth_user_id'
  ) then
    raise exception 'Existing public.demo_batches is not the live-aligned demo schema';
  end if;
end;
$$;

create table if not exists security.demo_user_memberships (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  demo_batch_id uuid not null references public.demo_batches(id) on delete restrict,
  membership_id uuid not null unique default gen_random_uuid(),
  lifecycle text not null default 'demo_only' check (lifecycle = 'demo_only'),
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists security.privileged_operation_requests (
  request_id uuid primary key,
  actor_user_id text not null,
  action text not null check (action in ('demo.reset', 'demo.seed')),
  target_id text,
  status text not null check (status in ('started', 'completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists security.demo_reset_protected_identities (
  auth_user_id uuid primary key,
  reason text not null,
  protected_at timestamptz not null default now()
);

-- Preserve a second, immutable guard for every currently mapped privileged
-- identity. Invalid/non-UUID user_id values fail before this migration is eligible.
insert into security.demo_reset_protected_identities (auth_user_id, reason)
select distinct u.user_id::uuid, 'Privileged identity present when demo lifecycle protection was prepared'
from public.users u
where u.user_id is not null
  and u.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and lower(u.role) in ('admin', 'super admin')
on conflict (auth_user_id) do nothing;

-- public.blood_requests is the only operational table locally evidenced as
-- demo-capable. Future tables require a separately reviewed fixed-scope change.
alter table public.blood_requests
  add column if not exists demo_batch_id uuid references public.demo_batches(id) on delete restrict;

create index if not exists blood_requests_demo_batch_id_idx
  on public.blood_requests (demo_batch_id)
  where demo_batch_id is not null;

create index if not exists demo_user_memberships_batch_idx
  on security.demo_user_memberships (demo_batch_id);

alter table public.demo_batches enable row level security;
alter table security.demo_user_memberships enable row level security;
alter table security.privileged_operation_requests enable row level security;
alter table security.demo_reset_protected_identities enable row level security;

revoke all on public.demo_batches from public, anon, authenticated;
revoke all on security.demo_user_memberships from public, anon, authenticated;
revoke all on security.privileged_operation_requests from public, anon, authenticated;
revoke all on security.demo_reset_protected_identities from public, anon, authenticated;

insert into security.permissions (permission_key, description, is_sensitive) values
  ('demo.read', 'Read demo batch summaries', false),
  ('demo.seed', 'Create controlled demo identities and records', true),
  ('demo.reset', 'Permanently remove explicitly marked demo data', true)
on conflict (permission_key) do update
set description = excluded.description, is_sensitive = excluded.is_sensitive;

-- Temporary operational mapping. It can be removed independently from Admin.
insert into security.role_permissions (role_name, permission_key) values
  ('Admin', 'demo.read'),
  ('Admin', 'demo.seed'),
  ('Admin', 'demo.reset')
on conflict do nothing;

grant select on public.demo_batches to authenticated;

drop policy if exists "Demo permission reads batches" on public.demo_batches;
create policy "Demo permission reads batches"
on public.demo_batches for select to authenticated
using (security.current_user_has_permission('demo.read'));

-- No browser role receives INSERT, UPDATE, or DELETE privileges on demo
-- lifecycle tables, membership markers, replay state, or authorization data.
