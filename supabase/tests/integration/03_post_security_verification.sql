\ir _disposable_guard.sql
-- Run only after clean preflight, verified partial unique index, and 202608120001.
do $$
declare bad integer;
begin
  if to_regclass('security.permissions') is null or to_regclass('security.authorization_audit_log') is null then raise exception 'Security migration objects missing'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='users' and indexname='users_user_id_unique_nonnull_idx' and indexdef ilike '%unique%' and indexdef ilike '%where (user_id is not null)%') then raise exception 'Required partial unique user_id index is absent or invalid'; end if;
  select count(*) into bad from public.users u where u.user_id is not null and not exists (select 1 from auth.users a where a.id::text=u.user_id);
  if bad > 0 then raise exception 'Unmatched public.users identities remain: %', bad; end if;
  if has_table_privilege('anon','security.permissions','select') or has_table_privilege('authenticated','security.user_permission_overrides','select') then raise exception 'Private authorization ACL exposed'; end if;
  if has_table_privilege('authenticated','public.users','update') then raise exception 'Authenticated has direct public.users UPDATE grant'; end if;
end;
$$;

insert into security.user_permission_overrides(user_id,permission_key,effect,reason,granted_by_user_id) values
 ('10000000-0000-4000-8000-000000000005','system.read_all','deny','local explicit-deny test','10000000-0000-4000-8000-000000000004');

-- JWT simulation is local-test-only. Each block must run inside a transaction.
begin;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
 if not security.current_user_has_role('Admin') then raise exception 'Active Admin role check failed'; end if;
 if not security.current_user_has_permission('system.read_all') then raise exception 'Admin operational permission failed'; end if;
 if security.current_user_has_permission('authorization.manage_roles') then raise exception 'Admin received sensitive authorization permission'; end if;
end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin if security.current_user_has_permission('system.read_all') then raise exception 'Explicit deny did not override Admin role'; end if; end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin if not security.current_user_has_permission('authorization.manage_roles') then raise exception 'Super Admin full-access test failed'; end if; end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
 if security.current_user_has_permission('system.read_all') then raise exception 'Inactive user received a permission'; end if;
 if security.current_user_has_role('User') then raise exception 'Inactive user passed the active-role check'; end if;
end $$;
rollback;

-- Owner-level audit structure/round-trip assertion; browser ACL remains denied.
begin;
insert into security.authorization_audit_log
  (event_type,actor_user_id,subject_user_id,target_type,target_id,reason,metadata)
values
  ('integration.assertion','10000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000001','test','fake-target',
   'local disposable assertion','{"result":"passed"}');
do $$ begin
 if not exists (
   select 1 from security.authorization_audit_log
   where event_type='integration.assertion' and metadata->>'result'='passed'
     and created_at is not null
 ) then raise exception 'Authorization audit round-trip failed'; end if;
end $$;
rollback;
