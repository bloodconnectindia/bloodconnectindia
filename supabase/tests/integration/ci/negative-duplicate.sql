\ir ../_disposable_guard.sql
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('30000000-0000-4000-8000-000000000001','authenticated','authenticated','negative-duplicate@bci.invalid','{}','{}',now(),now());
insert into public.users(user_id,role,status) values
 ('30000000-0000-4000-8000-000000000001','User','Active'),
 ('30000000-0000-4000-8000-000000000001','User','Active');
\ir ../../../staged-migrations/202608120002_users_identity_preflight.sql
commit;
