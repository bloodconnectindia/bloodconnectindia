\ir ../_disposable_guard.sql

-- PROPOSED LOCAL ADAPTER ONLY. DO NOT APPLY TO THE LIVE PROJECT.
-- Exact table ACL inventory observed read-only in the authenticated Supabase
-- Dashboard on 2026-08-14. Every listed ACL item was granted by postgres and
-- was reported without grant option. All six relations are owned by postgres
-- and have RLS enabled. No column-level ACL was present.

-- Live ACL: postgres=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
-- on every operational table.
grant select, insert, update, delete, truncate, references, trigger, maintain
on table public.users, public.donors, public.blood_requests,
  public.blood_stock, public.blood_banks, public.hospitals
to postgres, authenticated, service_role;

-- Live anon ACL is arwdDxtm on all operational tables except blood_requests.
grant select, insert, update, delete, truncate, references, trigger, maintain
on table public.users, public.donors, public.blood_stock,
  public.blood_banks, public.hospitals
to anon;

-- Live public.blood_requests anon ACL is exactly am: INSERT and MAINTAIN.
grant insert, maintain on table public.blood_requests to anon;

-- Fail if this disposable adapter ever expands beyond the observed grantees or
-- privileges. Policy behavior is asserted separately because the prepared
-- authorization migration intentionally adds permission-based policies while
-- preserving live legacy policy names during transition.
do $$
declare
  unexpected integer;
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('users','donors','blood_requests','blood_stock','blood_banks','hospitals')
      and (pg_get_userbyid(c.relowner)<>'postgres' or not c.relrowsecurity)
  ) then
    raise exception 'Verified operational owner/RLS baseline mismatch';
  end if;

  select count(*) into unexpected
  from (
    select c.relname,
           coalesce(pg_get_userbyid(a.grantee),'PUBLIC') as grantee,
           a.privilege_type,
           pg_get_userbyid(a.grantor) as grantor,
           a.is_grantable
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))
    ) a
    where n.nspname='public'
      and c.relname in ('users','donors','blood_requests','blood_stock','blood_banks','hospitals')
  ) actual
  where actual.grantor<>'postgres' or actual.is_grantable
     or actual.grantee not in ('postgres','anon','authenticated','service_role')
     or actual.privilege_type not in
       ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
     or (actual.relname='blood_requests' and actual.grantee='anon'
         and actual.privilege_type not in ('INSERT','MAINTAIN'));
  if unexpected<>0 then
    raise exception 'Verified operational ACL contains an unreviewed grant';
  end if;

  select count(*) into unexpected
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))
  ) a
  where n.nspname='public'
    and c.relname in ('users','donors','blood_requests','blood_stock','blood_banks','hospitals');
  if unexpected<>186 then
    raise exception 'Verified operational ACL is incomplete: expected 186 entries, found %', unexpected;
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('users','donors','blood_requests','blood_stock','blood_banks','hospitals')
      and a.attnum>0 and not a.attisdropped and a.attacl is not null
  ) then
    raise exception 'Verified operational ACL unexpectedly contains column grants';
  end if;
end;
$$;
