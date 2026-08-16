# Failure, rollback, concurrency, and replay cases

These cases require a separately approved disposable database and, where noted,
two independent sessions. They are specifications, not executable authorization.

| Case | Injection | Required assertion |
|---|---|---|
| Migration failure | Remove/rename required partial index in a disposable snapshot | Demo migration aborts before creating lifecycle objects |
| Permission denial | Active Admin with explicit deny invokes protected action | No target change; generic denial; failure audit category |
| Duplicate request | Reuse blood-request hash/idempotency key | One accepted result; no duplicate operational row |
| Seed failure | Fail after Auth creation but before membership completion | Compensation deletes only newly created fake Auth identity; no partial batch/user/membership |
| Reset failure | Fail after batch enters resetting state | Transactional DB deletions roll back; batch becomes safely retryable/failed per approved design |
| Identity mismatch | Auth metadata, membership ID, batch ID, or public.users mapping disagrees | Reset refuses deletion and preserves Auth/public records |
| Partial cleanup failure | Simulate Auth deletion failure after DB planning | Protected/mismatched identity remains; audit contains non-secret failure category |
| Concurrent seed | Two sessions reuse the same request ID | One operation owns replay row; second returns original/conflict safely |
| Concurrent reset | Two sessions reset one batch | At most one transitions started to completed; no double deletion |
| Concurrent permission update | Stale expected version | Stale operation fails without overwriting newer authorization state |
| Protected identity | Target Admin, Super Admin, current actor, or protected table entry | Fail closed before destructive work |

For every failure, compare row counts and audit/replay state before and after.
Never use a real email, phone, Auth UUID, batch ID, or production secret.
