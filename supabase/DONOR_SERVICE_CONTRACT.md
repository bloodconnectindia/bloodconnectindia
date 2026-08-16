# Future donor service contract

This document describes the future server-backed replacement for the current local fixture service. The browser must not receive a service-role key or write privileged donor state directly.

## Public registration

- Accept an allowlisted payload: full name, normalized Indian mobile, optional normalized email, valid blood group, and recorded consent.
- Enforce length/format rules again on the server, rate limits, abuse controls, and idempotency.
- Define canonical uniqueness for normalized mobile and, when supplied, email. Return a generic conflict response without exposing another donor's record.
- Create a pending donor only; public registration cannot approve, activate, or change authorization data.

## Admin read operations

- `donor.read` permits paginated, bounded list/search/filter/sort and single-record reads for active authorized staff.
- Responses expose only fields necessary for the Admin workflow. Contact data must not be broadly readable through public RLS.

## Admin mutation operations

- Separate permission-checked server operations are required for `donor.approve`, `donor.edit`, `donor.availability.update`, `donor.deactivate`, and `donor.delete` (or a narrower consistent permission convention).
- Explicit user deny overrides role or `system.full_access` grants.
- Validate fixed fields and state transitions server-side. Clients cannot choose tables, SQL, roles, or authorization scope.
- Prefer reversible deactivation over deletion. Any deletion needs elevated permission, confirmation/idempotency, relationship checks, and a defined retention policy.

## Audit and RLS requirements

- Audit actor, action, donor ID, reason/category, timestamp, old/new non-secret state, success/failure, request correlation ID, and replay key where relevant.
- Never audit passwords, tokens, service keys, or unnecessary contact details.
- RLS should allow public registration only through the controlled server endpoint. Public/anon roles receive no donor list or mutation access.
- Authenticated browser users receive no direct privileged INSERT/UPDATE/DELETE grants. Admin reads and all mutations must be constrained by active-user and explicit-permission checks.

## Integration tests required

- Duplicate mobile/email races and normalization variants.
- Inactive/non-Admin rejection and explicit-deny precedence.
- State-transition validation, audit success/failure, replay handling, and concurrent updates.
- RLS/ACL denial for anon and ordinary authenticated users, including direct REST/RPC attempts.
