-- Blood Connect India foundation: identities, roles, and audit logging.
-- This migration creates new tables only; it does not modify auth.users or
-- existing application records.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace
  ) then
    create type public.app_role as enum ('admin', 'donor', 'hospital', 'blood_bank', 'camp_organizer');
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  mobile text,
  is_demo boolean not null default false,
  demo_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  is_demo boolean not null default false,
  demo_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  demo_batch_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auth creates the profile. No browser client receives permission to assign roles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = required_role
  );
$$;

revoke all on function public.current_user_has_role(public.app_role) from public;
grant execute on function public.current_user_has_role(public.app_role) to authenticated;

create or replace function public.assign_user_role(
  target_user_id uuid,
  target_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_demo boolean;
begin
  if not public.current_user_has_role('admin') then
    raise exception 'Admin role required';
  end if;

  select is_demo into target_is_demo
  from public.profiles
  where id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  if target_is_demo then
    raise exception 'Demo roles may only be created by the controlled demo seed process';
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, target_role)
  on conflict (user_id, role) do nothing;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'role_assigned', 'profile', target_user_id, jsonb_build_object('role', target_role));
end;
$$;

revoke all on function public.assign_user_role(uuid, public.app_role) from public;
-- Legacy evidence only: role assignment must move behind a server endpoint
-- guarded by authorization.manage_roles; Admin role alone is insufficient.
revoke execute on function public.assign_user_role(uuid, public.app_role) from authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_has_role('admin'));

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_has_role('admin'))
with check (id = auth.uid() or public.current_user_has_role('admin'));

drop policy if exists "roles read own or admin" on public.user_roles;
create policy "roles read own or admin"
on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.current_user_has_role('admin'));

drop policy if exists "admin reads audit log" on public.admin_audit_log;
create policy "admin reads audit log"
on public.admin_audit_log for select to authenticated
using (public.current_user_has_role('admin'));

-- There are intentionally no client insert/update/delete policies for roles or audit logs.
