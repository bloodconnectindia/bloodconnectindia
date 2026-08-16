# Controlled migration runbook

No command in this document is authorization to access a database. Every stage
requires separate approval, review, backup/rollback planning, and an identified
target environment. Never run `supabase db push` until the target migration
history and runnable manifest have been verified.

## Required order

1. Verify migration history before making changes. Confirm whether any archived
   legacy version was ever recorded as applied. Do not repair migration history
   automatically.
2. Confirm the three incompatible migrations remain quarantined outside
   `supabase/migrations`, and run the local migration validation guard.
3. Manually run `staged-migrations/202608120002_users_identity_preflight.sql`.
4. Resolve every duplicate non-null or unmatched `public.users.user_id` through
   a separately reviewed data plan. Review reported null identifiers.
5. Re-run the preflight until it passes cleanly.
6. Apply `staged-migrations/202608120003_users_identity_unique_index.sql` using
   a method that does not wrap `CREATE INDEX CONCURRENTLY` in a transaction.
7. Verify `users_user_id_unique_nonnull_idx` exists, is valid and unique, and
   has the predicate `user_id is not null`.
8. Apply `migrations/202608120001_security_authorization_and_request_controls.sql`.
9. Verify private authorization tables, helper `search_path`, explicit-deny
   behavior, RLS, policies, function ACLs, and table grants.
10. Apply `migrations/202608120004_live_aligned_demo_lifecycle.sql`.
11. Verify the live-aligned demo schema, `demo.read` RLS, private table ACLs,
    protected identities, replay state, and the fixed `blood_requests` marker.
12. Run database-backed authorization, concurrency, rollback, reset, audit,
    RLS, ACL, and destructive-count tests with disposable identities.
13. Deploy Edge Functions only after all required database-backed tests pass.

## Approved runnable manifest

The only SQL files allowed under `supabase/migrations` are, in order:

1. `202608120001_security_authorization_and_request_controls.sql`
2. `202608120004_live_aligned_demo_lifecycle.sql`

The staged identity scripts are deliberate manual prerequisites even though
their numeric names fall between those runnable migrations. Do not move them
into the automatic runner without a separately reviewed ordering strategy.

## Local guard

Run:

```powershell
powershell -NoProfile -File supabase/scripts/validate-migration-runner.ps1
```

The guard checks the exact runnable manifest, denies the three legacy filenames,
rejects runnable references to `public.profiles` or `public.user_roles`, and
verifies the archived SQL checksums.
