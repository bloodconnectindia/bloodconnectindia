# Future hospital service contract

The current Hospitals interface is fixture-only. It does not establish licensing, accreditation, medical specialty, or regulatory status and performs no backend writes.

## Registration and reads

- Registration accepts allowlisted facility identity, contact, and location data through a controlled server endpoint. New hospitals begin pending.
- Normalize name, mobile, email, and address server-side. Apply approved uniqueness rules and generic duplicate responses without exposing another hospital's protected data.
- `hospital.read` permits active authorized staff to use bounded pagination, allowlisted search/filter/sort, and stable-ID detail reads.

## Administrative lifecycle

- Approval, edits, activation/deactivation, and decommissioning require separate server-side permission checks. Explicit user deny overrides role grants and `system.full_access`.
- Suggested permissions: `hospital.read`, `hospital.approve`, `hospital.update`, and `hospital.decommission`.
- Prefer decommissioning to destructive deletion. Physical deletion requires stronger permission, retention approval, idempotent confirmation, and safe handling of request and audit history.
- Browser clients cannot submit SQL, table names, roles, authorization changes, or arbitrary relationship scope.

## Blood-request relationship

- Requests reference an immutable hospital ID through a foreign key, never a mutable hospital display name. Server-derived summaries must not be accepted from the browser.
- Assignment and management validate hospital status, request state, permissions, and concurrency inside a transactional workflow. Status changes must preserve historical requests while preventing inappropriate new work.

## Concurrency, RLS, and audit

- Updates use an expected version or equivalent optimistic concurrency check. Stale writes return a generic conflict and make no partial change; duplicate idempotency keys return the original safe outcome.
- Audit actor, action, hospital ID, reason category, old/new non-secret state, version, result, timestamp, correlation ID, and failure category.
- Anon and ordinary authenticated roles receive no privileged hospital INSERT/UPDATE/DELETE or management RPC access. RLS and ACLs enforce active-user and explicit-permission requirements.

## Required integration tests

- Duplicate registration races and normalization variants.
- Approval and status transitions, explicit-deny precedence, and inactive-user rejection.
- Concurrent edits, stale versions, idempotency replay, and rollback.
- Decommissioning with active and historical linked requests.
- Direct REST/RPC attempts as anon and ordinary authenticated users.
