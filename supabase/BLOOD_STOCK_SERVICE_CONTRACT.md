# Future blood-stock service contract

The current Admin stock page is fixture-only. Its Adequate, Low, and Critical thresholds are UI demonstration values, not clinical or operational policy. Production thresholds require explicit approval and controlled configuration.

## Read operations

- `stock.read` permits active authorized staff to list bounded stock records and read one record by stable ID.
- Filtering and sorting use an allowlist; the browser cannot provide SQL, table names, or arbitrary projection.
- Responses include a server-derived status, available units, reserved units, version, facility, and last-update timestamp.

## Adjustments and reservations

- Separate permission-checked server operations are required for additions, reductions, corrections, reservations, and releases.
- Every operation accepts a stable stock ID, positive bounded unit quantity, reason category, idempotency key, and expected version. It never accepts arbitrary table or column names.
- Available and reserved quantities cannot become negative. Reservations, releases, and adjustments update inventory and audit records in one database transaction.
- Corrections require a stronger permission than routine movement and record the old count, new count, and reason.

## Concurrency and conflicts

- Use optimistic concurrency through a version number or equivalent compare-and-swap condition, plus row locking inside the transaction where necessary.
- A stale version returns a generic conflict response and makes no partial change. Duplicate idempotency keys return the original safe result.
- Concurrent reservations must never allocate more than the available units.

## Authorization, RLS, and audit

- Explicit user deny overrides role grants and `system.full_access`. Suggested permissions: `stock.read`, `stock.adjust`, `stock.reserve`, and `stock.correct`.
- Browser roles receive no direct privileged stock INSERT/UPDATE/DELETE or management RPC access. Operations pass through a narrowly scoped server service.
- Audit actor, action, stock ID, facility, bounded unit delta, reason category, version, result, timestamp, correlation ID, and failure category. Do not log secrets or unrelated personal information.
- RLS and ACL tests must prove anon, inactive, ordinary authenticated, and explicitly denied users cannot read or mutate protected inventory.

## Required integration tests

- Transaction rollback and audit consistency.
- Concurrent reserve/release/adjustment conflicts and over-allocation prevention.
- Duplicate idempotency handling and stale-version rejection.
- Quantity bounds, invalid transitions, inactive-user rejection, and explicit-deny precedence.
- Direct REST/RPC attempts under anon and ordinary authenticated roles.
