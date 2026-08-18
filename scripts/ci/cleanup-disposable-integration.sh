#!/usr/bin/env bash
set -euo pipefail

readonly runner_temp="${RUNNER_TEMP:-}"
readonly run_id="${BCI_TEST_RUN_ID:-}"
[[ -n "$runner_temp" && "$run_id" =~ ^bci-local-[0-9]+-[0-9]+$ ]] || {
  echo '{"phase":"cleanup","status":"failed","reason":"cleanup-scope-rejected"}' >&2
  exit 78
}
readonly state_dir="$runner_temp/bci-controlled-migrations-$run_id"
readonly edge_pid_file="$runner_temp/bci-edge-functions-$run_id.pid"
runtime_cleanup_status=0

if [[ -f "$edge_pid_file" ]]; then
  edge_pid="$(tr -d '\r\n' < "$edge_pid_file")"
  if [[ ! "$edge_pid" =~ ^[0-9]+$ ]]; then
    echo '{"phase":"cleanup","status":"failed","reason":"edge-runtime-pid-invalid"}' >&2
    runtime_cleanup_status=79
  elif kill -0 "$edge_pid" 2>/dev/null && ! kill "$edge_pid"; then
    echo '{"phase":"cleanup","status":"failed","reason":"edge-runtime-stop-failed"}' >&2
    runtime_cleanup_status=79
  fi
fi

if [[ -d "$state_dir/migrations" ]]; then
  mkdir -p supabase/migrations
  shopt -s nullglob
  restored=("$state_dir"/migrations/*.sql)
  for file in "${restored[@]}"; do
    destination="supabase/migrations/$(basename "$file")"
    [[ ! -e "$destination" ]] || {
      echo '{"phase":"cleanup","status":"failed","reason":"migration-restore-collision"}' >&2
      exit 79
    }
  done
  for file in "${restored[@]}"; do
    destination="supabase/migrations/$(basename "$file")"
    mv -- "$file" "$destination"
  done
  [[ -z "$(find "$state_dir/migrations" -mindepth 1 -print -quit)" ]] || {
    echo '{"phase":"cleanup","status":"failed","reason":"migration-quarantine-not-empty"}' >&2
    exit 79
  }
  [[ -f "$state_dir/manifest.sha256" ]] || {
    echo '{"phase":"cleanup","status":"failed","reason":"restoration-checksum-manifest-missing"}' >&2
    exit 79
  }
  (cd supabase/migrations && sha256sum --check "$state_dir/manifest.sha256") >/dev/null
  rmdir "$state_dir/migrations"
fi

pwsh -NoProfile -File ./supabase/scripts/validate-migration-runner.ps1

rm -f -- \
  "$runner_temp/bci-auth-fixtures-$run_id.json" \
  "$runner_temp/bci-supabase-status-$run_id.env" \
  "$runner_temp/bci-runtime-env-$run_id.env" \
  "$runner_temp/bci-process-env-$run_id.env" \
  "$runner_temp/bci-edge-functions-$run_id.log" \
  "$edge_pid_file"
rm -f -- "$state_dir/manifest.sha256" "$state_dir/stack-started" "$state_dir/runtime-prepared"
if [[ -d "$state_dir" ]]; then
  [[ -z "$(find "$state_dir" -mindepth 1 -print -quit)" ]] || {
    echo '{"phase":"cleanup","status":"failed","reason":"cleanup-state-not-empty"}' >&2
    exit 79
  }
  rmdir "$state_dir"
fi

if (( runtime_cleanup_status != 0 )); then
  exit "$runtime_cleanup_status"
fi

echo '{"phase":"cleanup","status":"passed","restoration":"verified"}'
