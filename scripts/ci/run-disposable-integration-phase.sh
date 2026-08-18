#!/usr/bin/env bash
set -euo pipefail

readonly marker="supabase/tests/integration/ci/PHASE_DRIVER_APPROVED"
readonly db_url="${BCI_DATABASE_URL:-}"
readonly state_dir="${RUNNER_TEMP:-}/bci-controlled-migrations-${BCI_TEST_RUN_ID:-invalid}"
phase="${1:-}"

case "$phase" in
  start-local-stack|baseline|schema-preflight|identity-negative|identity-clean|identity-foundation|identity-evidence|identity-index|authorization-migration|authorization-verification|demo-migration|demo-verification|auth-fixtures|edge-functions|concurrency-replay|password-recovery) ;;
  *) echo '{"phase":"unknown","status":"failed","reason":"unknown-phase"}' >&2; exit 64 ;;
esac

result() { printf '{"phase":"%s","status":"%s"}\n' "$phase" "$1"; }
fail() { printf '{"phase":"%s","status":"failed","reason":"%s"}\n' "$phase" "$1" >&2; exit "${2:-78}"; }
[[ -f "$marker" ]] || fail "approval-marker-missing" 78
[[ "${BCI_DISPOSABLE_APPROVAL:-}" == approved ]] || fail "approval-variable-missing"
[[ "${BCI_DATABASE_HOST:-}" == 127.0.0.1 && "${BCI_DATABASE_PORT:-}" == 54322 && "${BCI_DATABASE_NAME:-}" == postgres ]] || fail "target-components-rejected"
[[ "${BCI_TEST_RUN_ID:-}" =~ ^bci-local-[0-9]+-[0-9]+$ ]] || fail "run-id-rejected"
[[ "$db_url" == postgresql://postgres:postgres@127.0.0.1:54322/postgres ]] || fail "database-url-rejected"
for forbidden in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL PRODUCTION_DATABASE_URL LIVE_PROJECT_REF SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY; do
  [[ -z "${!forbidden:-}" ]] || fail "forbidden-environment"
done
for linked in .supabase/project-ref supabase/.temp/project-ref; do [[ ! -s "$linked" ]] || fail "remote-link-state"; done

export PGOPTIONS="-c bci.test.disposable=approved -c bci.test.run_id=${BCI_TEST_RUN_ID}"
psql_file() { psql "$db_url" --no-psqlrc --set=ON_ERROR_STOP=1 --file "$1"; }
psql_atomic_file() { psql "$db_url" --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --file "$1"; }
require_file() { [[ -f "$1" ]] || fail "missing-prerequisite"; }
validate_migrations() { pwsh -NoProfile -File ./supabase/scripts/validate-migration-runner.ps1; }

cleanup_failed_identity_index() {
  if ! psql_file supabase/tests/integration/ci/cleanup-failed-identity-index.sql; then
    fail "identity-index-cleanup-refused" 79
  fi
  fail "identity-index-failed-retry-required" 79
}

case "$phase" in
  start-local-stack)
    require_file supabase/config.toml
    mkdir -p "$state_dir/migrations"
    [[ -z "$(find "$state_dir/migrations" -mindepth 1 -print -quit)" ]] || fail "quarantine-not-empty"
    validate_migrations
    (cd supabase/migrations && sha256sum -- *.sql) > "$state_dir/manifest.sha256"
    mv -- supabase/migrations/*.sql "$state_dir/migrations/"
    [[ -z "$(find supabase/migrations -name '*.sql' -print -quit)" ]] || fail "automatic-migration-discovery-not-empty"
    supabase start
    touch "$state_dir/stack-started"
    ;;
  baseline)
    [[ -f "$state_dir/stack-started" ]] || fail "stack-state-missing"
    psql_atomic_file supabase/tests/integration/ci/disposable-baseline.sql
    psql_file supabase/tests/integration/00_baseline_assertions.sql
    ;;
  schema-preflight)
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    ;;
  identity-negative)
    require_file supabase/tests/integration/ci/run-negative-identity-cases.sh
    bash supabase/tests/integration/ci/run-negative-identity-cases.sh
    ;;
  identity-clean)
    psql_atomic_file supabase/tests/integration/ci/auth-identity-adapter.sql
    psql_file supabase/staged-migrations/202608120002_users_identity_preflight.sql
    psql_file supabase/staged-migrations/202608120002_users_identity_preflight.sql
    ;;
  identity-foundation)
    psql_atomic_file "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_atomic_file "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_file supabase/tests/integration/ci/verify-canonical-identity-foundation.sql
    bash supabase/tests/integration/ci/run-canonical-identity-negative-cases.sh \
      "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    ;;
  identity-evidence)
    psql_file supabase/staged-migrations/202608170001_identity_reconciliation_evidence.sql
    psql_file supabase/staged-migrations/202608170001_identity_reconciliation_evidence.sql
    psql_file supabase/tests/integration/ci/verify-identity-reconciliation-evidence.sql
    ;;
  identity-index)
    require_file supabase/tests/integration/ci/cleanup-failed-identity-index.sql
    psql_file supabase/staged-migrations/202608120003_users_identity_unique_index.sql || cleanup_failed_identity_index
    psql_file supabase/tests/integration/ci/verify-identity-index.sql || cleanup_failed_identity_index
    ;;
  authorization-migration)
    psql_atomic_file "$state_dir/migrations/202608120001_security_authorization_and_request_controls.sql"
    ;;
  authorization-verification)
    psql_file supabase/tests/integration/03_post_security_verification.sql
    require_file supabase/tests/integration/ci/run-rls-acl-cases.sh
    bash supabase/tests/integration/ci/run-rls-acl-cases.sh authorization
    ;;
  demo-migration)
    psql_atomic_file "$state_dir/migrations/202608120004_live_aligned_demo_lifecycle.sql"
    ;;
  demo-verification)
    psql_file supabase/tests/integration/04_post_demo_verification.sql
    require_file supabase/tests/integration/ci/run-rls-acl-cases.sh
    bash supabase/tests/integration/ci/run-rls-acl-cases.sh demo
    ;;
  auth-fixtures)
    require_file supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts
    require_file supabase/tests/integration/ci/runtime-auth-fixture-security.sql
    [[ "${BCI_LOCAL_SUPABASE_URL:-}" == http://127.0.0.1:54321 ]] || fail "local-auth-url-rejected"
    [[ -n "${BCI_LOCAL_SERVICE_ROLE_KEY:-}" ]] || fail "local-auth-credential-missing"
    deno run --allow-env --allow-net=127.0.0.1:54321 --allow-read="${RUNNER_TEMP}" --allow-write="${RUNNER_TEMP}" \
      supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts
    psql_file supabase/tests/integration/ci/runtime-auth-fixture-security.sql
    ;;
  edge-functions)
    require_file supabase/tests/integration/ci/edge-functions-local.test.ts
    deno test --allow-env --allow-net=127.0.0.1:54321,127.0.0.1:54324 supabase/tests/integration/ci/edge-functions-local.test.ts
    ;;
  concurrency-replay)
    require_file supabase/tests/integration/ci/concurrency-replay-local.sh
    timeout 120s bash supabase/tests/integration/ci/concurrency-replay-local.sh
    ;;
  password-recovery)
    require_file supabase/tests/integration/ci/inbucket-recovery-local.test.ts
    deno test --allow-env --allow-net=127.0.0.1:54321,127.0.0.1:54324 supabase/tests/integration/ci/inbucket-recovery-local.test.ts
    ;;
esac
result passed
