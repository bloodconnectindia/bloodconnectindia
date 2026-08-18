#!/usr/bin/env bash
set -euo pipefail

[[ "${BCI_DATABASE_URL:-}" == postgresql://postgres:postgres@127.0.0.1:54322/postgres ]] || exit 65
scope="${1:-}"
case "$scope" in authorization|demo) ;; *) exit 64 ;; esac

# Assertions that are safe to evaluate as the database owner. Browser-role
# denial cases require the verified live operational grant baseline. It is not
# currently known, so this phase fails closed instead of inventing grants.
acl_adapter="supabase/tests/integration/ci/verified-operational-acl.sql"
rls_cases="supabase/tests/integration/ci/rls-acl-local.sql"
for required in "$acl_adapter" "$rls_cases"; do
  if [[ ! -f "$required" ]]; then
    echo "{\"phase\":\"${scope}-verification\",\"status\":\"failed\",\"reason\":\"verified-acl-fixture-missing\"}" >&2
    exit 78
  fi
done
psql "$BCI_DATABASE_URL" --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --file "$acl_adapter" >/dev/null
if [[ "$scope" == authorization ]]; then
  :
else
  :
fi
is_demo=false
[[ "$scope" == demo ]] && is_demo=true
psql "$BCI_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --set="bci_scope=$scope" --set="bci_is_demo=$is_demo" --file "$rls_cases" >/dev/null
echo "{\"phase\":\"${scope}-verification\",\"status\":\"passed\",\"evidence\":\"acl-and-policy-assertions\"}"
