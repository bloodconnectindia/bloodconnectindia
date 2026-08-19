#!/usr/bin/env bash
set -uo pipefail

readonly runner_temp="${RUNNER_TEMP:-}"
readonly run_id="${BCI_TEST_RUN_ID:-}"
[[ -n "$runner_temp" && "$run_id" =~ ^bci-local-[0-9]+-[0-9]+$ ]] || {
  echo '{"phase":"cleanup","status":"failed","reason":"cleanup-scope-rejected"}' >&2
  exit 78
}
readonly state_dir="$runner_temp/bci-controlled-migrations-$run_id"
readonly edge_pid_file="$runner_temp/bci-edge-functions-$run_id.pid"
readonly runtime_dir="$runner_temp/bci-compose-$run_id"
readonly docker_bin="${BCI_DOCKER_BIN:-docker}"
readonly sha256sum_bin="${BCI_SHA256SUM_BIN:-sha256sum}"
first_failure=0
secrets_cleaned=0

record_failure() {
  local status="$1" reason="$2"
  (( status != 0 )) || status=79
  echo "{\"phase\":\"cleanup\",\"status\":\"failed\",\"reason\":\"$reason\",\"exitCode\":$status}" >&2
  if (( first_failure == 0 )); then
    first_failure="$status"
  fi
}

cleanup_runtime_materials() {
  local status=0 next_status=0
  rm -f -- \
    "$runner_temp/bci-auth-fixtures-$run_id.json" \
    "$runner_temp/bci-supabase-status-$run_id.env" \
    "$runner_temp/bci-runtime-env-$run_id.env" \
    "$runner_temp/bci-process-env-$run_id.env" \
    "$runner_temp/bci-edge-functions-$run_id.env" \
    "$runner_temp/bci-edge-functions-$run_id.log" \
    "$edge_pid_file" || status=$?
  if [[ -d "$runtime_dir" ]]; then
    rm -f -- \
      "$runtime_dir/stack.env" \
      "$runtime_dir/kong.yml" \
      "$runtime_dir/pgsodium_root.key" || {
      next_status=$?
      (( status != 0 )) || status="$next_status"
    }
    rmdir "$runtime_dir" || {
      next_status=$?
      (( status != 0 )) || status="$next_status"
    }
  fi
  return "$status"
}

emergency_secret_cleanup() {
  local entry_status=$? secret_status=0
  trap - EXIT
  if (( secrets_cleaned == 0 )); then
    cleanup_runtime_materials || secret_status=$?
    if (( secret_status != 0 )); then
      echo "{\"phase\":\"cleanup\",\"status\":\"failed\",\"reason\":\"temporary-secret-cleanup-failed\",\"exitCode\":$secret_status}" >&2
    fi
    if (( entry_status == 0 && secret_status != 0 )); then
      entry_status="$secret_status"
    fi
  fi
  exit "$entry_status"
}
trap emergency_secret_cleanup EXIT

compose() {
  "$docker_bin" compose --project-name bloodconnectindia-disposable-ci \
    --file compose/compose.loopback.yaml "$@"
}

verify_compose_cleanup_scope() {
  local compose_output label_output container_id project service
  local -a compose_ids label_ids
  compose_output="$(compose ps --all --quiet)" || return $?
  label_output="$("$docker_bin" ps --all --quiet \
    --filter label=com.docker.compose.project=bloodconnectindia-disposable-ci)" || return $?
  mapfile -t compose_ids < <(printf '%s\n' "$compose_output" | sed '/^$/d' | sort)
  mapfile -t label_ids < <(printf '%s\n' "$label_output" | sed '/^$/d' | sort)
  [[ "${compose_ids[*]}" == "${label_ids[*]}" ]] || return 78
  for container_id in "${compose_ids[@]}"; do
    project="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id")" || return $?
    service="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id")" || return $?
    [[ "$project" == bloodconnectindia-disposable-ci ]] || return 78
    case "$service" in
      postgres|kong|auth|auth-migration|rest|edge-runtime|mailpit) ;;
      *) return 78 ;;
    esac
  done
}

# `compose-start-attempted` is separate from trusted readiness so partial starts
# are always torn down without authorizing any database-backed phase.
compose_cleanup_ok=1
if [[ -f "$state_dir/compose-start-attempted" ]]; then
  scope_status=0
  verify_compose_cleanup_scope || scope_status=$?
  if (( scope_status != 0 )); then
    record_failure "$scope_status" "compose-cleanup-scope-verification-failed"
    compose_cleanup_ok=0
  else
    compose_down_status=0
    compose down --volumes --remove-orphans || compose_down_status=$?
    if (( compose_down_status != 0 )); then
      record_failure "$compose_down_status" "compose-cleanup-failed"
      compose_cleanup_ok=0
    fi
  fi
fi

if [[ -f "$edge_pid_file" ]]; then
  edge_pid="$(tr -d '\r\n' < "$edge_pid_file")"
  if [[ ! "$edge_pid" =~ ^[0-9]+$ ]]; then
    record_failure 79 "edge-runtime-pid-invalid"
  elif kill -0 "$edge_pid" 2>/dev/null && ! kill "$edge_pid"; then
    record_failure 79 "edge-runtime-stop-failed"
  fi
fi

restoration_ok=1
if [[ -d "$state_dir/migrations" ]]; then
  mkdir -p supabase/migrations || {
    record_failure "$?" "migration-restore-directory-failed"
    restoration_ok=0
  }
  shopt -s nullglob
  restored=("$state_dir"/migrations/*.sql)
  collision=0
  for file in "${restored[@]}"; do
    destination="supabase/migrations/$(basename "$file")"
    if [[ -e "$destination" ]]; then
      record_failure 79 "migration-restore-collision"
      collision=1
      restoration_ok=0
    fi
  done
  if (( collision == 0 )); then
    for file in "${restored[@]}"; do
      destination="supabase/migrations/$(basename "$file")"
      move_status=0
      mv -- "$file" "$destination" || move_status=$?
      if (( move_status != 0 )); then
        record_failure "$move_status" "migration-restore-move-failed"
        restoration_ok=0
      fi
    done
  fi
  if [[ -n "$(find "$state_dir/migrations" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    record_failure 79 "migration-quarantine-not-empty"
    restoration_ok=0
  fi
  if [[ ! -f "$state_dir/manifest.sha256" ]]; then
    record_failure 79 "restoration-checksum-manifest-missing"
    restoration_ok=0
  else
    checksum_status=0
    (cd supabase/migrations && "$sha256sum_bin" --check "$state_dir/manifest.sha256") >/dev/null || checksum_status=$?
    if (( checksum_status != 0 )); then
      record_failure "$checksum_status" "restoration-checksum-failed"
      restoration_ok=0
    fi
  fi
  if (( restoration_ok == 1 )); then
    quarantine_remove_status=0
    rmdir "$state_dir/migrations" || quarantine_remove_status=$?
    if (( quarantine_remove_status != 0 )); then
      record_failure "$quarantine_remove_status" "migration-quarantine-remove-failed"
      restoration_ok=0
    fi
  fi
fi

validation_status=0
pwsh -NoProfile -File ./supabase/scripts/validate-migration-runner.ps1 || validation_status=$?
if (( validation_status != 0 )); then
  record_failure "$validation_status" "migration-manifest-validation-failed"
  restoration_ok=0
fi

rm -f -- "$state_dir/stack-started" "$state_dir/runtime-prepared" || \
  record_failure "$?" "cleanup-marker-removal-failed"
if (( compose_cleanup_ok == 1 )); then
  rm -f -- "$state_dir/compose-start-attempted" || \
    record_failure "$?" "cleanup-attempt-marker-removal-failed"
fi
if (( restoration_ok == 1 )); then
  rm -f -- "$state_dir/manifest.sha256" || record_failure "$?" "cleanup-manifest-removal-failed"
fi
if [[ -d "$state_dir" ]]; then
  if [[ -n "$(find "$state_dir" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    record_failure 79 "cleanup-state-not-empty"
  else
    state_remove_status=0
    rmdir "$state_dir" || state_remove_status=$?
    if (( state_remove_status != 0 )); then
      record_failure "$state_remove_status" "cleanup-state-remove-failed"
    fi
  fi
fi

secret_status=0
cleanup_runtime_materials || secret_status=$?
secrets_cleaned=1
if (( secret_status != 0 )); then
  record_failure "$secret_status" "temporary-secret-cleanup-failed"
fi

if (( first_failure != 0 )); then
  exit "$first_failure"
fi
echo '{"phase":"cleanup","status":"passed","restoration":"verified"}'
