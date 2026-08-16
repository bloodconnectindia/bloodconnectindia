#!/usr/bin/env bash
set -euo pipefail

state_dir="${RUNNER_TEMP:-}/bci-controlled-migrations-${BCI_TEST_RUN_ID:-invalid}"
if [[ -d "$state_dir/migrations" ]]; then
  mkdir -p supabase/migrations
  shopt -s nullglob
  restored=("$state_dir"/migrations/*.sql)
  for file in "${restored[@]}"; do mv -- "$file" supabase/migrations/; done
  (cd supabase/migrations && sha256sum --check "$state_dir/manifest.sha256") >/dev/null
  rmdir "$state_dir/migrations" 2>/dev/null || true
fi
rm -f -- "$state_dir/manifest.sha256" "$state_dir/stack-started"
rmdir "$state_dir" 2>/dev/null || true
