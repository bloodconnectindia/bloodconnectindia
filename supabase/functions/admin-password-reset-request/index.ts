import { serviceAuth, options, reply, sql } from '../_shared/security.ts'
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options()
  try {
    const { email } = await request.json(); const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const eligible = normalized && await sql`select 1 from auth.users a join public.users u on u.user_id=a.id::text where lower(a.email)=${normalized} and lower(u.role)='admin' and lower(u.status)='active' limit 1`
    if (eligible?.length) await serviceAuth.auth.resetPasswordForEmail(normalized, { redirectTo: `${Deno.env.get('APP_ORIGIN')}/pages/admin-reset-password.html` })
    await sql`insert into security.authorization_audit_log (event_type, reason) values ('admin_password_reset_requested', 'generic reset request')`
    return reply({ accepted: true })
  } catch { return reply({ accepted: true }) }
})
