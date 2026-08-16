# Future Admin blood-request service contract

The current Admin interface uses `BloodConnectAdminFixtures` only. This document
defines the boundary a future server-backed implementation must satisfy. It is
not authorization to deploy or access a database.

## List and read

The read service should return paginated, permission-filtered request summaries
and exact request details. Supported filters are search, blood group, status,
created-date range, sort order, and page. The server must validate every filter,
cap page size, and use stable ordering. Browser access must require an active
identity with a dedicated read permission; it must not expose private abuse
signals, subject hashes, or privileged audit metadata.

## Status update

Status transitions must use a server endpoint, not direct browser table writes.
The endpoint should require a dedicated operational permission, validate the
current and requested status against an explicit transition graph, lock the row,
reject stale versions, require a bounded reason for terminal states, and audit
actor, request, old status, new status, reason, and timestamp transactionally.

Suggested states: New, Under Review, Approved, Assigned, Fulfilled, Rejected,
and Cancelled. Their exact database representation requires schema review.

## Assignment and fulfillment

Assignment requires a narrowly scoped server endpoint that validates the blood
bank/hospital target from server-readable records, prevents arbitrary IDs or
table selection, handles reassignment conflicts, and writes an immutable audit
event. Fulfillment should require proof fields and use an idempotency key.

## Restore/unblock relationship

`restore-blood-request-submission` restores a temporarily blocked submission
subject; it does not restore a rejected/cancelled request or change request
status. A future Admin UI should expose unblock only from a separate abuse-state
workflow to authorized users with `blood_requests.restore_submission`. Request
status and submission blocking must remain distinct concepts and audit trails.
