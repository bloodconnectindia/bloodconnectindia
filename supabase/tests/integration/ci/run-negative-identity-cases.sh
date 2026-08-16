#!/usr/bin/env bash
set -euo pipefail

[[ "${BCI_DATABASE_URL:-}" == postgresql://postgres:postgres@127.0.0.1:54322/postgres ]] || exit 65
for case_file in negative-duplicate.sql negative-unmatched.sql negative-privileged-null.sql; do
  if psql "$BCI_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file "supabase/tests/integration/ci/$case_file" >/dev/null 2>&1; then
    echo '{"phase":"identity-negative","status":"failed","reason":"expected-failure-did-not-occur"}' >&2
    exit 1
  fi
  psql "$BCI_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file supabase/tests/integration/ci/verify-negative-cleanup.sql >/dev/null
done
echo '{"phase":"identity-negative","status":"passed","cases":3}'
