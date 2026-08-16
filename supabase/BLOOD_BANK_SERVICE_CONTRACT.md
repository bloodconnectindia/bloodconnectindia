# Future blood-bank service contract

The current Blood Banks interface is fixture-only. It does not establish regulatory approval or licensing fields and performs no backend writes.

## Registration and read operations

- Public or staff-assisted registration accepts only allowlisted identity, contact, and location fields through a controlled server endpoint. New facilities begin in a pending state.
- `blood_bank.read` permits active authorized staff to use bounded pagination, search, allowlisted filters/sorts, and stable-ID detail reads.
- Normalize names, mobile numbers, emails, and addresses server-side. Enforce approved uniqueness rules and return generic duplicate responses that do not expose another facility's protected data.

## Administrative lifecycle

- Separate permission-checked operations are required for approval, edits, activation/deactivation, and decommissioning. Explicit user deny overrides role grants and `system.full_access`.
- Suggested permissions are `blood_bank.approve`, `blood_bank.update`, and `blood_bank.decommission`, with a separate read permission.
- Decommissioning is preferred to destructive deletion. Physical deletion requires stronger permission, retention approval, confirmation/idempotency, and proof that stock, requests, and audit relationships are safely handled.
- Browser clients cannot provide table names, SQL, authorization fields, or arbitrary relationship targets.

## Stock and request relationships

- Stock records reference a stable blood-bank identifier, not a mutable display name. Stock adjustments remain governed by the separate stock service and permissions.
- Request assignment validates an active bank and uses a transaction or consistency-safe workflow. Facility status changes must prevent new assignments where appropriate without corrupting historical relationships.
- Summary counts are server-derived and must not be accepted from the browser.

## Concurrency, RLS, and audit

- Updates use version checks or equivalent optimistic concurrency. Duplicate idempotency keys return the original safe result; stale versions return a generic conflict with no partial change.
- Audit actor, action, facility ID, reason category, old/new non-secret state, version, result, timestamp, correlation ID, and failure category.
- Anon and ordinary authenticated browser roles receive no privileged blood-bank INSERT/UPDATE/DELETE grants or management RPC access. RLS and ACLs enforce the same permission model as server operations.

## Required integration tests

- Duplicate registration races and normalization variants.
- Approval/status transition validation, explicit-deny precedence, and inactive-user rejection.
- Concurrent edits, stale versions, idempotency replay, and transaction rollback.
- Decommissioning with active stock/reservations/requests and retained historical relationships.
- Direct REST/RPC attempts as anon and ordinary authenticated users.
