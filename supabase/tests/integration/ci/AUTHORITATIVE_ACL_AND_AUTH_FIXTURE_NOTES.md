# Authoritative ACL and disposable Auth fixture notes

## Live helper alignment (read-only inventory, 2026-08-14)

`security.current_user_has_role(required_role text)` exists live, is owned by
`postgres`, is `SECURITY DEFINER`, has `search_path=""`, and grants `EXECUTE`
only to `postgres` and `authenticated`, without grant option. The prepared
authorization migration recreates the same signature and security properties,
revokes public execution, then restores authenticated execution.

`security.current_user_has_permission(text)` is absent live. The prepared
authorization migration introduces it as a separate `SECURITY DEFINER`, stable,
empty-search-path helper, revokes public execution, and grants execution only to
authenticated (plus the owner's inherent/default local access). It does not
change the role helper's authorization condition or add `profiles` or
`user_roles` dependencies.

## Runner-local Auth creation

Credentialed runtime identities are separate from the deterministic database
identity fixtures used by migration/preflight tests. The runtime bootstrap uses
only the supported local GoTrue Admin HTTP endpoint and runner-local PostgREST;
it never inserts directly into `auth.users` and never assumes the production
Auth schema. Auth supplies each UUID. Only fake `@bci.invalid` identities are
accepted by the static contract.

The local service-role value and generated passwords exist only in future
runner environment state. The bootstrap appends test credentials to the
ephemeral `GITHUB_ENV` file without writing them to stdout. Its manifest contains
only fake UUIDs, labels, fake emails, expected role/status, and test categories.
The manifest must reside under `RUNNER_TEMP` with mode `0600`.

The driver phase remains blocked by `PHASE_DRIVER_APPROVED`, the exact loopback
URL, a valid disposable run ID, and the separately prepared handoff of the
runner-local service-role value. No production/local key is embedded here.

## Cleanup

Bootstrap failure compensates already-created fixtures through loopback-only
PostgREST and Auth Admin DELETE requests. The explicit cleanup mode reads only
the run-specific safe manifest under `RUNNER_TEMP`. Final ephemeral stack
destruction remains authoritative and requires no live-project cleanup path.
