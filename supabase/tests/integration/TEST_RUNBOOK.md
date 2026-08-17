# BloodConnectIndia isolated integration test runbook

## Authority boundary

### SAFE LOCAL PREPARATION

Reading, reviewing, linting, hashing, and statically validating files in this
directory is safe local preparation. It does not authorize a database client,
network connection, SQL execution, migration application, Edge Function
deployment, or use of secrets.

### DATABASE EXECUTION REQUIRING SEPARATE APPROVAL

Every command that connects to PostgreSQL/Supabase or executes any SQL requires
new explicit approval naming the disposable target. Do not infer approval from
this runbook. Never target the live project. Never use production credentials.

## Environment acceptance gate

Before execution is requested, record and review:

1. A newly created disposable local/isolated Supabase-compatible PostgreSQL target.
2. Its hostname, database name, and project reference, proving none matches live.
3. A disposable credential stored outside source control.
4. A snapshot/recreation procedure and maximum test lifetime.
5. The verified baseline schema containing `auth.users`, `public.users`, donors,
   blood requests, stock, blood banks, and hospitals.
6. The migration guard output and a clean working copy of archived checksums.

Set these only inside the approved database session:

```sql
set bci.test.disposable = 'approved';
set bci.test.run_id = 'bci-local-<unique-lowercase-run-id>';
```

Every harness SQL file includes `_disposable_guard.sql` and refuses to continue
without both settings. The guard supplements—not replaces—human target review.

## Exact controlled order

The GitHub driver first quarantines runnable migration files under its ephemeral
`RUNNER_TEMP` before local stack startup, then restores and checksum-verifies
them in the always-run cleanup. This prevents startup discovery from bypassing
the manual identity stages.

1. Run the local, read-only migration runner guard. Confirm exactly these four
   controlled migrations are runnable, in this order:
   `202608110001` authoritative schema preflight, `202608110002` canonical
   identity foundation, `202608120001` authorization and request controls, and
   `202608120004` live-aligned demo lifecycle. The exact filenames appear below
   at their controlled execution points.
2. Connect only after separate approval and set the disposable session guard.
3. Execute `00_baseline_assertions.sql`.
4. Apply `202608110001_authoritative_schema_preflight.sql` and stop if any
   authoritative schema or identity assumption fails.
5. In a disposable snapshot, prepare each dirty case from
   `02_identity_negative_cases.sql`, then run the staged identity preflight and
   prove duplicate and unmatched identities abort. Confirm null identities are
   reported. Roll back/recreate after every case.
6. Load `01_identity_fixtures.sql`. If verified baseline constraints require
   additional non-identity fields, stop and prepare a reviewed adapter; do not
   weaken constraints.
7. Run `staged-migrations/202608120002_users_identity_preflight.sql` manually.
   Resolve every duplicate/unmatched identity and review all null identities.
8. Repeat the preflight until clean.
9. Apply `202608110002_canonical_identity_foundation.sql` through the
   `identity-foundation` phase. Verify the nullable `auth_user_id` foundation,
   constraints, and partial unique index were created without changing identity
   values or backfilling any row.
10. Run the `identity-evidence` phase only after the same disposable-target and
    database-execution approvals required for every SQL phase. It executes
    `staged-migrations/202608170001_identity_reconciliation_evidence.sql` in a
    repeatable-read, read-only transaction, repeats it to prove stable read-only
    execution, and runs the aggregate-only disposable verification. The phase
    emits only counts and a `GO`/`NO_GO` decision. It does not insert, update,
    delete, rewrite, or backfill identity data and is intentionally excluded from
    `migration-manifest.json`.
11. Apply `staged-migrations/202608120003_users_identity_unique_index.sql` using
   a client path that does not wrap `CREATE INDEX CONCURRENTLY` in a transaction.
12. Verify the index is unique, valid, and partial on `user_id is not null`.
13. Apply `202608120001_security_authorization_and_request_controls.sql` only.
14. Execute `03_post_security_verification.sql` and the applicable sections of
    `05_rls_acl_matrix.sql` in isolated transactions.
15. Apply `202608120004_live_aligned_demo_lifecycle.sql` only.
16. Execute `04_post_demo_verification.sql`, the remaining RLS/ACL matrix, and
    the cases in `06_failure_concurrency_cases.md`.
17. Run approved Edge Functions locally against this disposable target for
    login, request, restore, demo seed/reset, compensation, audit, and replay tests.
18. Destroy the disposable environment and verify credentials/test artifacts
    were not written to the repository.

Never use `supabase db push` for this sequence. The concurrent index is a manual
prerequisite and the numeric filenames do not represent automatic execution order.

## Identity matrix

| Identity | Role/status | Expected behavior |
|---|---|---|
| Ordinary active | User / Active | No system-wide read or protected write |
| Inactive | User / Inactive | Permission helpers return false; session actions rejected |
| Admin | Admin / Active | Temporary operational grants only; no sensitive authorization management |
| Future Super Admin | Super Admin / Active | `system.full_access` satisfies permissions, subject to explicit deny |
| Explicitly denied | Admin / Active plus deny | Deny overrides role and system grant |
| Demo-only | User / Active plus matching markers | Eligible only for fixed-scope demo lifecycle operations |
| Malformed demo | User / Active with mismatched metadata | Never deleted/reset; fails closed |
| Duplicate mapping | Duplicate non-null `user_id` | Preflight fails; unique index cannot be accepted |
| Null mapping | Null `user_id` | Reported; privileged null mapping blocks demo migration |
| Unmatched mapping | No matching `auth.users` UUID | Preflight and demo prerequisites fail |

## Authorization and audit matrix

Test inactive rejection, exact permission keys, explicit allow, explicit deny,
deny precedence over role and `system.full_access`, override expiry, normal Admin
rejection for sensitive permissions, and Super Admin full-access behavior. For
each server operation verify an audit row records actor, action, target, reason,
timestamp, correlation/request ID, result, and non-secret failure category.
Passwords, tokens, keys, DB URLs, and HMAC material must never appear in audit.

## RLS and ACL matrix

| Principal | Public operational reads | Public writes | `public.users` role/status writes | Security/demo-private tables |
|---|---|---|---|---|
| anon | Only separately approved public path | Denied except controlled server flow | Denied | Denied |
| ordinary authenticated | Own/approved scope only | Denied | Denied | Denied |
| Admin | Permission-policy reads | Temporary operational policy only | Denied | Direct table access denied |
| Super Admin test | Permission-policy reads | Only approved service behavior | Direct browser write denied | Direct table access denied |

Test both policy results and catalog privileges (`has_table_privilege`, function
EXECUTE ACLs, schema usage, policy commands/roles). A helper returning true must
not imply a direct table grant.

## Demo seed/reset matrix

- Seed one bounded batch with matching fake Auth metadata, one public.users row,
  one private membership, and fixed-scope blood-request records.
- Reuse the seed request ID and require idempotent original-result/conflict behavior.
- Inject failure after each step and verify compensation/rollback leaves no
  ambiguous identity.
- Reset one batch and all eligible batches; verify only matched demo records.
- Refuse real/non-demo, Admin, Super Admin, current actor, protected identity,
  unmatched mapping, inconsistent metadata, wrong membership, and wrong batch.
- Verify public.users role/status and authorization mappings never change.
- Verify success/failure audit and replay state without secret or password data.

## Concurrency method

Use two independent approved sessions coordinated by barriers/advisory locks in
the test driver. Cover duplicate request submission, seed replay, same-batch
reset, stock-like transactional conflicts where applicable, and permission
version races. Assert exactly one committed owner/result and no partial rows.

## Teardown evidence

Capture test names, pass/fail counts, schema versions, non-secret row counts,
and migration hashes. Then destroy the disposable database/project and revoke
its disposable credentials. Do not retain Auth tokens or database dumps unless
separately approved and securely handled.
