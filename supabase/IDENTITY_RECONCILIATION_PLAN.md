# Phase 3: Identity Reconciliation Evidence

## Scope and safety boundary

Phase 3 produces privacy-safe aggregate evidence before any identity backfill. The evidence SQL is intentionally staged, is not in `migration-manifest.json`, starts a repeatable-read read-only transaction, and emits one aggregate row. It does not backfill `public.users.auth_user_id`, make that column `NOT NULL`, retire `public.users.user_id`, or change application authorization behavior.

The script must be run only by an authorized server-side operator against an explicitly approved target. It must never be exposed through a browser-readable route or normal application request. Phase 3 itself is tested only against the guarded disposable loopback database.

## Eligibility contract

A row is eligible for a future reviewed backfill only when all of these statements are true:

1. `user_id` is non-null canonical UUID text and can be safely cast to `uuid`.
2. The legacy value occurs exactly once in `public.users`.
3. The UUID exactly matches one `auth.users.id` (the Auth primary key makes the match unique).
4. No other public row already claims that UUID through `auth_user_id`.
5. An existing `auth_user_id`, if present, equals the legacy UUID and matches Auth.

Existing correctly mapped rows are eligible but would be idempotent no-ops in a future backfill. No Phase 3 file performs that write.

Privileged `Admin` and `Super Admin` rows have no exception path: every privileged row must meet the complete eligibility contract. A null, malformed, duplicate, unmatched, occupied, or conflicting identity is a privileged anomaly and blocks backfill.

## Explicit go/no-go contract

`GO` requires every public user row to be eligible and every anomaly count to be zero: null legacy identity, malformed UUID text, duplicate legacy identity groups, unmatched Auth identity, prospective canonical conflict, inconsistent existing canonical identity, privileged anomaly, and public-only/non-Auth row.

Any nonzero anomaly produces `NO_GO`. An exception policy is not implicit: separately approving a class of public-only rows would require a new reviewed contract and evidence version before a backfill migration can be authored. Aggregate evidence alone is not authorization to write data.

Before any later backfill, reviewers must also confirm the authoritative row primary key, approve a rollback/recovery plan, capture the evidence from a consistent snapshot, and verify that concurrent user creation is controlled. The later migration must re-check the eligibility contract immediately before writing and fail closed if evidence changed.

## Scale and operational preparation

The evidence uses set-based joins and aggregates, with no procedural row loop. It is an operator-only scan, never part of an application request. At up to 1,000,000 users, execute it on an approved read-only replica or in a maintenance window after reviewing `EXPLAIN (FORMAT JSON)` without `ANALYZE` on production.

Required index foundations are `auth.users(id)` (Auth primary key), the Phase 2 partial unique `public.users(auth_user_id) WHERE auth_user_id IS NOT NULL`, and—after duplicate evidence is clean—the staged partial unique legacy identity index. If legacy uniqueness is not yet provable, a separately reviewed concurrent non-unique `user_id` index may be needed before evidence collection. Phase 3 creates neither index.

A future write should use bounded, restartable set-based batches keyed by a stable public-users primary key, then re-run evidence between batches. The repository does not yet establish such an authoritative key, so a production backfill remains blocked. Constraint validation and any eventual `NOT NULL` transition must be separate reviewed phases to constrain lock duration.

## Future product requirement (not Phase 3)

After a blood request becomes `Fulfilled` or `Completed`, the verified requester/patient-side user may later submit exactly one overall 1–5 star rating for **“BloodConnectIndia Service Experience.”** This is a service-experience rating, not a donor, hospital, or blood-bank rating. Phase 3 introduces no rating table, policy, API, or UI.
