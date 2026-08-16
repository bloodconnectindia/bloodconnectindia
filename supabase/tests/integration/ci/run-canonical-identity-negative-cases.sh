#!/usr/bin/env bash
set -euo pipefail

readonly db_url="${BCI_DATABASE_URL:-}"
readonly migration="${1:-}"

[[ "${BCI_DISPOSABLE_APPROVAL:-}" == approved ]] || exit 78
[[ "${BCI_DATABASE_HOST:-}" == 127.0.0.1 && "${BCI_DATABASE_PORT:-}" == 54322 && "${BCI_DATABASE_NAME:-}" == postgres ]] || exit 78
[[ "$db_url" == postgresql://postgres:postgres@127.0.0.1:54322/postgres ]] || exit 78
[[ -f "$migration" ]] || exit 78

expect_rejected() {
  local setup_sql="$1"
  local result
  set +e
  result="$({ printf '%s\n' 'begin;' "$setup_sql"; printf '\\ir %s\n' "$migration"; } | psql "$db_url" --no-psqlrc --set=ON_ERROR_STOP=1 2>&1)"
  local status=$?
  set -e
  [[ $status -ne 0 ]] || return 1
  [[ "$result" == *"Canonical identity foundation failed:"* ]] || return 1
}

expect_rejected 'alter table public.users add constraint alternate_cascade_identity_fk foreign key (auth_user_id) references auth.users(id) on delete cascade;'
expect_rejected 'create table public.identity_negative_target(id uuid primary key); alter table public.users add constraint alternate_incompatible_identity_fk foreign key (auth_user_id) references public.identity_negative_target(id) on delete restrict;'
expect_rejected 'alter table public.users add constraint alternate_identity_check check (auth_user_id is null or user_id is null);'
expect_rejected 'create unique index alternate_full_identity_unique on public.users(auth_user_id);'
expect_rejected 'create index alternate_identity_expression on public.users((auth_user_id::text)) where auth_user_id is not null;'
expect_rejected 'create unique index alternate_identity_predicate on public.users(auth_user_id) where auth_user_id is null;'
