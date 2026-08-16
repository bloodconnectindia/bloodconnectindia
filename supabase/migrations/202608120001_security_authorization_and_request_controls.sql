-- LOCAL PREPARATION ONLY. Do not apply until the live-schema baseline has been
-- verified and the earlier profiles/user_roles migrations have been excluded.
-- This migration preserves public.users as the current identity/role source.

create schema if not exists security;

revoke all on schema security from public;
grant usage on schema security to authenticated;

create table if not exists security.roles (
  role_name text primary key,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists security.permissions (
  permission_key text primary key,
  description text not null,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  check (permission_key ~ '^[a-z0-9]+([._][a-z0-9]+)*$')
);

create table if not exists security.role_permissions (
  role_name text not null references security.roles(role_name) on delete restrict,
  permission_key text not null references security.permissions(permission_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_name, permission_key)
);

create table if not exists security.user_permission_overrides (
  user_id text not null,
  permission_key text not null references security.permissions(permission_key) on delete restrict,
  effect text not null check (effect in ('allow', 'deny')),
  reason text not null,
  granted_by_user_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create table if not exists security.authorization_audit_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_user_id text,
  subject_user_id text,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists security.admin_login_attempts (
  subject_hash text primary key,
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  first_failed_at timestamptz,
  last_failed_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists security.blood_request_submission_state (
  subject_hash text primary key,
  invalid_pattern_count smallint not null default 0 check (invalid_pattern_count >= 0),
  duplicate_count smallint not null default 0 check (duplicate_count >= 0),
  risk_score smallint not null default 0 check (risk_score >= 0),
  warned_at timestamptz,
  blocked_until timestamptz,
  last_event_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists security.blood_request_deduplication (
  request_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists security.blood_request_abuse_events (
  id bigint generated always as identity primary key,
  subject_hash text not null,
  event_type text not null check (event_type in ('validation_pattern', 'duplicate', 'warning', 'blocked', 'unblocked', 'restored', 'submitted')),
  actor_user_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Private tables are never available to anon/authenticated browser roles.
alter table security.roles enable row level security;
alter table security.permissions enable row level security;
alter table security.role_permissions enable row level security;
alter table security.user_permission_overrides enable row level security;
alter table security.authorization_audit_log enable row level security;
alter table security.admin_login_attempts enable row level security;
alter table security.blood_request_submission_state enable row level security;
alter table security.blood_request_deduplication enable row level security;
alter table security.blood_request_abuse_events enable row level security;

revoke all on all tables in schema security from public, anon, authenticated;

insert into security.roles (role_name, description) values
  ('Admin', 'Temporary broad operational administrator'),
  ('Super Admin', 'Future full security administrator')
on conflict (role_name) do update set description = excluded.description;

insert into security.permissions (permission_key, description, is_sensitive) values
  ('system.read_all', 'Read operational system data', false),
  ('system.operational_write_all', 'Temporary operational write access', false),
  ('blood_requests.restore_submission', 'Restore a temporarily blocked public requester', false),
  ('system.full_access', 'Future Super Admin full system access', true),
  ('authorization.manage_roles', 'Manage roles and Admin accounts', true),
  ('authorization.manage_permissions', 'Manage permission mappings', true),
  ('security.manage_configuration', 'Manage security-sensitive configuration', true)
on conflict (permission_key) do update
set description = excluded.description, is_sensitive = excluded.is_sensitive;

-- Current Admin retains broad operational access, but not authorization/security management.
insert into security.role_permissions (role_name, permission_key) values
  ('Admin', 'system.read_all'),
  ('Admin', 'system.operational_write_all'),
  ('Admin', 'blood_requests.restore_submission'),
  ('Super Admin', 'system.full_access'),
  ('Super Admin', 'authorization.manage_roles'),
  ('Super Admin', 'authorization.manage_permissions'),
  ('Super Admin', 'security.manage_configuration')
on conflict do nothing;

create or replace function security.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()::text
      and lower(u.role) = lower(required_role)
      and lower(u.status) = 'active'
  );
$$;

create or replace function security.current_user_has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_subject as (
    select u.user_id, u.role
    from public.users u
    where u.user_id = auth.uid()::text
      and lower(u.status) = 'active'
  ), override as (
    select o.effect
    from security.user_permission_overrides o
    join current_subject s on s.user_id = o.user_id
    where o.permission_key = required_permission
      and (o.expires_at is null or o.expires_at > now())
  )
  select case
    when exists (select 1 from override where effect = 'deny') then false
    when exists (select 1 from override where effect = 'allow') then true
    else exists (
      select 1
      from current_subject s
      join security.role_permissions rp on rp.role_name = s.role
      where rp.permission_key in (required_permission, 'system.full_access')
    )
  end;
$$;

revoke all on function security.current_user_has_role(text) from public;
revoke all on function security.current_user_has_permission(text) from public;
grant execute on function security.current_user_has_role(text) to authenticated;
grant execute on function security.current_user_has_permission(text) to authenticated;

-- Add permission policies without dropping legacy policies by guessed names.
-- A later, separately approved migration may remove legacy role policies after
-- catalog verification; this preserves the existing Admin during transition.
drop policy if exists "Security permission read users" on public.users;
create policy "Security permission read users"
on public.users for select to authenticated
using (security.current_user_has_permission('system.read_all'));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['donors', 'blood_requests', 'blood_stock', 'blood_banks', 'hospitals'] loop
    execute format('drop policy if exists %I on public.%I', 'Security permission read ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (security.current_user_has_permission(''system.read_all''))',
      'Security permission read ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (security.current_user_has_permission(''system.operational_write_all''))',
      'Temporary operational administrators can insert ' || replace(table_name, '_', ' '), table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (security.current_user_has_permission(''system.operational_write_all'')) with check (security.current_user_has_permission(''system.operational_write_all''))',
      'Temporary operational administrators can update ' || replace(table_name, '_', ' '), table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (security.current_user_has_permission(''system.operational_write_all''))',
      'Temporary operational administrators can delete ' || replace(table_name, '_', ' '), table_name
    );
  end loop;
end;
$$;

-- Do not add an UPDATE policy to public.users: role and status remain server-only.

-- The public INSERT policy on blood_requests is intentionally NOT changed here.
-- A future Edge Function validates and inserts requests server-side; do not
-- re-enable Data API access for this table as part of this migration.
