\ir _disposable_guard.sql
-- Execute each identity section in a fresh transaction. SET LOCAL ROLE tests
-- grants; request.jwt.claim.* supplies auth.uid() for policies.
-- ANON: all protected reads/writes and security schema access must fail.
begin; set local role anon;
select count(*) from public.demo_batches; -- EXPECTED: denied/no rows according to grant boundary.
select count(*) from security.permissions; -- EXPECTED: permission denied.
rollback;
-- ORDINARY ACTIVE: operational read policies must return no unauthorized rows;
-- all writes and all security-table reads must fail.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select * from public.users; -- EXPECTED: no system-wide rows.
update public.users set role='Admin' where user_id='10000000-0000-4000-8000-000000000001'; -- EXPECTED: denied.
rollback;

-- ADMIN: system.read_all reads are permitted; public.users role/status writes,
-- security configuration, and sensitive authorization management remain denied.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select * from public.users;
update public.users set role='Super Admin' where user_id='10000000-0000-4000-8000-000000000003'; -- EXPECTED: denied.
rollback;

-- SUPER ADMIN TEST IDENTITY: permission helpers may satisfy system.full_access,
-- but browser table grants must still deny direct authorization-table mutation.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select security.current_user_has_permission('authorization.manage_roles'); -- EXPECTED: true.
insert into security.role_permissions(role_name,permission_key) values ('Admin','authorization.manage_roles'); -- EXPECTED: denied.
rollback;
