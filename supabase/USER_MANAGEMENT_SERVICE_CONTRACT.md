# Future user-management service contract

The current Users interface is read-only fixture presentation. Browser clients must never directly update `public.users.role` or `public.users.status`, insert/delete privileged user rows, or call authorization-management RPCs. All account, role, status, and permission changes require separately approved server-side operations.

## Identity and read operations

- The canonical mapping remains `auth.users.id` to the unique, non-ambiguous `public.users.user_id` identity reference. Fail closed on null, missing, duplicate, or ambiguous mappings.
- `user.read` allows active authorized staff to use bounded pagination, allowlisted filters/sorts, and stable-ID detail lookup. Return only necessary identity, contact, role, status, and safe permission-summary fields.
- Never return credential hashes, passwords, recovery/session tokens, service credentials, or authentication secrets.

## Profile, status, and role operations

- Permitted profile updates use an allowlist and cannot include identity mapping, role, status, or authorization data.
- Activation/deactivation requires a dedicated permission, expected version, reason category, and audit event. Self-deactivation by an operational Admin must fail unless a separately approved recovery-safe policy exists.
- Operational role assignment requires a stronger dedicated permission. A normal Admin cannot assign Super Admin, promote itself, manage authorization mappings, or change security configuration.
- Super Admin assignment and removal require a future narrowly scoped design with independent authorization, anti-self-elevation rules, last-Super-Admin protection, reauthentication where appropriate, idempotency, and full audit.
- Effective authorization evaluates explicit user deny before user/role/system grants. Role, status, and permissions remain distinct concepts.

## Account access assistance

- Password reset assistance uses the separately approved recovery flow and generic responses. It never reveals account existence or handles credentials in Admin UI code.
- Account-management services cannot bypass the secure login backend's active-status and Admin-eligibility checks.

## Concurrency, RLS, and audit

- Mutations require an expected version or equivalent optimistic concurrency control. Stale changes fail without partial updates; replay keys return the original safe outcome.
- Audit actor, action, target user, reason category, old/new non-secret state, permission decision, version, result, timestamp, correlation ID, and failure category.
- RLS and ACLs deny direct browser writes to protected identity, role, status, and authorization structures. Service operations enforce the same active-user, permission, deny-precedence, and self-protection rules.

## Required integration tests

- Null/duplicate/ambiguous identity mapping rejection and uniqueness races.
- Explicit-deny precedence, inactive-user rejection, and ordinary Admin attempts to assign Super Admin.
- Self-promotion, self-deactivation, last-Super-Admin, stale-version, replay, and concurrent role/status changes.
- Audit success/failure consistency and transaction rollback.
- Direct REST/RPC attempts as anon, ordinary authenticated, and normal Admin users.
