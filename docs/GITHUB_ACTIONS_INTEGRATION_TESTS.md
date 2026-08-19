# Disposable integration workflow operator guide

The prepared workflow is `.github/workflows/disposable-integration-tests.yml`.
It is preparation only and must not be committed, pushed, or triggered without
separate approval. It contains no deployment job and must never be linked to a
remote Supabase project.

## Current readiness status

Database execution is intentionally blocked. The baseline adapter, local config,
and exact phase dispatcher are now prepared, but the safety guard still requires:

- `supabase/tests/integration/ci/PHASE_DRIVER_APPROVED`

The phase script exits with status 78 while this marker is absent. Do not create
it until every requirement in **Approval-marker review** below is accepted.

## Runner-local baseline and migration quarantine

`supabase/tests/integration/ci/disposable-baseline.sql` creates only the verified
minimum schema. Native local `auth.users` is not replaced. The four operational
tables whose columns have not been verified are empty relations used solely to
exercise migration policies. `blood_requests` contains only the five fields
evidenced by prepared server functions. This is not a production-schema export.

Before Compose startup, the driver hashes and moves the four controlled runnable
migrations into a run-specific directory under `RUNNER_TEMP`: authoritative
schema preflight (`202608110001`), canonical identity foundation (`202608110002`),
authorization and request controls (`202608120001`), and demo lifecycle
(`202608120004`). It verifies that
automatic migration discovery is empty, then starts the stack. Later phases use
the quarantined exact files explicitly. The always-run cleanup restores them and
verifies their original SHA-256 hashes. Any nonempty quarantine or checksum
mismatch fails closed.

Cleanup attempts every mandatory component and records failures in execution
order. The first nonzero status is the final exit status; later Compose,
restoration, validation, state-removal, and temporary-secret failures are still
reported but cannot replace that first failure. Failed partial Compose starts
retain `compose-start-attempted` until exact-project teardown succeeds.

## Approval-marker review

A human may authorize creation of `PHASE_DRIVER_APPROVED` only after reviewing:

1. The disposable baseline against an authoritative schema inventory.
2. Canonical `compose/source-manifest.json` integrity, exact vendored Git-blob
   hashes, helper hashes, and all six `tag@platform-digest` image pins.
3. Migration quarantine/restore behavior and exact migration hashes.
4. All loopback, environment, link-state, fixed-port, listener, and post-start
   Docker binding guards.
5. Negative identity rollback and concurrent-index predicate checks.
6. Authorization/demo assertions and their expected-denial isolation.
7. The prepared local Edge Function, bounded concurrency/replay, recovery, and
   isolated RLS cases. These require a reviewed disposable Auth fixture bootstrap.
8. `verified-operational-acl.sql` enforces the reviewed disposable target of
   exactly 57 expanded ACL entries and fails closed on every additional or
   missing entry. This is not a production/live-project ACL inventory.
9. A separate approval to execute database-backed CI and consume Actions minutes.

Creating the marker is an execution authorization decision, not a normal setup
step. It remains absent in this preparation.

## Future manual trigger

After readiness approval, open the repository's Actions page, select
**Disposable Supabase integration tests**, choose **Run workflow**, enter
`RUN_DISPOSABLE_LOCAL_INTEGRATION`, and enable the database-execution checkbox.
Any other confirmation skips the database job. The static safety job remains
manual because the workflow has only `workflow_dispatch`.

Before triggering, verify:

1. The repository is private or intentionally public.
2. No repository, environment, or organization secret is injected into this job.
3. In particular, no Supabase access token, project reference, database URL,
   database password, production secret, service key, or live-project variable
   is configured for the workflow.
4. No `.supabase/project-ref`, Supabase temporary project-ref, or environment
   file is committed.
5. The reviewed disposable baseline contains fake data only.
6. The action and CLI versions remain approved and pinned.
7. GitHub Actions minutes/budget are available and paid overage is not enabled
   unless separately approved.

Repository secrets are not automatically exposed to a job; do not add `secrets`
expressions, environment bindings, or environment-level credentials later.

## Safety model

- Runner: ephemeral `ubuntu-24.04`.
- Job permissions: read-only repository contents.
- Checkout credentials are not persisted.
- Concurrency group allows only one disposable integration run at a time.
- Job timeout is 35 minutes; static validation is limited to 10 minutes.
- Database URL is fixed to PostgreSQL on `127.0.0.1:54322`.
- The guard rejects remote hosts, remote-link files, common production variable
  names, missing approval, malformed run IDs, and missing readiness files.
- No platform authentication or remote linking command is permitted.
- No remote migration or deployment command is present.

## Controlled phases

Once separately approved for disposable database execution, the serialized
driver must:

1. Temporarily prevent automatic migration discovery before local stack startup.
2. Start only the required runner-local PostgreSQL, Kong/API gateway, Auth,
   Auth migration, PostgREST, Edge Runtime/local function serving, and Mailpit
   services. Studio, Meta, Realtime, Storage, imgproxy, Analytics, Vector, and
   Pooler are omitted. The only host publications are Kong on `127.0.0.1:54321`,
   PostgreSQL on `127.0.0.1:54322`, and Mailpit UI on `127.0.0.1:54324`.
3. Validate and install the approved disposable baseline.
4. Apply the authoritative schema preflight (`202608110001`) and fail closed on
   any incompatible live-aligned schema or identity assumption.
5. Prove duplicate, unmatched, and privileged-null identity failures on recreated
   disposable snapshots.
6. Load clean fake identities and rerun the staged identity preflight until clean.
7. Apply the canonical identity foundation (`202608110002`) through the
   `identity-foundation` phase and verify that it adds the nullable canonical
   identity objects without backfilling or rewriting user rows.
8. Run `identity-evidence` in a repeatable-read, read-only transaction, twice for
   repeatability, then run its aggregate-only disposable verification. This phase
   emits only counts and a `GO`/`NO_GO` decision; it performs no identity backfill
   and remains outside the runnable migration manifest.
9. Create the staged partial unique legacy identity index outside a transaction
   and verify it.
10. Apply authorization and request controls (`202608120001`), then run the
    authorization/RLS/ACL/audit tests.
11. Apply demo lifecycle (`202608120004`), then run the demo lifecycle tests.
12. Run local Edge Function, two-session concurrency/replay, and Mailpit recovery tests.

The phase driver must stop at the first failure and must never silently skip a
prerequisite.

## Results and log safety

The workflow writes only a GitHub job summary containing the run number, attempt,
local-target statement, and step pass/fail results. It does not upload artifacts
or environment dumps. Test drivers must redact authorization headers, cookies,
tokens, passwords, database credentials, recovery URLs containing tokens, and
secret-key material. Test names and sanitized row-count assertions are safe.

Review the step list in order. A skipped database job means confirmation was not
granted. Status 78 means a prepared phase is still intentionally blocked. Any
safety-guard failure must be investigated; do not bypass it.

## Runtime, cost, and teardown

Allow roughly 15-30 minutes after implementation, with a hard 35-minute job
limit. Initial container image pulls may be the largest variable. Standard
GitHub-hosted runners use included minutes according to repository/account plan;
usage beyond the allowance can cost money if billing is enabled.

The final step always attempts to stop the local Supabase stack without a backup
and removes remaining Supabase-labelled runner containers. GitHub then destroys
the ephemeral runner. No database dump, cache, or credential artifact is uploaded.
