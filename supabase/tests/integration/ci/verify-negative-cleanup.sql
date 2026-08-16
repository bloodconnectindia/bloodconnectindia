\ir ../_disposable_guard.sql
do $$ begin
  if exists (select 1 from public.users where user_id like '30000000-%')
     or exists (select 1 from auth.users where id::text like '30000000-%')
     or exists (select 1 from public.users where user_id is null and lower(role) in ('admin','super admin')) then
    raise exception 'Negative identity case contaminated the clean baseline';
  end if;
end $$;
