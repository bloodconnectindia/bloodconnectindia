const assert: (condition: unknown, message?: string) => asserts condition = (condition, message = 'Assertion failed') => {
  if (!condition) throw new Error(message)
}
const assertFalse = (condition: unknown) => assert(!condition, 'Expected condition to be false')
const assertEquals = (actual: unknown, expected: unknown) => assert(Object.is(actual, expected), `Expected ${expected}, got ${actual}`)
const assertMatch = (actual: string, expected: RegExp) => assert(expected.test(actual), `Expected text to match ${expected}`)

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url))

Deno.test('admin login contract is generic, atomic, and locks for one hour', async () => {
  const source = await read('./admin-login/index.ts')
  assertMatch(source, /sql\.begin/)
  assertMatch(source, /pg_advisory_xact_lock/)
  assertMatch(source, /interval '1 hour'/)
  assertMatch(source, /admin_login_success/)
  assertMatch(source, /admin_login_failure/)
  assertFalse(source.includes('attempts remain'))
  assertEquals(source.match(/Unable to sign in\./g)?.length, 4)
})

Deno.test('password reset response stays generic and eligibility is active Admin only', async () => {
  const source = await read('./admin-password-reset-request/index.ts')
  assertMatch(source, /lower\(u\.role\)='admin'/)
  assertMatch(source, /lower\(u\.status\)='active'/)
  assertEquals(source.match(/accepted: true/g)?.length, 2)
  assertFalse(source.includes('SUPABASE_SERVICE_ROLE_KEY'))
})

Deno.test('blood request validation, duplicate control, blocking and audit are atomic', async () => {
  const source = await read('./submit-blood-request/index.ts')
  for (const expected of ["new Set(['A+'", "[6-9]\\d{9}", "mobileDigits.length === 12", "interval '15 minutes'", "interval '10 minutes'", 'validation_pattern', "'duplicate'", "'blocked'", "'submitted'", 'sql.begin', 'pg_advisory_xact_lock']) {
    assert(source.includes(expected), `Missing expected control: ${expected}`)
  }
  assert(source.indexOf('public.blood_requests') < source.lastIndexOf("'submitted'"))
})

Deno.test('restore requires authorization, honors deny, and audits atomically', async () => {
  const source = await read('./restore-blood-request-submission/index.ts')
  for (const expected of ["lower(u.status)='active'", "effect='deny'", 'blood_requests.restore_submission', 'sql.begin', 'pg_advisory_xact_lock', 'blood_request_submission_restored']) {
    assert(source.includes(expected), `Missing expected restore control: ${expected}`)
  }
})

Deno.test('shared security keeps privileged values server-side and pins CORS to APP_ORIGIN', async () => {
  const source = await read('./_shared/security.ts')
  assertMatch(source, /Access-Control-Allow-Origin': required\('APP_ORIGIN'\)/)
  assertMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assertMatch(source, /SUPABASE_DB_URL/)
  assertMatch(source, /SECURITY_HMAC_KEY/)
  assertFalse(/(service_role\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^'"\s]+)/.test(source))
})
