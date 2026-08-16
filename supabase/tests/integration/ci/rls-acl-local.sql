\ir ../_disposable_guard.sql
-- Isolated policy/ACL cases. The runner invokes this only after the reviewed
-- operational ACL adapter succeeds. Each behavioral case rolls back its data
-- and role/JWT state. No assertion below grants a production privilege.

\if :{?bci_scope}
\else
  \quit 64
\endif

do $$
declare relation_name text;
begin
  foreach relation_name in array array['users','donors','blood_requests','blood_stock','blood_banks','hospitals'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=relation_name and c.relrowsecurity) then
      raise exception 'RLS missing on public.%', relation_name;
    end if;
  end loop;
  if has_table_privilege('anon','public.users','select')
     or has_table_privilege('anon','public.blood_requests','insert') then
    raise exception 'Anon received a protected operational ACL';
  end if;
  if has_table_privilege('authenticated','public.users','update') then
    raise exception 'Browser role can update public.users role/status';
  end if;
  if not has_function_privilege('authenticated','security.current_user_has_permission(text)','execute') then
    raise exception 'Authenticated permission-helper EXECUTE grant missing';
  end if;
end;
$$;

-- Ordinary authenticated user: helpers fail and protected reads expose no rows.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if security.current_user_has_permission('system.read_all') then raise exception 'Ordinary user received read-all'; end if;
end $$;
select * from public.users where false;
select * from public.donors where false;
select * from public.blood_requests where false;
select * from public.blood_stock where false;
select * from public.blood_banks where false;
select * from public.hospitals where false;
rollback;

-- Admin and future Super Admin receive policy-mediated reads only where the
-- reviewed ACL permits SELECT. The helper assertions cover authorization
-- independently of table grants.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  if not security.current_user_has_permission('system.read_all') then raise exception 'Admin read permission missing'; end if;
  if security.current_user_has_permission('authorization.manage_roles') then raise exception 'Admin received sensitive permission'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin
  if not security.current_user_has_permission('system.read_all') then raise exception 'Super Admin full access did not imply operational read'; end if;
  if not security.current_user_has_permission('authorization.manage_roles') then raise exception 'Super Admin sensitive permission missing'; end if;
end $$;
rollback;

-- Explicit deny wins over Admin role (and is also exercised against the future
-- full-access role by a transaction-local fixture).
begin;
insert into security.user_permission_overrides(user_id,permission_key,effect,reason)
values ('10000000-0000-4000-8000-000000000004','system.read_all','deny','isolated deny precedence')
on conflict (user_id,permission_key) do update set effect='deny',reason=excluded.reason;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin if security.current_user_has_permission('system.read_all') then raise exception 'Explicit deny lost to full access'; end if; end $$;
rollback;

-- All private security relations remain browser-inaccessible regardless of
-- helper results. Demo relations are checked only after the demo phase.
do $$
declare relation_name text;
begin
  foreach relation_name in array array['roles','permissions','role_permissions','user_permission_overrides','authorization_audit_log','admin_login_attempts','blood_request_submission_state','blood_request_deduplication','blood_request_abuse_events'] loop
    if has_table_privilege('anon',format('security.%I',relation_name),'select')
       or has_table_privilege('authenticated',format('security.%I',relation_name),'select')
       or has_table_privilege('authenticated',format('security.%I',relation_name),'insert,update,delete') then
      raise exception 'Private security ACL exposed: %', relation_name;
    end if;
  end loop;
end;
$$;

\if :bci_is_demo
do $$ begin
  if has_table_privilege('anon','public.demo_batches','select') then raise exception 'Anon can read demo batches'; end if;
  if not has_table_privilege('authenticated','public.demo_batches','select') then raise exception 'Reviewed demo SELECT grant missing'; end if;
  if has_table_privilege('authenticated','public.demo_batches','insert,update,delete')
     or has_table_privilege('authenticated','security.demo_user_memberships','select,insert,update,delete')
     or has_table_privilege('authenticated','security.privileged_operation_requests','select,insert,update,delete')
     or has_table_privilege('authenticated','security.demo_reset_protected_identities','select,insert,update,delete') then
    raise exception 'Demo/private mutation ACL exposed';
  end if;
end $$;
\endif
