\ir _disposable_guard.sql
-- Run before any fixture or migration. Expected baseline objects are required;
-- legacy authorization objects must not be used as the future identity source.
do $$
declare missing text;
begin
  select string_agg(name, ', ') into missing from unnest(array[
    'public.users','public.donors','public.blood_requests','public.blood_stock','public.blood_banks','public.hospitals','auth.users'
  ]) name where to_regclass(name) is null;
  if missing is not null then raise exception 'Missing baseline relations: %', missing; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='user_id' and data_type='text') then
    raise exception 'public.users.user_id text identity source is missing';
  end if;
end;
$$;
