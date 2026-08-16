import { auth, hash, options, reply, sql } from '../_shared/security.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options()
  if (request.method !== 'POST') return reply({ message: 'Not found' }, 404)
  try {
    const { email, password } = await request.json()
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 320 || password.length > 1024) return reply({ message: 'Unable to sign in.' }, 400)
    const subject = await hash(email.trim().toLowerCase())
    return await sql.begin(async transaction => {
      // Serialize attempts for one normalized email, including the first insert.
      await transaction`select pg_advisory_xact_lock(hashtextextended(${subject}, 0))`
      const state = await transaction`select locked_until from security.admin_login_attempts where subject_hash=${subject}`
      if (state[0]?.locked_until && new Date(state[0].locked_until) > new Date()) {
        return reply({ message: 'Unable to sign in.' }, 429)
      }
      const { data, error } = await auth.auth.signInWithPassword({ email: email.trim(), password })
      const activeAdmin = data.user && await transaction`select 1 from public.users where user_id=${data.user.id} and lower(role)='admin' and lower(status)='active' limit 1`
      if (error || !activeAdmin?.length || !data.session) {
        const attempts = await transaction`
          insert into security.admin_login_attempts (subject_hash, failed_attempts, first_failed_at, last_failed_at)
          values (${subject}, 1, now(), now())
          on conflict (subject_hash) do update set
            failed_attempts=case when security.admin_login_attempts.locked_until is not null and security.admin_login_attempts.locked_until <= now() then 1 else security.admin_login_attempts.failed_attempts+1 end,
            first_failed_at=case when security.admin_login_attempts.locked_until is not null and security.admin_login_attempts.locked_until <= now() then now() else security.admin_login_attempts.first_failed_at end,
            last_failed_at=now(), locked_until=null, updated_at=now()
          returning failed_attempts`
        const count = Number(attempts[0].failed_attempts)
        if (count >= 3) await transaction`update security.admin_login_attempts set locked_until=now()+interval '1 hour', updated_at=now() where subject_hash=${subject}`
        await transaction`insert into security.authorization_audit_log (event_type, reason, metadata) values ('admin_login_failure', 'authentication or authorization failed', ${JSON.stringify({ count: Math.min(count, 3) })}::jsonb)`
        return reply({ message: 'Unable to sign in.' }, count >= 3 ? 429 : 401)
      }
      await transaction`delete from security.admin_login_attempts where subject_hash=${subject}`
      await transaction`insert into security.authorization_audit_log (event_type, actor_user_id, reason) values ('admin_login_success', ${data.user.id}, 'verified active Admin login')`
      return reply({ session: data.session })
    })
  } catch { return reply({ message: 'Unable to sign in.' }, 500) }
})
