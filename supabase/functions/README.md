# Edge Function contracts (local preparation)

Deploy none of these until database migration and dashboard configuration are approved.

Required server-only secrets: `SECURITY_HMAC_KEY`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORIGIN`. Do not place them in browser files.

| Function | Contract |
| --- | --- |
| `admin-login` | Validates lock state, authenticates with Supabase Auth, verifies active Admin via `public.users`, atomically records failures/warnings/one-hour locks, audits events, and returns a session only after authorization. |
| `admin-session-authorization` | Revalidates the bearer session with Supabase Auth and returns a normalized Admin identity only when the authoritative `public.users` row remains active Admin. It performs no role selection or mutation. |

## Disposable local runtime

The controlled integration phase derives its runtime configuration from the
already-running local Supabase CLI stack. `runtime-environment` accepts only
`http://127.0.0.1:54321` and the loopback PostgreSQL endpoint on port 54322,
then writes a run-scoped Edge Function environment file below `RUNNER_TEMP`.
That file contains the local service-role key, database URL, a fresh HMAC key,
and `APP_ORIGIN`; it is never committed, copied into browser code, or printed.
The runner removes it during cleanup. Browser tests receive only the local URL
and anonymous key, while service credentials remain confined to the phase
driver and Edge Function process.
| `admin-password-reset-request` | Always returns a generic response; server-side joins `auth.users` to active Admin records before requesting the reset email. Requires approved Site URL/redirect configuration. |
| `submit-blood-request` | Server-validates fields, CAPTCHA token when enabled, HMAC contact/request signals, duplicate/rate/abuse state, warnings, temporary blocks, audit events, then inserts the approved request. |
| `restore-blood-request-submission` | Requires active authenticated user with `blood_requests.restore_submission`; clears only the relevant temporary state and records actor/reason. |
| `reset-demo-data` | Undeployed preparation using `auth.users`, `public.users`, private demo membership markers, explicit `demo.reset` permission with deny precedence, fixed `blood_requests` scope, replay protection, transactional count checks, and private audit. Requires the clean demo migration and approved identity preflight before database testing. |
| `seed-demo-data` | Undeployed server-only preparation requiring active identity and `demo.seed`; creates matching Auth/public-user/membership markers and only batch-owned blood requests. Auth API work uses compensating deletion if the database transaction fails. No browser UI invokes it yet. |

The functions must use a server-only direct Postgres connection for private `security` tables. They must not expose those tables or privileged database functions through the Data API.
