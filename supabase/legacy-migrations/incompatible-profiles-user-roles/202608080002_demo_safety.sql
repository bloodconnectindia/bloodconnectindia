-- Demo/production separation. Existing records remain production by default.

create table if not exists public.demo_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null default 'active' check (status in ('active', 'reset_requested', 'reset')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reset_requested_at timestamptz,
  reset_requested_by uuid references public.profiles(id) on delete set null,
  reset_at timestamptz,
  reset_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.demo_reset_confirmations (
  id uuid primary key default gen_random_uuid(),
  demo_batch_id uuid references public.demo_batches(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_demo_marker_check
  check ((is_demo and demo_batch_id is not null) or (not is_demo and demo_batch_id is null)) not valid;
alter table public.profiles validate constraint profiles_demo_marker_check;

alter table public.user_roles
  add constraint user_roles_demo_marker_check
  check ((is_demo and demo_batch_id is not null) or (not is_demo and demo_batch_id is null)) not valid;
alter table public.user_roles validate constraint user_roles_demo_marker_check;

alter table public.profiles
  add constraint profiles_demo_batch_fk
  foreign key (demo_batch_id) references public.demo_batches(id) on delete restrict;
alter table public.user_roles
  add constraint user_roles_demo_batch_fk
  foreign key (demo_batch_id) references public.demo_batches(id) on delete restrict;
alter table public.admin_audit_log
  add constraint admin_audit_log_demo_batch_fk
  foreign key (demo_batch_id) references public.demo_batches(id) on delete restrict;

-- The only existing application table gains non-destructive, safe defaults.
alter table public.blood_requests
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch_id uuid references public.demo_batches(id) on delete restrict;

alter table public.blood_requests
  add constraint blood_requests_demo_marker_check
  check ((is_demo and demo_batch_id is not null) or (not is_demo and demo_batch_id is null)) not valid;
alter table public.blood_requests validate constraint blood_requests_demo_marker_check;

create or replace function public.prevent_demo_marker_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (new.is_demo is distinct from old.is_demo or new.demo_batch_id is distinct from old.demo_batch_id) then
    raise exception 'Demo markers are immutable after creation';
  end if;

  if tg_op = 'INSERT' and new.is_demo and current_setting('app.demo_seed', true) is distinct from 'on' then
    raise exception 'Demo records may only be created by the controlled demo seed process';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_demo_marker on public.profiles;
create trigger profiles_protect_demo_marker
before insert or update on public.profiles
for each row execute function public.prevent_demo_marker_mutation();

drop trigger if exists user_roles_protect_demo_marker on public.user_roles;
create trigger user_roles_protect_demo_marker
before insert or update on public.user_roles
for each row execute function public.prevent_demo_marker_mutation();

drop trigger if exists blood_requests_protect_demo_marker on public.blood_requests;
create trigger blood_requests_protect_demo_marker
before insert or update on public.blood_requests
for each row execute function public.prevent_demo_marker_mutation();

create or replace function public.validate_role_demo_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  profile_is_demo boolean;
  profile_batch_id uuid;
begin
  select is_demo, demo_batch_id
  into profile_is_demo, profile_batch_id
  from public.profiles
  where id = new.user_id;

  if not found or new.is_demo is distinct from profile_is_demo
     or new.demo_batch_id is distinct from profile_batch_id then
    raise exception 'A role must have the same demo markers as its profile';
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_validate_demo_lineage on public.user_roles;
create trigger user_roles_validate_demo_lineage
before insert or update on public.user_roles
for each row execute function public.validate_role_demo_lineage();

alter table public.demo_batches enable row level security;
alter table public.demo_reset_confirmations enable row level security;

drop policy if exists "admin reads demo batches" on public.demo_batches;
create policy "admin reads demo batches"
on public.demo_batches for select to authenticated
using (public.current_user_has_role('admin'));

drop policy if exists "admin reads reset confirmations" on public.demo_reset_confirmations;
create policy "admin reads reset confirmations"
on public.demo_reset_confirmations for select to authenticated
using (public.current_user_has_role('admin'));

-- No browser client receives direct write or delete policies for demo control tables.
