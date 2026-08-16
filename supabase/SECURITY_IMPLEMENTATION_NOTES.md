# Security implementation notes

`202608120001_security_authorization_and_request_controls.sql` is local preparation only. It has not been applied.

Do **not** run `supabase db push`. The incompatible `profiles` / `user_roles` chain is quarantined unchanged under `legacy-migrations/incompatible-profiles-user-roles/`: `202608080001_foundation_auth_roles.sql`, `202608080002_demo_safety.sql`, and `202608080003_admin_demo_reset.sql`. Stages 2 and 3 depend on stage 1. The local migration guard must pass after every migration-directory change.

Live facts: `public.users.user_id` is nullable text, lacks a unique constraint and foreign key, but the current active Admin maps to `auth.users.id::text`. The staged scripts in `supabase/staged-migrations/` are intentionally outside the migration runner: stage 1 fails closed on duplicate/non-auth non-null identifiers and reports null identifiers; stage 2 adds only a partial unique index. Do not make `user_id` NOT NULL or change it to UUID without a separately approved data migration.

The live role helper has `set search_path = ''`; the local security migration preserves that for both SECURITY DEFINER helpers. Referenced objects are schema-qualified. `password_hash` has no local application reference and is not a Supabase Auth password; do not read, synchronize, or remove it until separately reviewed.

Live operational tables currently have broad table grants, with RLS as the effective browser control. After Edge Functions are deployed, the target least-privilege plan is: anon receives no grants on `users`, donors, stock, banks, or hospitals; authenticated receives SELECT only where a future RLS policy requires it and no authorization-field writes; `blood_requests` receives no anon INSERT because the server endpoint inserts it. Revoke/GRANT changes require a separate tested live migration because they can affect existing clients.

Before applying any local migration, complete Deno type checks and tests for all Edge Functions. Dashboard changes still required later: disable automatic Data API table exposure; set production Auth Site URL and redirect URLs; configure SMTP, CAPTCHA if selected, and Edge Function secrets.

`202608120004_live_aligned_demo_lifecycle.sql` is a separate, unapplied demo-lifecycle preparation. It uses `auth.users.id::text -> public.users.user_id`; it does not use `profiles` or `user_roles`. Only `public.blood_requests` is presently included in its fixed operational demo scope because no other local operational table has a verified demo marker. Do not apply it before the staged identity preflight and partial unique index are separately approved and tested. The three `20260808...` migrations remain conflicting legacy evidence and must stay excluded from execution.

`seed-demo-data` is undeployed preparation. It adds no browser mutation path and seeds only non-privileged Active identities plus batch-owned `blood_requests`. Auth creation cannot share the Postgres transaction, so database failure triggers compensating hard deletion of Auth identities; cleanup failure is privately audited and remains a database-backed test/recovery blocker.
