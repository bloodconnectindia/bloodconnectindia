\ir ../_disposable_guard.sql

-- PROPOSED LOCAL ADAPTER ONLY. DO NOT APPLY TO THE LIVE PROJECT.
-- Least-privilege disposable ACL adapter. All six relations remain owned by
-- postgres with RLS enabled, and no column-level ACL is permitted.
revoke all privileges
on table public.users, public.donors, public.blood_requests,
  public.blood_stock, public.blood_banks, public.hospitals
from public, anon, authenticated, service_role;

grant select, insert, update, delete, truncate, references, trigger, maintain
on table public.users, public.donors, public.blood_requests,
  public.blood_stock, public.blood_banks, public.hospitals
to postgres;

grant select
on table public.users, public.donors, public.blood_requests,
  public.blood_stock, public.blood_banks, public.hospitals
to authenticated;

grant select, insert, delete on table public.users to service_role;

-- Fail if this disposable adapter ever expands beyond the approved grantees or
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
     or not (
       (actual.grantee='postgres' and actual.privilege_type in
         ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'))
       or (actual.grantee='authenticated' and actual.privilege_type='SELECT')
       or (actual.relname='users' and actual.grantee='service_role'
           and actual.privilege_type in ('SELECT','INSERT','DELETE'))
     );
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
  if unexpected<>57 then
    raise exception 'Verified operational ACL is incomplete: expected 57 entries, found %', unexpected;
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
