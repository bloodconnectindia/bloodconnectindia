# Demo seeding preparation — undeployed

This design is local preparation only. It must not be deployed or used until the
live-aligned migrations and database-backed tests have been separately approved.

## Server-only flow

An authenticated request reaches `seed-demo-data`. The function requires one
active `public.users` identity and explicit `demo.seed` permission; an active
deny override wins over role mappings and `system.full_access`.

The request accepts a controlled label, reason, idempotency UUID, at most 10
demo-user email/role definitions, and at most 50 validated blood requests. It
does not accept passwords, Auth IDs, status, table names, SQL, or demo markers.

The fixed sequence is:

1. Claim the idempotency UUID inside a Postgres transaction.
2. Insert one `demo_batches` row.
3. Generate one independent membership UUID and strong temporary password per
   requested demo identity.
4. Create the Auth identity with server-owned `is_demo`, `demo_batch_id`, and
   `demo_membership_id` app metadata.
5. Insert exactly one non-privileged, Active `public.users` row without writing
   `password_hash`.
6. Insert exactly one private `demo_user_memberships` row.
7. Insert only validated `blood_requests` carrying the server-generated batch ID.
8. Complete replay state and write a private audit event.

Generated passwords are not returned or logged. This preparation creates
non-interactive demo identities; a future requirement for interactive demo
credentials needs a separately reviewed credential-delivery design.

## Transaction boundary and compensation

Supabase Auth administration is an external API and cannot participate in the
direct Postgres transaction. Database failures roll back batch, public-user,
membership, blood-request, replay, and success-audit changes. The function then
hard-deletes every Auth identity it created during that request in reverse order.

If Auth compensation fails, the function records a private categorized failure
without passwords, tokens, keys, or database URLs. Such an orphan retains all
three demo metadata markers but has no committed membership/public-user row, so
the reset workflow fails closed rather than treating it as a valid deletable
identity. Operational recovery requires a separately approved reconciliation
tool and audit review.

## Fixed scope

Only `public.blood_requests` is seeded because it is the only operational table
with a prepared `demo_batch_id` marker. Donors, hospitals, stock, and blood banks
are explicitly out of scope.
