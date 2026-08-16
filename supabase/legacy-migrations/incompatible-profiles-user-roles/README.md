# Incompatible legacy migrations — never execute

These files are preserved as historical evidence and are intentionally outside
`supabase/migrations`. They must never be executed against the live-aligned
BloodConnectIndia project.

They implement a conflicting identity and authorization model:

1. `202608080001_foundation_auth_roles.sql` creates `public.profiles`,
   `public.user_roles`, legacy role helpers, and an Auth profile trigger.
2. `202608080002_demo_safety.sql` depends on stage 1 and creates a legacy
   profile-owned demo schema and duplicate demo markers.
3. `202608080003_admin_demo_reset.sql` depends on stages 1 and 2 and creates
   legacy Admin-role-based destructive reset functions.

The authoritative identity path is instead:

`auth.users.id::text -> public.users.user_id -> public.users.role/status`

The replacement controlled chain is:

1. Manually run and pass `staged-migrations/202608120002_users_identity_preflight.sql`.
2. Resolve duplicates or unmatched identities, then repeat the preflight.
3. Apply `staged-migrations/202608120003_users_identity_unique_index.sql` with
   a method compatible with `CREATE INDEX CONCURRENTLY`, then verify it.
4. Apply `migrations/202608120001_security_authorization_and_request_controls.sql`.
5. Verify its authorization schema, RLS, helpers, and grants.
6. Apply `migrations/202608120004_live_aligned_demo_lifecycle.sql`.
7. Verify its demo schema, RLS, ACLs, and private tables.
8. Complete database-backed tests before deploying any Edge Function.

## Preserved SHA-256 checksums

| File | SHA-256 |
| --- | --- |
| `202608080001_foundation_auth_roles.sql` | `5E006AC840214589C980F3DACB2925C1588307DB87EA1BD5828B3345B45650DF` |
| `202608080002_demo_safety.sql` | `13E92526604A4C375643DE95C6D5E922C7A0570BE648ACA0CAE8492CBA294942` |
| `202608080003_admin_demo_reset.sql` | `4F2727FD7FD9EB2BB1C85AF4771EA9B1360FD12A0972490F0B4C9EFEBB2C9069` |

Run `powershell -NoProfile -File supabase/scripts/validate-migration-runner.ps1`
after any migration-directory change.
