\ir ../_disposable_guard.sql
begin;
insert into public.users(user_id,role,status) values (null,'Admin','Active');
\ir ../../../staged-migrations/202608120002_users_identity_preflight.sql
do $$ begin
  if exists (select 1 from public.users where user_id is null and lower(role) in ('admin','super admin')) then
    raise exception 'Expected fail-closed condition: privileged null identity';
  end if;
end $$;
commit;
