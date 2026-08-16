\ir ../_disposable_guard.sql

do $verify_identity_foundation$
declare
  issue_count integer;
  auth_user_attnum smallint;
  user_id_attnum smallint;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'auth_user_id'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'
      and not a.attnotnull
      and not a.atthasdef
      and a.attgenerated = ''
  ) then
    raise exception 'Canonical identity foundation verification failed: nullable UUID shadow column is missing or incompatible.';
  end if;

  select a.attnum into auth_user_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'auth_user_id' and a.attnum > 0 and not a.attisdropped;
  select a.attnum into user_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.users'::regclass
    and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped;

  select count(*) into issue_count
  from pg_catalog.pg_constraint con
  where con.conrelid = 'public.users'::regclass
    and con.contype = 'f'
    and auth_user_attnum = any(con.conkey)
    and con.convalidated
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
    and con.confmatchtype = 's';
  if issue_count <> 1 then
    raise exception 'Canonical identity foundation verification failed: expected exactly one approved Auth foreign key.';
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_constraint con
  where con.conrelid = 'public.users'::regclass
    and con.contype = 'c'
    and (auth_user_attnum = any(con.conkey)
         or pg_catalog.pg_get_expr(con.conbin, con.conrelid) ~* '\mauth_user_id\M')
    and con.convalidated
    and pg_catalog.array_length(con.conkey, 1) = 2
    and auth_user_attnum = any(con.conkey)
    and user_id_attnum = any(con.conkey)
    and pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.pg_get_constraintdef(con.oid, true)),
      '[[:space:]()]', '', 'g'
    ) = 'checkauth_user_idisnulloruser_idisnotnullanduser_id=auth_user_id::text';
  if issue_count <> 1 then
    raise exception 'Canonical identity foundation verification failed: expected exactly one approved compatibility CHECK.';
  end if;

  select count(*) into issue_count
  from (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = idx.relam
    where i.indrelid = 'public.users'::regclass
      and auth_user_attnum = any(i.indkey::smallint[])
      and i.indisunique and not i.indisexclusion
      and i.indisvalid and i.indisready and i.indislive
      and am.amname = 'btree'
      and i.indexprs is null
      and i.indnkeyatts = 1 and i.indnatts = 1
      and pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '')),
        '[[:space:]()]', '', 'g'
      ) = 'auth_user_idisnotnull'
  ) approved_indexes;
  if issue_count <> 1 then
    raise exception 'Canonical identity foundation verification failed: expected exactly one approved partial unique index.';
  end if;

  if exists (select 1 from public.users where auth_user_id is not null) then
    raise exception 'Canonical identity foundation verification failed: preparation unexpectedly populated identity data.';
  end if;
end
$verify_identity_foundation$;
