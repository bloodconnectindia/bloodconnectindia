# Common login and trusted role routing

The public homepage exposes one Login action. The common form accepts only email
and password and contains no role selector. Browser input, query parameters,
local storage, URL paths, and user-selected values are never role authority.

## Current secure routing boundary

The current authoritative authentication endpoint verifies only an active
`Admin` row matched to Supabase Auth. After that database check succeeds, it
returns a normalized `verified_identity` with role `Admin` and status `Active`.
The browser accepts only that exact verified result and routes it to the fixed
Admin dashboard path. Missing, inactive, unknown, or unsupported identities fail
closed and receive no privileged destination.

Intended future roles are `Admin`, `Hospital`, `Blood Bank`, `Central Monitor`,
`State Monitor`, and `District Monitor`. Hospital, blood-bank, and monitoring
routing must not be enabled until a separately reviewed server resolver can
return trusted active identity, role, permissions, and geography scope.

## Deferred account workflows

- Hospital self-registration remains: Pending Verification, Admin Approval, then
  Activation. It is not implemented by common login.
- Blood-bank self-registration remains: Pending Verification, Admin Approval,
  then Activation. It is not implemented by common login.
- Monitoring accounts never self-register. The Main Admin creates, approves, and
  activates them.
- There is exactly one Central Monitor nationwide, one State Monitor per state,
  and one District Monitor per district.
- Monitoring access is geography-scoped and primarily watch/read-only. These
  uniqueness and scope rules require server/database enforcement before routing.

## Deferred rating requirement

After a blood request becomes `Fulfilled` or `Completed`, the verified
requester/patient-side user may submit exactly one 1–5 star rating for
"BloodConnectIndia Service Experience." This is one overall service-experience
rating, not a donor, hospital, or blood-bank rating. No rating storage, API, or
UI is implemented by common login.
