\ir ../_disposable_guard.sql
begin;
insert into public.users(user_id,role,status)
values ('30000000-0000-4000-8000-000000000002','User','Active');
\ir ../../../staged-migrations/202608120002_users_identity_preflight.sql
commit;
