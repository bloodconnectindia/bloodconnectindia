-- MANUAL, READ-ONLY PREFLIGHT. Keep outside supabase/migrations so it cannot
-- execute accidentally. Run only after explicit approval in a controlled SQL
-- session. It changes no data or schema and fails closed on invalid identities.
do $$
declare
  duplicate_count integer;
  missing_auth_count integer;
  null_count integer;
begin
  select count(*) into duplicate_count from (
    select user_id from public.users where user_id is not null group by user_id having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'Preflight failed: % duplicate non-null public.users.user_id values', duplicate_count;
  end if;

  select count(*) into missing_auth_count
  from public.users u
  where u.user_id is not null
    and not exists (select 1 from auth.users a where a.id::text = u.user_id);
  if missing_auth_count > 0 then
    raise exception 'Preflight failed: % public.users.user_id values do not match auth.users', missing_auth_count;
  end if;

  select count(*) into null_count from public.users where user_id is null;
  raise notice 'Preflight passed. public.users rows with null user_id: %', null_count;
end;
$$;
