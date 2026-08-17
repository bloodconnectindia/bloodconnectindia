\ir ../_disposable_guard.sql

do $verify_identity_evidence_fixture$
declare
  anomaly_count bigint;
  eligible_count bigint;
  total_count bigint;
begin
  with parsed as (
    select
      u.user_id,
      u.auth_user_id,
      case
        when u.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then u.user_id::uuid
        else null
      end as legacy_uuid
    from public.users u
  ), classified as (
    select
      p.*,
      count(*) over (partition by p.legacy_uuid) as legacy_uuid_count
    from parsed p
  ), assessed as (
    select
      c.*,
      a.id is not null as auth_match,
      exists (
        select 1 from public.users occupied
        where occupied.auth_user_id = c.legacy_uuid
          and occupied.user_id is distinct from c.user_id
      ) as occupied_elsewhere
    from classified c
    left join auth.users a on a.id = c.legacy_uuid
  )
  select
    count(*) filter (where user_id is null or legacy_uuid is null or legacy_uuid_count <> 1
      or not auth_match or occupied_elsewhere
      or (auth_user_id is not null and auth_user_id <> legacy_uuid)),
    count(*) filter (where user_id is not null and legacy_uuid is not null and legacy_uuid_count = 1
      and auth_match and not occupied_elsewhere
      and (auth_user_id is null or auth_user_id = legacy_uuid)),
    count(*)
  into anomaly_count, eligible_count, total_count
  from assessed;

  if anomaly_count <> 0 or eligible_count <> total_count then
    raise exception 'Identity evidence fixture verification failed: clean aggregate contract was not satisfied.';
  end if;

  if exists (select 1 from public.users where auth_user_id is not null) then
    raise exception 'Identity evidence fixture verification failed: evidence execution changed identity data.';
  end if;
end
$verify_identity_evidence_fixture$;
