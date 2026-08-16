\ir _disposable_guard.sql
-- Run only after 202608120004. All destructive test bodies must use fake IDs.
do $$
begin
  if to_regclass('public.demo_batches') is null or to_regclass('security.demo_user_memberships') is null or to_regclass('security.privileged_operation_requests') is null then raise exception 'Demo lifecycle objects missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='blood_requests' and column_name='demo_batch_id') then raise exception 'Fixed demo-capable blood_requests marker missing'; end if;
  if has_table_privilege('anon','public.demo_batches','select') then raise exception 'Anon can read demo batches'; end if;
  if has_table_privilege('authenticated','public.demo_batches','insert') or has_table_privilege('authenticated','security.demo_user_memberships','select') then raise exception 'Demo lifecycle ACL exposed'; end if;
  if not exists (select 1 from security.demo_reset_protected_identities where auth_user_id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004')) then raise exception 'Privileged identities were not protected'; end if;
  if not exists (select 1 from security.permissions where permission_key='demo.read')
     or not exists (select 1 from security.permissions where permission_key='demo.seed' and is_sensitive)
     or not exists (select 1 from security.permissions where permission_key='demo.reset' and is_sensitive) then
    raise exception 'Demo permission catalog is incomplete';
  end if;
  if not exists (select 1 from security.role_permissions where role_name='Admin' and permission_key='demo.seed')
     or not exists (select 1 from security.role_permissions where role_name='Admin' and permission_key='demo.reset') then
    raise exception 'Temporary Admin demo permission mapping is incomplete';
  end if;
end;
$$;

-- Replay uniqueness is asserted without leaving state behind.
begin;
insert into security.privileged_operation_requests(request_id,actor_user_id,action,status) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','demo.seed','started');
do $$ begin
  begin
    insert into security.privileged_operation_requests(request_id,actor_user_id,action,status) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','demo.seed','started');
    raise exception 'Replay uniqueness did not reject a duplicate request ID';
  exception when unique_violation then null;
  end;
end $$;
rollback;

-- Mismatched membership must fail closed: membership Auth ID, metadata markers,
-- public.users mapping, batch, and membership ID must all agree before reset.
-- Execute seed/reset Edge Function cases only after separately approved local
-- function configuration; assert no partial Auth/public/demo/audit cleanup.
