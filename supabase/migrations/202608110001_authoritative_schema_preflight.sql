-- READ-ONLY, FAIL-CLOSED PREFLIGHT.
--
-- This migration intentionally changes no schema or data. It verifies the
-- minimum live-aligned contract required before the existing authorization
-- migration can be considered. Every failure reports only aggregate/schema
-- facts; no identity value or other personal data is included.

do $preflight$
declare
  relation_name text;
  expected_column record;
  actual_type text;
  issue_count bigint;
  primary_key_count integer;
  disposable_test boolean := coalesce(
    current_setting('bci.test.disposable', true) = 'approved',
    false
  );
  identity_index record;
  archived_version text;
begin
  if to_regclass('auth.users') is null then
    raise exception using
      message = 'Authoritative schema preflight failed: required Supabase Auth relation auth.users is missing.',
      hint = 'Verify that this is a Supabase-managed PostgreSQL schema before continuing.';
  end if;

  -- A quarantined legacy identity chain must never coexist with the current
  -- public.users -> security.* authorization model.
  if to_regclass('public.profiles') is not null then
    raise exception using
      message = 'Authoritative schema preflight failed: conflicting legacy relation public.profiles exists.',
      hint = 'Verify migration history and keep the quarantined profiles/user_roles chain out of the live-aligned database. Do not delete or repair automatically.';
  end if;

  if to_regclass('public.user_roles') is not null then
    raise exception using
      message = 'Authoritative schema preflight failed: conflicting legacy relation public.user_roles exists.',
      hint = 'Verify migration history and keep the quarantined profiles/user_roles chain out of the live-aligned database. Do not delete or repair automatically.';
  end if;

  if to_regclass('public.admin_audit_log') is not null
     or to_regtype('public.app_role') is not null
     or exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('assign_user_role', 'request_demo_reset', 'reset_demo_data')
     ) then
    raise exception using
      message = 'Authoritative schema preflight failed: archived authorization or demo-reset objects exist.',
      hint = 'Compare the database migration history with the quarantined 20260808 migration chain before continuing. Do not remove objects automatically.';
  end if;

  -- Detect evidence that a quarantined migration version was recorded. The
  -- dynamic query is used only because the migration-history relation is not
  -- guaranteed to exist in every disposable PostgreSQL baseline.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'supabase_migrations.schema_migrations'::regclass
        and a.attname = 'version'
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception using
        message = 'Authoritative schema preflight failed: migration history exists without the expected version column.',
        hint = 'Stop and verify the migration tool and history schema before continuing.';
    end if;
    foreach archived_version in array array['202608080001', '202608080002', '202608080003'] loop
      execute
        'select count(*) from supabase_migrations.schema_migrations where version::text = $1'
        into issue_count
        using archived_version;
      if issue_count > 0 then
        raise exception using
          message = format('Authoritative schema preflight failed: quarantined migration version %s is recorded as applied.', archived_version),
          hint = 'Stop and reconcile migration history through a separately reviewed plan. Do not repair history automatically.';
      end if;
    end loop;
  end if;

  -- IF NOT EXISTS would silently accept incompatible pre-existing security
  -- tables. They are therefore rejected before the first approved execution;
  -- an already-applied authorization rollout requires migration-history review.
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'security'
      and c.relname in (
        'roles', 'permissions', 'role_permissions', 'user_permission_overrides',
        'authorization_audit_log', 'admin_login_attempts',
        'blood_request_submission_state', 'blood_request_deduplication',
        'blood_request_abuse_events'
      )
  ) then
    raise exception using
      message = 'Authoritative schema preflight failed: one or more target security tables already exist.',
      hint = 'Determine whether the authorization migration was previously applied or partially applied; do not merge or repair objects automatically.';
  end if;

  -- The existing authorization migration creates policies on every relation
  -- below and is unsafe if any relation is absent or is not an ordinary table.
  foreach relation_name in array array[
    'users', 'donors', 'blood_requests', 'blood_stock', 'blood_banks', 'hospitals'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and c.relkind in ('r', 'p')
    ) then
      raise exception using
        message = format('Authoritative schema preflight failed: required operational table public.%I is missing or is not a table.', relation_name),
        hint = 'Create or reconcile the operational schema through a separately reviewed migration before running the authorization migration.';
    end if;

    select count(*)::integer
    into primary_key_count
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = relation_name
      and con.contype = 'p';

    if primary_key_count > 1 then
      raise exception 'Authoritative schema preflight failed: public.% has an ambiguous primary-key definition.', relation_name;
    end if;
    if not disposable_test and primary_key_count <> 1 then
      raise exception using
        message = format('Authoritative schema preflight failed: public.%I must have exactly one primary key.', relation_name),
        hint = 'Inventory and reconcile the table through an approved operational-schema migration; this preflight will not add a key.';
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and c.relrowsecurity
    ) then
      raise exception using
        message = format('Authoritative schema preflight failed: row-level security is not enabled on public.%I.', relation_name),
        hint = 'Review existing policies and enable RLS only through a separately approved migration before authorization policies are added.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and (not i.indisvalid or not i.indisready)
    ) then
      raise exception 'Authoritative schema preflight failed: public.% has an invalid or not-ready index.', relation_name;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and not con.convalidated
    ) then
      raise exception 'Authoritative schema preflight failed: public.% has an unvalidated constraint.', relation_name;
    end if;
  end loop;

  -- The authorization migration creates these write-policy names without a
  -- preceding DROP, so a collision would make its execution non-idempotently
  -- fail or conceal an unknown policy body.
  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('donors', 'blood_requests', 'blood_stock', 'blood_banks', 'hospitals')
      and (
        p.polname like 'Temporary operational administrators can insert %'
        or p.polname like 'Temporary operational administrators can update %'
        or p.polname like 'Temporary operational administrators can delete %'
      )
  ) then
    raise exception using
      message = 'Authoritative schema preflight failed: an authorization write-policy name already exists.',
      hint = 'Inspect the existing policy and migration history before running the authorization migration.';
  end if;

  -- Columns directly required by current authorization and Edge Function code.
  for expected_column in
    select *
    from (values
      ('users', 'user_id', array['text', 'character varying']::text[]),
      ('users', 'role', array['text', 'character varying']::text[]),
      ('users', 'status', array['text', 'character varying']::text[]),
      ('blood_requests', 'patient_name', array['text', 'character varying']::text[]),
      ('blood_requests', 'blood_group', array['text', 'character varying']::text[]),
      ('blood_requests', 'hospital', array['text', 'character varying']::text[]),
      ('blood_requests', 'mobile', array['text', 'character varying']::text[]),
      ('blood_requests', 'address', array['text', 'character varying']::text[])
    ) as required(table_name, column_name, allowed_types)
  loop
    select format_type(a.atttypid, a.atttypmod)
    into actual_type
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = expected_column.table_name
      and a.attname = expected_column.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if actual_type is null then
      raise exception 'Authoritative schema preflight failed: required column public.%.% is missing.', expected_column.table_name, expected_column.column_name;
    end if;
    if not (actual_type = any(expected_column.allowed_types)
            or actual_type like 'character varying(%') then
      raise exception 'Authoritative schema preflight failed: public.%.% has incompatible type %.', expected_column.table_name, expected_column.column_name, actual_type;
    end if;
  end loop;

  -- The current strict production contract also validates the minimum fields
  -- consumed by fixture-backed operational UIs. Empty placeholder relations
  -- are accepted only in the explicitly approved disposable-test session.
  if not disposable_test then
    for expected_column in
      select *
      from (values
        ('donors', 'full_name'), ('donors', 'mobile'),
        ('donors', 'blood_group'), ('donors', 'status'),
        ('blood_stock', 'blood_group'), ('blood_stock', 'available_units'),
        ('blood_stock', 'reserved_units'),
        ('blood_banks', 'name'), ('blood_banks', 'status'),
        ('hospitals', 'name'), ('hospitals', 'status')
      ) as required(table_name, column_name)
    loop
      if not exists (
        select 1
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on c.oid = a.attrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = expected_column.table_name
          and a.attname = expected_column.column_name
          and a.attnum > 0
          and not a.attisdropped
      ) then
        raise exception using
          message = format('Authoritative schema preflight failed: expected operational column public.%I.%I is missing.', expected_column.table_name, expected_column.column_name),
          hint = 'Confirm the actual live column contract and reconcile it through a reviewed authoritative-schema migration.';
      end if;
    end loop;
  end if;

  -- Optional IDs, if already present, must be UUIDs. The preflight does not
  -- invent or backfill IDs and does not require them in the disposable adapter.
  foreach relation_name in array array[
    'users', 'donors', 'blood_requests', 'blood_stock', 'blood_banks', 'hospitals'
  ] loop
    select format_type(a.atttypid, a.atttypmod)
    into actual_type
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = relation_name
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
    if actual_type is not null and actual_type <> 'uuid' then
      raise exception 'Authoritative schema preflight failed: public.%.id exists but is not uuid.', relation_name;
    end if;
  end loop;

  -- If the separately staged identity index already exists, accept it only
  -- when it is valid, ready, unique, targets user_id, and excludes nulls.
  select i.indisunique, i.indisvalid, i.indisready,
         pg_get_indexdef(i.indexrelid) as definition,
         pg_get_expr(i.indpred, i.indrelid) as predicate
  into identity_index
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_namespace n on n.oid = idx.relnamespace
  where n.nspname = 'public'
    and idx.relname = 'users_user_id_unique_nonnull_idx';

  if found and (
    not identity_index.indisunique
    or not identity_index.indisvalid
    or not identity_index.indisready
    or identity_index.definition !~* '\(user_id\)'
    or coalesce(identity_index.predicate, '') !~* 'user_id IS NOT NULL'
  ) then
    raise exception using
      message = 'Authoritative schema preflight failed: users_user_id_unique_nonnull_idx has an incompatible definition or state.',
      hint = 'Inspect the index and reconcile it through a separately reviewed identity migration.';
  end if;

  -- Any existing FK from user_id must point at auth.users. A text user_id
  -- normally has no such FK yet; the preflight reports rather than repairs it.
  if exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class source_table on source_table.oid = con.conrelid
    join pg_catalog.pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_catalog.pg_attribute source_column
      on source_column.attrelid = source_table.oid
     and source_column.attnum = any(con.conkey)
    where con.contype = 'f'
      and source_schema.nspname = 'public'
      and source_table.relname = 'users'
      and source_column.attname = 'user_id'
      and con.confrelid <> 'auth.users'::regclass
  ) then
    raise exception 'Authoritative schema preflight failed: public.users.user_id has a foreign key to an unexpected relation.';
  end if;

  select count(*) into issue_count
  from public.users
  where user_id is not null
    and user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if issue_count > 0 then
    raise exception using
      message = format('Authoritative schema preflight failed: %s non-null public.users.user_id value(s) are not canonical UUID text.', issue_count),
      hint = 'Reconcile malformed identity mappings through a separately reviewed data plan; values are intentionally not displayed.';
  end if;

  select count(*) into issue_count
  from (
    select user_id
    from public.users
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) duplicate_identities;
  if issue_count > 0 then
    raise exception using
      message = format('Authoritative schema preflight failed: %s duplicated non-null public.users.user_id mapping(s) exist.', issue_count),
      hint = 'Resolve ambiguous mappings through a separately reviewed data plan; identity values are intentionally not displayed.';
  end if;

  select count(*) into issue_count
  from public.users u
  where u.user_id is not null
    and not exists (
      select 1 from auth.users a where a.id::text = u.user_id
    );
  if issue_count > 0 then
    raise exception using
      message = format('Authoritative schema preflight failed: %s non-null public.users.user_id mapping(s) do not match auth.users.', issue_count),
      hint = 'Reconcile unmatched mappings through a separately reviewed identity plan; identity values are intentionally not displayed.';
  end if;

  select count(*) into issue_count
  from public.users u
  where lower(btrim(u.role)) in ('admin', 'super admin')
    and (
      u.user_id is null
      or not exists (select 1 from auth.users a where a.id::text = u.user_id)
      or 1 <> (select count(*) from public.users mapped where mapped.user_id = u.user_id)
    );
  if issue_count > 0 then
    raise exception using
      message = format('Authoritative schema preflight failed: %s privileged user row(s) have null, unmatched, or ambiguous Auth identity mappings.', issue_count),
      hint = 'Stop authorization rollout and reconcile privileged identities through a separately reviewed plan.';
  end if;

  raise notice 'Authoritative schema preflight passed: required relations, identity mappings, legacy conflicts, RLS state, constraints, and relevant indexes are compatible.';
end
$preflight$;
