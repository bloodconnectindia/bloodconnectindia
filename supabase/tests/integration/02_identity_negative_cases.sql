\ir _disposable_guard.sql
-- Each savepoint deliberately creates a bad identity. Run the staged preflight
-- manually at the marked point and require it to fail, then roll back the case.
begin;
savepoint duplicate_identity;
insert into public.users (user_id, role, status) values ('10000000-0000-4000-8000-000000000001','User','Active');
-- EXPECTED: 202608120002_users_identity_preflight.sql fails on duplicate user_id.
rollback to duplicate_identity;

savepoint unmatched_identity;
insert into public.users (user_id, role, status) values ('10000000-0000-4000-8000-999999999999','User','Active');
-- EXPECTED: preflight fails because no auth.users row matches.
rollback to unmatched_identity;

savepoint null_privileged_identity;
insert into public.users (user_id, role, status) values (null,'Admin','Active');
-- EXPECTED: preflight reports the null; demo migration must fail closed later.
rollback to null_privileged_identity;
rollback;
