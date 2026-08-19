#!/usr/bin/env bash
set -euo pipefail

readonly marker="supabase/tests/integration/ci/PHASE_DRIVER_APPROVED"
readonly db_url="${BCI_DATABASE_URL:-}"
readonly state_dir="${RUNNER_TEMP:-}/bci-controlled-migrations-${BCI_TEST_RUN_ID:-invalid}"
readonly deno_bin="${BCI_DENO_BIN:-deno}"
readonly psql_bin="${BCI_PSQL_BIN:-psql}"
readonly sha256sum_bin="${BCI_SHA256SUM_BIN:-sha256sum}"
readonly docker_bin="${BCI_DOCKER_BIN:-docker}"
readonly network_id="bloodconnectindia-disposable-loopback"
readonly compose_file="compose/compose.loopback.yaml"
phase="${1:-}"

result() { printf '{"phase":"%s","status":"%s"}\n' "$phase" "$1"; }
fail() { printf '{"phase":"%s","status":"failed","reason":"%s"}\n' "$phase" "$1" >&2; exit "${2:-78}"; }
[[ -f "$marker" ]] || fail "approval-marker-missing" 78
read -r driver_hash _ < <("$sha256sum_bin" -- "$0") || fail "driver-hash-unavailable" 78
[[ "$driver_hash" =~ ^[0-9a-fA-F]{64}$ ]] || fail "driver-hash-invalid" 78
[[ "$(<"$marker")" == "driver-sha256:${driver_hash,,}" ]] || fail "approval-marker-stale" 78
"$deno_bin" run --allow-read=. scripts/ci/verify-compose-source.ts >/dev/null || \
  fail "source-manifest-integrity-failed" 78

case "$phase" in
  start-local-stack|runtime-environment|baseline|schema-preflight|identity-negative|identity-clean|identity-foundation|identity-evidence|identity-index|authorization-migration|authorization-verification|demo-migration|demo-verification|auth-fixtures|edge-functions|concurrency-replay|password-recovery) ;;
  *) echo '{"phase":"unknown","status":"failed","reason":"unknown-phase"}' >&2; exit 64 ;;
esac

[[ "${BCI_DISPOSABLE_APPROVAL:-}" == approved ]] || fail "approval-variable-missing"
[[ "${BCI_DATABASE_HOST:-}" == 127.0.0.1 && "${BCI_DATABASE_PORT:-}" == 54322 && "${BCI_DATABASE_NAME:-}" == postgres ]] || fail "target-components-rejected"
[[ "${BCI_TEST_RUN_ID:-}" =~ ^bci-local-[0-9]+-[0-9]+$ ]] || fail "run-id-rejected"
if [[ "$phase" != start-local-stack ]]; then
  [[ "$db_url" =~ ^postgresql://postgres:[A-Za-z0-9_-]{43}@127\.0\.0\.1:54322/postgres$ ]] || fail "database-url-rejected"
fi
[[ -z "${NONLOOP_LISTENERS:-}" ]] || fail "nonloop-listeners-detected"
for forbidden in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL PRODUCTION_DATABASE_URL LIVE_PROJECT_REF SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY; do
  [[ -z "${!forbidden:-}" ]] || fail "forbidden-environment"
done
for linked in .supabase/project-ref supabase/.temp/project-ref; do [[ ! -s "$linked" ]] || fail "remote-link-state"; done

export PGOPTIONS="-c bci.test.disposable=approved -c bci.test.run_id=${BCI_TEST_RUN_ID}"
psql_file() { "$psql_bin" "$db_url" --no-psqlrc --set=ON_ERROR_STOP=1 --file "$1"; }
psql_atomic_file() { "$psql_bin" "$db_url" --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --file "$1"; }
require_file() { [[ -f "$1" ]] || fail "missing-prerequisite"; }
validate_migrations() { pwsh -NoProfile -File ./supabase/scripts/validate-migration-runner.ps1; }
require_trusted_stack() { [[ -f "$state_dir/stack-started" ]] || fail "stack-state-missing"; }

compose() {
  "$docker_bin" compose --project-name bloodconnectindia-disposable-ci \
    --file "$compose_file" "$@"
}

verify_project_and_bindings() {
  local container_id project service host_bindings network_ports networks
  local -a compose_ids label_ids
  local -A seen=()
  mapfile -t compose_ids < <(compose ps --all --quiet | sort) || fail "post-start-project-inspection"
  mapfile -t label_ids < <("$docker_bin" ps --all --quiet \
    --filter label=com.docker.compose.project=bloodconnectindia-disposable-ci | sort) || \
    fail "post-start-project-inspection"
  [[ ${#compose_ids[@]} == 7 && "${compose_ids[*]}" == "${label_ids[*]}" ]] || \
    fail "post-start-project-inspection"
  for container_id in "${compose_ids[@]}"; do
    project="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id")" || \
      fail "post-start-project-inspection"
    service="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id")" || \
      fail "post-start-project-inspection"
    [[ "$project" == bloodconnectindia-disposable-ci ]] || fail "post-start-project-inspection"
    case "$service" in
      postgres|kong|auth|auth-migration|rest|edge-runtime|mailpit) ;;
      *) fail "post-start-project-inspection" ;;
    esac
    [[ -z "${seen[$service]:-}" ]] || fail "post-start-project-inspection"
    seen[$service]=1
    host_bindings="$("$docker_bin" inspect --format '{{json .HostConfig.PortBindings}}' "$container_id")" || \
      fail "post-start-binding-inspection"
    network_ports="$("$docker_bin" inspect --format '{{json .NetworkSettings.Ports}}' "$container_id")" || \
      fail "post-start-binding-inspection"
    networks="$("$docker_bin" inspect --format '{{json .NetworkSettings.Networks}}' "$container_id")" || \
      fail "post-start-network-inspection"
    "$deno_bin" run scripts/ci/verify-docker-bindings.ts \
      "$service" "$host_bindings" "$network_ports" "$networks" || \
      fail "post-start-binding-inspection"
  done
  [[ ${#seen[@]} == 7 ]] || fail "post-start-project-inspection"
}

verify_required_readiness() {
  local service container_id state
  for service in postgres auth rest edge-runtime mailpit kong auth-migration; do
    container_id="$(compose ps --all --quiet "$service")" || fail "post-start-readiness-inspection"
    [[ -n "$container_id" ]] || fail "post-start-readiness-inspection"
    state="$("$docker_bin" inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.ExitCode}}' "$container_id")" || \
      fail "post-start-readiness-inspection"
    case "$service:$state" in
      postgres:running\|healthy\|0|auth:running\|healthy\|0|rest:running\|none\|0|rest:running\|healthy\|0|edge-runtime:running\|none\|0|edge-runtime:running\|healthy\|0|mailpit:running\|none\|0|mailpit:running\|healthy\|0|kong:running\|none\|0|kong:running\|healthy\|0|auth-migration:exited\|none\|0) ;;
      *) fail "post-start-readiness-inspection" ;;
    esac
  done
}

cleanup_failed_identity_index() {
  if ! psql_file supabase/tests/integration/ci/cleanup-failed-identity-index.sql; then
    fail "identity-index-cleanup-refused" 79
  fi
  fail "identity-index-failed-retry-required" 79
}

case "$phase" in
  start-local-stack)
    require_file supabase/config.toml
    require_file "$compose_file"
    network_binding="$("$docker_bin" network inspect "$network_id" \
      --format '{{ index .Options "com.docker.network.bridge.host_binding_ipv4" }}' 2>/dev/null)" || \
      fail "disposable-network-missing"
    [[ "$network_binding" == 127.0.0.1 ]] || fail "disposable-network-binding-rejected"
    mkdir -p "$state_dir/migrations"
    [[ -z "$(find "$state_dir/migrations" -mindepth 1 -print -quit)" ]] || fail "quarantine-not-empty"
    validate_migrations
    (cd supabase/migrations && "$sha256sum_bin" -- *.sql) > "$state_dir/manifest.sha256"
    mv -- supabase/migrations/*.sql "$state_dir/migrations/"
    [[ -z "$(find supabase/migrations -name '*.sql' -print -quit)" ]] || fail "automatic-migration-discovery-not-empty"
    [[ "$("$docker_bin" compose version --short)" =~ ^v?2\. ]] || fail "docker-compose-v2-required"
    "$deno_bin" run \
      --allow-env=RUNNER_TEMP,GITHUB_ENV,BCI_TEST_RUN_ID,BCI_RUNNER_TEMP_NATIVE,BCI_GITHUB_ENV_NATIVE \
      --allow-read=.,"${RUNNER_TEMP}" --allow-write="${RUNNER_TEMP}","${GITHUB_ENV}" \
      scripts/ci/prepare-compose-runtime.ts || fail "runtime-secret-preparation-failed"
    runtime_dir="$(sed -n 's/^BCI_RUNTIME_DIR=//p' "${GITHUB_ENV}" | tail -n 1)"
    [[ "$runtime_dir" == "${RUNNER_TEMP}/bci-compose-${BCI_TEST_RUN_ID}" ]] || fail "runtime-directory-rejected"
    export BCI_RUNTIME_DIR="$runtime_dir"
    touch "$state_dir/compose-start-attempted"
    compose up --detach --wait || fail "compose-start-failed"
    verify_project_and_bindings
    [[ -z "${NONLOOP_LISTENERS:-}" ]] || fail "nonloop-listeners-detected"
    verify_required_readiness
    touch "$state_dir/stack-started"
    ;;
  runtime-environment)
    require_trusted_stack
    readonly runtime_dir="${RUNNER_TEMP}/bci-compose-${BCI_TEST_RUN_ID}"
    [[ -f "$runtime_dir/stack.env" && -f "$runtime_dir/kong.yml" && -f "$runtime_dir/pgsodium_root.key" ]] || \
      fail "runtime-temp-state-missing"
    touch "$state_dir/runtime-prepared"
    ;;
  baseline)
    require_trusted_stack
    psql_atomic_file supabase/tests/integration/ci/disposable-baseline.sql
    psql_file supabase/tests/integration/00_baseline_assertions.sql
    ;;
  schema-preflight)
    require_trusted_stack
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    ;;
  identity-negative)
    require_trusted_stack
    require_file supabase/tests/integration/ci/run-negative-identity-cases.sh
    bash supabase/tests/integration/ci/run-negative-identity-cases.sh
    ;;
  identity-clean)
    require_trusted_stack
    psql_atomic_file supabase/tests/integration/ci/auth-identity-adapter.sql
    psql_file supabase/staged-migrations/202608120002_users_identity_preflight.sql
    psql_file supabase/staged-migrations/202608120002_users_identity_preflight.sql
    ;;
  identity-foundation)
    require_trusted_stack
    psql_atomic_file "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_atomic_file "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_file supabase/tests/integration/ci/verify-canonical-identity-foundation.sql
    bash supabase/tests/integration/ci/run-canonical-identity-negative-cases.sh \
      "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"
    psql_file "$state_dir/migrations/202608110001_authoritative_schema_preflight.sql"
    ;;
  identity-evidence)
    require_trusted_stack
    psql_file supabase/staged-migrations/202608170001_identity_reconciliation_evidence.sql
    psql_file supabase/staged-migrations/202608170001_identity_reconciliation_evidence.sql
    psql_file supabase/tests/integration/ci/verify-identity-reconciliation-evidence.sql
    ;;
  identity-index)
    require_trusted_stack
    require_file supabase/tests/integration/ci/cleanup-failed-identity-index.sql
    psql_file supabase/staged-migrations/202608120003_users_identity_unique_index.sql || cleanup_failed_identity_index
    psql_file supabase/tests/integration/ci/verify-identity-index.sql || cleanup_failed_identity_index
    ;;
  authorization-migration)
    require_trusted_stack
    psql_atomic_file "$state_dir/migrations/202608120001_security_authorization_and_request_controls.sql"
    ;;
  authorization-verification)
    require_trusted_stack
    psql_file supabase/tests/integration/03_post_security_verification.sql
    require_file supabase/tests/integration/ci/run-rls-acl-cases.sh
    bash supabase/tests/integration/ci/run-rls-acl-cases.sh authorization
    ;;
  demo-migration)
    require_trusted_stack
    psql_atomic_file "$state_dir/migrations/202608120004_live_aligned_demo_lifecycle.sql"
    ;;
  demo-verification)
    require_trusted_stack
    psql_file supabase/tests/integration/04_post_demo_verification.sql
    require_file supabase/tests/integration/ci/run-rls-acl-cases.sh
    bash supabase/tests/integration/ci/run-rls-acl-cases.sh demo
    ;;
  auth-fixtures)
    require_trusted_stack
    [[ -f "$state_dir/runtime-prepared" ]] || fail "runtime-state-missing"
    require_file supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts
    require_file supabase/tests/integration/ci/runtime-auth-fixture-security.sql
    [[ "${BCI_LOCAL_SUPABASE_URL:-}" == http://127.0.0.1:54321 ]] || fail "local-auth-url-rejected"
    [[ -n "${BCI_LOCAL_SERVICE_ROLE_KEY:-}" ]] || fail "local-auth-credential-missing"
    "$deno_bin" run --allow-env --allow-net=127.0.0.1:54321 --allow-read="${RUNNER_TEMP}" --allow-write="${RUNNER_TEMP}" \
      supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts
    psql_file supabase/tests/integration/ci/runtime-auth-fixture-security.sql
    ;;
  edge-functions)
    require_trusted_stack
    [[ -f "$state_dir/runtime-prepared" ]] || fail "runtime-state-missing"
    require_file supabase/tests/integration/ci/edge-functions-local.test.ts
    "$deno_bin" test --allow-env --allow-net=127.0.0.1:54321,127.0.0.1:54324 supabase/tests/integration/ci/edge-functions-local.test.ts
    ;;
  concurrency-replay)
    require_trusted_stack
    require_file supabase/tests/integration/ci/concurrency-replay-local.sh
    timeout 120s bash supabase/tests/integration/ci/concurrency-replay-local.sh
    ;;
  password-recovery)
    require_trusted_stack
    require_file supabase/tests/integration/ci/inbucket-recovery-local.test.ts
    "$deno_bin" test --allow-env --allow-net=127.0.0.1:54321,127.0.0.1:54324 supabase/tests/integration/ci/inbucket-recovery-local.test.ts
    ;;
esac
result passed
