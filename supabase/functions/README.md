# Edge Function contracts (local preparation)

Deploy none of these until database migration and dashboard configuration are approved.

Required server-only secrets: `SECURITY_HMAC_KEY`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORIGIN`. Do not place them in browser files.

| Function | Contract |
| --- | --- |
| `admin-login` | Validates lock state, authenticates with Supabase Auth, verifies active Admin via `public.users`, atomically records failures/warnings/one-hour locks, audits events, and returns a session only after authorization. |
| `admin-session-authorization` | Revalidates the bearer session with Supabase Auth and returns a normalized Admin identity only when the authoritative `public.users` row remains active Admin. It performs no role selection or mutation. |
| `admin-password-reset-request` | Always returns a generic response; server-side joins `auth.users` to active Admin records before requesting the reset email. Requires approved Site URL/redirect configuration. |
| `submit-blood-request` | Server-validates fields, CAPTCHA token when enabled, HMAC contact/request signals, duplicate/rate/abuse state, warnings, temporary blocks, audit events, then inserts the approved request. |
| `restore-blood-request-submission` | Requires active authenticated user with `blood_requests.restore_submission`; clears only the relevant temporary state and records actor/reason. |
| `reset-demo-data` | Undeployed preparation using `auth.users`, `public.users`, private demo membership markers, explicit `demo.reset` permission with deny precedence, fixed `blood_requests` scope, replay protection, transactional count checks, and private audit. Requires the clean demo migration and approved identity preflight before database testing. |
| `seed-demo-data` | Undeployed server-only preparation requiring active identity and `demo.seed`; creates matching Auth/public-user/membership markers and only batch-owned blood requests. Auth API work uses compensating deletion if the database transaction fails. No browser UI invokes it yet. |

The functions must use a server-only direct Postgres connection for private `security` tables. They must not expose those tables or privileged database functions through the Data API.
