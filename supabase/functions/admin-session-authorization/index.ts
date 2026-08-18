import { auth, options, reply, sql } from '../_shared/security.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options()
  if (request.method !== 'POST') return reply({ message: 'Not found' }, 404)
  try {
    const authorization = request.headers.get('authorization') || ''
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i)
    if (!match) return reply({ message: 'Unable to authorize session.' }, 401)
    const { data, error } = await auth.auth.getUser(match[1])
    if (error || !data.user) return reply({ message: 'Unable to authorize session.' }, 401)
    const rows = await sql`select 1 from public.users where user_id=${data.user.id} and lower(role)='admin' and lower(status)='active' limit 1`
    if (!rows.length) return reply({ message: 'Unable to authorize session.' }, 403)
    return reply({ verified_identity: { role: 'Admin', status: 'Active' } })
  } catch {
    return reply({ message: 'Unable to authorize session.' }, 500)
  }
})
