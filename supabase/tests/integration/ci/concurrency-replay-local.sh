#!/usr/bin/env bash
set -euo pipefail

[[ "${BCI_DATABASE_URL:-}" == postgresql://postgres:postgres@127.0.0.1:54322/postgres ]] || exit 65
[[ "${BCI_DISPOSABLE_APPROVAL:-}" == approved ]] || exit 78
[[ -f supabase/tests/integration/ci/PHASE_DRIVER_APPROVED ]] || exit 78
for name in BCI_LOCAL_ANON_KEY BCI_TEST_ADMIN_EMAIL BCI_TEST_ADMIN_PASSWORD BCI_TEST_SECOND_ADMIN_EMAIL BCI_TEST_SECOND_ADMIN_PASSWORD; do
  [[ -n "${!name:-}" ]] || { printf '{"phase":"concurrency-replay","status":"failed","reason":"fixture-input-missing"}\n' >&2; exit 78; }
done

# timeout is duplicated here and in the parent phase so neither a fetch nor the
# complete driver can hang indefinitely. The test emits names/statuses only.
timeout 105s deno test --allow-env --allow-net=127.0.0.1:54321 \
  supabase/tests/integration/ci/concurrency-replay-local.test.ts
