-- Phase 3 identity reconciliation evidence contract.
-- This script is intentionally outside the runnable migration manifest. It is
-- read-only, emits aggregate counts only, and never performs an identity backfill.

begin transaction isolation level repeatable read read only;

do $identity_evidence_preflight$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'Identity evidence failed: a read-only transaction is required.';
  end if;

  if to_regclass('public.users') is null or to_regclass('auth.users') is null then
    raise exception 'Identity evidence failed: required identity relations are missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'user_id'
      and pg_catalog.format_type(a.atttypid, a.atttypmod)
        in ('text', 'character varying')
      and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Identity evidence failed: legacy identity column is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'auth_user_id'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'
      and not a.attnotnull and not a.atthasdef and a.attgenerated = ''
      and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Identity evidence failed: canonical identity column is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.users'::regclass
      and a.attname = 'role'
      and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Identity evidence failed: role classification column is missing.';
  end if;
end
$identity_evidence_preflight$;

with
source as (
  select
    u.user_id,
    u.auth_user_id,
    lower(btrim(coalesce(u.role, ''))) in ('admin', 'super admin') as is_privileged,
    case
      when u.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then u.user_id::uuid
      else null
    end as legacy_uuid
  from public.users u
),
legacy_text_counts as (
  select u.user_id, count(*)::bigint as occurrence_count
  from public.users u
  where u.user_id is not null
  group by u.user_id
),
legacy_uuid_counts as (
  select s.legacy_uuid, count(*)::bigint as occurrence_count
  from source s
  where s.legacy_uuid is not null
  group by s.legacy_uuid
),
canonical_counts as (
  select u.auth_user_id, count(*)::bigint as occurrence_count
  from public.users u
  where u.auth_user_id is not null
  group by u.auth_user_id
),
classified as (
  select
    s.*,
    coalesce(ltc.occurrence_count, 0) as legacy_text_occurrence_count,
    coalesce(luc.occurrence_count, 0) as legacy_uuid_occurrence_count
  from source s
  left join legacy_text_counts ltc on ltc.user_id = s.user_id
  left join legacy_uuid_counts luc on luc.legacy_uuid = s.legacy_uuid
),
evaluated as (
  select
    c.*,
    (legacy_auth.id is not null) as legacy_auth_match,
    (canonical_auth.id is not null) as canonical_auth_match,
    c.legacy_uuid_occurrence_count > 1
      or coalesce(cc.occurrence_count, 0) >
        case when c.auth_user_id = c.legacy_uuid then 1 else 0 end
      as prospective_auth_user_id_conflict,
    c.auth_user_id is not null and (
      c.legacy_uuid is null
      or c.auth_user_id <> c.legacy_uuid
      or canonical_auth.id is null
    ) as auth_user_id_inconsistent
  from classified c
  left join auth.users legacy_auth on legacy_auth.id = c.legacy_uuid
  left join auth.users canonical_auth on canonical_auth.id = c.auth_user_id
  left join canonical_counts cc on cc.auth_user_id = c.legacy_uuid
),
row_assessment as (
  select
    e.*,
    (
      e.legacy_uuid is not null
      and e.legacy_uuid_occurrence_count = 1
      and e.legacy_auth_match
      and not e.prospective_auth_user_id_conflict
      and not e.auth_user_id_inconsistent
    ) as eligible_mapping,
    (
      e.is_privileged and not (
        e.legacy_uuid is not null
        and e.legacy_uuid_occurrence_count = 1
        and e.legacy_auth_match
        and not e.prospective_auth_user_id_conflict
        and not e.auth_user_id_inconsistent
      )
    ) as privileged_mapping_anomaly
  from evaluated e
),
aggregate_evidence as (
  select
    count(*)::bigint as total_public_users_rows,
    count(*) filter (where user_id is null)::bigint as null_legacy_user_id_rows,
    count(*) filter (where user_id is not null and legacy_uuid is null)::bigint as malformed_legacy_uuid_text_rows,
    count(*) filter (where legacy_text_occurrence_count > 1)::bigint as duplicate_legacy_user_id_rows,
    count(*) filter (where legacy_uuid is not null and not legacy_auth_match)::bigint as legacy_ids_unmatched_to_auth_rows,
    count(*) filter (where prospective_auth_user_id_conflict)::bigint as prospective_auth_user_id_conflict_rows,
    count(*) filter (where auth_user_id is not null)::bigint as rows_already_carrying_auth_user_id,
    count(*) filter (where auth_user_id_inconsistent)::bigint as inconsistent_auth_user_id_rows,
    count(*) filter (where privileged_mapping_anomaly)::bigint as privileged_mapping_anomaly_rows,
    count(*) filter (where not legacy_auth_match)::bigint as public_only_or_non_auth_rows,
    count(*) filter (where eligible_mapping)::bigint as eligible_mapping_rows
  from row_assessment
),
duplicate_groups as (
  select count(*)::bigint as duplicate_legacy_user_id_groups
  from legacy_text_counts
  where occurrence_count > 1
)
select
  'identity-reconciliation-evidence-v1'::text as evidence_contract,
  a.total_public_users_rows,
  a.null_legacy_user_id_rows,
  a.malformed_legacy_uuid_text_rows,
  g.duplicate_legacy_user_id_groups,
  a.duplicate_legacy_user_id_rows,
  a.legacy_ids_unmatched_to_auth_rows,
  a.prospective_auth_user_id_conflict_rows,
  a.rows_already_carrying_auth_user_id,
  a.inconsistent_auth_user_id_rows,
  a.privileged_mapping_anomaly_rows,
  a.public_only_or_non_auth_rows,
  a.eligible_mapping_rows,
  case
    when a.null_legacy_user_id_rows = 0
      and a.malformed_legacy_uuid_text_rows = 0
      and g.duplicate_legacy_user_id_groups = 0
      and a.legacy_ids_unmatched_to_auth_rows = 0
      and a.prospective_auth_user_id_conflict_rows = 0
      and a.inconsistent_auth_user_id_rows = 0
      and a.privileged_mapping_anomaly_rows = 0
      and a.public_only_or_non_auth_rows = 0
      and a.eligible_mapping_rows = a.total_public_users_rows
    then 'GO'
    else 'NO_GO'
  end::text as future_backfill_decision
from aggregate_evidence a
cross join duplicate_groups g;

commit;
