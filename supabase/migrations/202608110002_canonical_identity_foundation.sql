-- CANONICAL IDENTITY FOUNDATION: ADDITIVE PREPARATION ONLY.
--
-- This migration does not convert, backfill, delete, or rewrite public.users
-- records. public.users.user_id remains the active compatibility identity for
-- existing authorization code. The nullable UUID shadow column is populated
-- only by a later, separately approved reconciliation migration after live
-- aggregate evidence has been reviewed.

do $identity_precheck$
declare
  actual_type text;
  issue_count bigint;
  auth_user_attnum smallint;
  user_id_attnum smallint;
  approved_count integer;
begin
  if to_regclass('auth.users') is null or to_regclass('public.users') is null then
    raise exception using
      message = 'Canonical identity foundation failed: required Auth or application user relation is missing.',
      hint = 'Run and review the authoritative schema preflight before this migration.';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
  into actual_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'user_id'
    and a.attnum > 0
    and not a.attisdropped;
  if actual_type is null
     or not (actual_type in ('text', 'character varying')
             or actual_type like 'character varying(%') then
    raise exception using
      message = 'Canonical identity foundation failed: public.users.user_id is missing or has an incompatible type.',
      hint = 'Do not convert identity data automatically; reconcile the schema through a separately reviewed plan.';
  end if;

  select count(*) into issue_count
  from public.users
  where user_id is not null
    and user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s non-null legacy identity mapping(s) are malformed.', issue_count),
      hint = 'Reconcile malformed mappings without exposing identity values; this migration will not repair them.';
  end if;

  select count(*) into issue_count
  from (
    select user_id
    from public.users
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) duplicate_mappings;
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s duplicated non-null legacy identity mapping(s) exist.', issue_count),
      hint = 'Resolve ambiguity through a separately reviewed data plan; this migration will not select or rewrite a winner.';
  end if;

  select count(*) into issue_count
  from public.users u
  where u.user_id is not null
    and not exists (select 1 from auth.users a where a.id::text = u.user_id);
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s non-null legacy identity mapping(s) do not match Auth identities.', issue_count),
      hint = 'Reconcile unmatched mappings through a separately reviewed plan; identity values are intentionally not displayed.';
  end if;

  select count(*) into issue_count
  from public.users u
  where lower(pg_catalog.btrim(u.role)) in ('admin', 'super admin')
    and (
      u.user_id is null
      or not exists (select 1 from auth.users a where a.id::text = u.user_id)
      or 1 <> (select count(*) from public.users mapped where mapped.user_id = u.user_id)
    );
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s privileged user row(s) have unsafe legacy identity mappings.', issue_count),
      hint = 'Stop and reconcile privileged identities before continuing; this migration performs no repair.';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
  into actual_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'auth_user_id'
    and a.attnum > 0
    and not a.attisdropped;
  if actual_type is not null and actual_type <> 'uuid' then
    raise exception using
      message = 'Canonical identity foundation failed: public.users.auth_user_id already exists with an incompatible type.',
      hint = 'Inspect and reconcile the existing column through a separately reviewed migration.';
  end if;
  if actual_type is null and (
    exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.users'::regclass
        and conname in ('users_auth_user_id_auth_users_fk', 'users_auth_user_id_matches_legacy_check')
    )
    or to_regclass('public.users_auth_user_id_unique_nonnull_idx') is not null
  ) then
    raise exception 'Canonical identity foundation failed: canonical identity object names exist without the approved auth_user_id column.';
  end if;
  if actual_type = 'uuid' and exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'auth_user_id'
      and (a.attnotnull or a.atthasdef or a.attgenerated <> '')
  ) then
    raise exception using
      message = 'Canonical identity foundation failed: existing auth_user_id is not a nullable, default-free, non-generated UUID column.',
      hint = 'Do not accept or rewrite the unknown column definition automatically.';
  end if;

  if actual_type = 'uuid' then
    select a.attnum into auth_user_attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'auth_user_id'
      and a.attnum > 0
      and not a.attisdropped;
    select a.attnum into user_id_attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'user_id'
      and a.attnum > 0
      and not a.attisdropped;

    if exists (
      select 1 from pg_catalog.pg_constraint con
      where con.conrelid = 'public.users'::regclass
        and con.conname in ('users_auth_user_id_auth_users_fk', 'users_auth_user_id_matches_legacy_check')
        and not auth_user_attnum = any(con.conkey)
    ) then
      raise exception 'Canonical identity foundation failed: an approved constraint name is occupied by unrelated semantics.';
    end if;

    -- Inventory every FK containing auth_user_id. Only a validated,
    -- single-column FK to auth.users(id), with RESTRICT on delete and NO ACTION
    -- on update, is an approved canonical relationship. Names are irrelevant.
    select count(*)::integer into issue_count
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'f'
      and auth_user_attnum = any(con.conkey)
      and not (
        con.convalidated
        and pg_catalog.array_length(con.conkey, 1) = 1
        and pg_catalog.array_length(con.confkey, 1) = 1
        and con.confrelid = 'auth.users'::regclass
        and con.confkey[1] = (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'auth.users'::regclass
            and a.attname = 'id' and a.attnum > 0 and not a.attisdropped
        )
        and con.confdeltype = 'r'
        and con.confupdtype = 'a'
        and con.confmatchtype = 's'
      );
    if issue_count > 0 then
      raise exception using
        message = format('Canonical identity foundation failed: %s incompatible foreign-key constraint(s) involve auth_user_id.', issue_count),
        hint = 'Only a validated single-column FK to auth.users(id) with ON DELETE RESTRICT is approved; object names and identity values are intentionally not displayed.';
    end if;

    -- Inventory every CHECK whose dependency columns or stored expression
    -- mention auth_user_id. Only the exact compatibility invariant is allowed.
    select count(*)::integer into issue_count
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'c'
      and (
        auth_user_attnum = any(con.conkey)
        or pg_catalog.pg_get_expr(con.conbin, con.conrelid) ~* '\mauth_user_id\M'
      )
      and not (
        con.convalidated
        and pg_catalog.array_length(con.conkey, 1) = 2
        and auth_user_attnum = any(con.conkey)
        and user_id_attnum = any(con.conkey)
        and pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_constraintdef(con.oid, true)),
          '[[:space:]()]', '', 'g'
        ) = 'checkauth_user_idisnulloruser_idisnotnullanduser_id=auth_user_id::text'
      );
    if issue_count > 0 then
      raise exception using
        message = format('Canonical identity foundation failed: %s unknown or incompatible CHECK constraint(s) involve auth_user_id.', issue_count),
        hint = 'Only the approved nullable legacy-consistency invariant is allowed; object names and identity values are intentionally not displayed.';
    end if;

    -- Inventory keys, INCLUDE columns, expressions, and predicates for every
    -- index involving auth_user_id. Only one-column, non-expression, partial
    -- btree uniqueness over non-null auth_user_id is approved.
    select count(*)::integer into issue_count
    from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = idx.relam
    where i.indrelid = 'public.users'::regclass
      and (
        auth_user_attnum = any(i.indkey::smallint[])
        or coalesce(pg_catalog.pg_get_expr(i.indexprs, i.indrelid), '') ~* '\mauth_user_id\M'
        or coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '') ~* '\mauth_user_id\M'
      )
      and not (
        i.indisunique and not i.indisexclusion
        and i.indisvalid and i.indisready and i.indislive
        and am.amname = 'btree'
        and i.indexprs is null
        and i.indnkeyatts = 1 and i.indnatts = 1
        and auth_user_attnum = any(i.indkey::smallint[])
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '')),
          '[[:space:]()]', '', 'g'
        ) = 'auth_user_idisnotnull'
      );
    if issue_count > 0 then
      raise exception using
        message = format('Canonical identity foundation failed: %s unknown or incompatible index(es) involve auth_user_id.', issue_count),
        hint = 'Only a valid one-column partial unique btree index for non-null auth_user_id is approved; object names and identity values are intentionally not displayed.';
    end if;

    -- Multiple semantically identical safeguards are harmless but signal an
    -- unknown partial rollout; fail rather than silently retain duplicates.
    select count(*)::integer into approved_count
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'f'
      and auth_user_attnum = any(con.conkey);
    if approved_count > 1 then
      raise exception 'Canonical identity foundation failed: multiple canonical identity foreign keys exist.';
    end if;

    select count(*)::integer into approved_count
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'c'
      and (auth_user_attnum = any(con.conkey)
           or pg_catalog.pg_get_expr(con.conbin, con.conrelid) ~* '\mauth_user_id\M');
    if approved_count > 1 then
      raise exception 'Canonical identity foundation failed: multiple canonical identity CHECK constraints exist.';
    end if;

    select count(*)::integer into approved_count
    from pg_catalog.pg_index i
    where i.indrelid = 'public.users'::regclass
      and (
        auth_user_attnum = any(i.indkey::smallint[])
        or coalesce(pg_catalog.pg_get_expr(i.indexprs, i.indrelid), '') ~* '\mauth_user_id\M'
        or coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '') ~* '\mauth_user_id\M'
      );
    if approved_count > 1 then
      raise exception 'Canonical identity foundation failed: multiple canonical identity indexes exist.';
    end if;

    if to_regclass('public.users_auth_user_id_unique_nonnull_idx') is not null
       and not exists (
         select 1
         from pg_catalog.pg_index i
         join pg_catalog.pg_class idx on idx.oid = i.indexrelid
         join pg_catalog.pg_am am on am.oid = idx.relam
         where idx.oid = 'public.users_auth_user_id_unique_nonnull_idx'::regclass
           and i.indrelid = 'public.users'::regclass
           and i.indisunique and not i.indisexclusion
           and i.indisvalid and i.indisready and i.indislive
           and am.amname = 'btree'
           and i.indexprs is null
           and i.indnkeyatts = 1 and i.indnatts = 1
           and auth_user_attnum = any(i.indkey::smallint[])
           and pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '')),
             '[[:space:]()]', '', 'g'
           ) = 'auth_user_idisnotnull'
       ) then
      raise exception 'Canonical identity foundation failed: users_auth_user_id_unique_nonnull_idx is occupied by incompatible semantics.';
    end if;
  end if;
end
$identity_precheck$;

alter table public.users
  add column if not exists auth_user_id uuid;

do $identity_constraints$
declare
  issue_count bigint;
  auth_user_attnum smallint;
begin
  select a.attnum into auth_user_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'auth_user_id'
    and a.attnum > 0
    and not a.attisdropped;
  -- Fail before indexing if a prior partial preparation populated unsafe data.
  select count(*) into issue_count
  from public.users u
  where u.auth_user_id is not null
    and (
      u.user_id is null
      or u.user_id <> u.auth_user_id::text
      or not exists (select 1 from auth.users a where a.id = u.auth_user_id)
    );
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s existing canonical identity value(s) conflict with legacy or Auth mappings.', issue_count),
      hint = 'Reconcile the partial preparation through a separately reviewed plan; values are intentionally not displayed.';
  end if;

  select count(*) into issue_count
  from (
    select auth_user_id
    from public.users
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) duplicate_canonical_mappings;
  if issue_count > 0 then
    raise exception using
      message = format('Canonical identity foundation failed: %s duplicated canonical identity mapping(s) exist.', issue_count),
      hint = 'Resolve ambiguity through a separately reviewed plan; this migration will not choose or rewrite a row.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'f'
      and auth_user_attnum = any(con.conkey)
  ) then
    alter table public.users
      add constraint users_auth_user_id_auth_users_fk
      foreign key (auth_user_id) references auth.users(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = 'public.users'::regclass
      and con.contype = 'c'
      and (
        auth_user_attnum = any(con.conkey)
        or pg_catalog.pg_get_expr(con.conbin, con.conrelid) ~* '\mauth_user_id\M'
      )
  ) then
    alter table public.users
      add constraint users_auth_user_id_matches_legacy_check
      check (
        auth_user_id is null
        or (user_id is not null and user_id = auth_user_id::text)
      );
  end if;
end
$identity_constraints$;

do $identity_index$
declare
  auth_user_attnum smallint;
begin
  select a.attnum into auth_user_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'auth_user_id'
    and a.attnum > 0
    and not a.attisdropped;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.users'::regclass
      and (
        auth_user_attnum = any(i.indkey::smallint[])
        or coalesce(pg_catalog.pg_get_expr(i.indexprs, i.indrelid), '') ~* '\mauth_user_id\M'
        or coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '') ~* '\mauth_user_id\M'
      )
  ) then
    create unique index users_auth_user_id_unique_nonnull_idx
      on public.users (auth_user_id)
      where auth_user_id is not null;
  end if;
end
$identity_index$;

-- Deliberately absent from this phase:
--   * UPDATE/backfill of auth_user_id
--   * NOT NULL enforcement
--   * removal or type conversion of user_id
--   * authorization/RLS helper cutover
