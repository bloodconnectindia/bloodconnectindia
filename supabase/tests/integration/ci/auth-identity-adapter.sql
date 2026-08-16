\ir ../_disposable_guard.sql
-- Deterministic database-level identities for an isolated native Supabase Auth
-- schema. These reserved examples are not credentials and cannot authenticate.
insert into auth.users
  (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','ordinary@bci.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','inactive@bci.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','admin@bci.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','super-admin@bci.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','denied@bci.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000006','authenticated','authenticated','demo@bci.invalid','{"provider":"email","providers":["email"]}','{"is_demo":true}',now(),now()),
 ('10000000-0000-4000-8000-000000000007','authenticated','authenticated','malformed-demo@bci.invalid','{"provider":"email","providers":["email"]}','{"is_demo":true,"demo_batch_id":"mismatch"}',now(),now());

insert into public.users (user_id, role, status) values
 ('10000000-0000-4000-8000-000000000001','User','Active'),
 ('10000000-0000-4000-8000-000000000002','User','Inactive'),
 ('10000000-0000-4000-8000-000000000003','Admin','Active'),
 ('10000000-0000-4000-8000-000000000004','Super Admin','Active'),
 ('10000000-0000-4000-8000-000000000005','Admin','Active'),
 ('10000000-0000-4000-8000-000000000006','User','Active'),
 ('10000000-0000-4000-8000-000000000007','User','Active');
