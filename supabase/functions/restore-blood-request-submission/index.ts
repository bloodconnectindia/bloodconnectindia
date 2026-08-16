import { bearerUser, options, reply, sql } from '../_shared/security.ts'
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options()
  try {
    const user = await bearerUser(request); const { subject_hash, reason } = await request.json()
    if (!user || typeof subject_hash !== 'string' || !/^[a-f0-9]{64}$/.test(subject_hash) || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) return reply({ message:'Not authorized.' },403)
    return await sql.begin(async transaction => {
      const allowed = await transaction`select 1 from public.users u where u.user_id=${user.id} and lower(u.status)='active' and not exists (select 1 from security.user_permission_overrides d where d.user_id=u.user_id and d.permission_key='blood_requests.restore_submission' and d.effect='deny' and (d.expires_at is null or d.expires_at>now())) and (exists (select 1 from security.role_permissions rp where rp.role_name=u.role and rp.permission_key in ('blood_requests.restore_submission','system.full_access')) or exists (select 1 from security.user_permission_overrides o where o.user_id=u.user_id and o.permission_key='blood_requests.restore_submission' and o.effect='allow' and (o.expires_at is null or o.expires_at>now()))) limit 1`
      if (!allowed.length) return reply({ message:'Not authorized.' },403)
      await transaction`select pg_advisory_xact_lock(hashtextextended(${subject_hash}, 0))`
      await transaction`update security.blood_request_submission_state set blocked_until=null,updated_at=now() where subject_hash=${subject_hash}`
      await transaction`insert into security.blood_request_abuse_events (subject_hash,event_type,actor_user_id,reason) values (${subject_hash},'restored',${user.id},${reason.trim()})`
      await transaction`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason) values ('blood_request_submission_restored',${user.id},'submission_subject',${subject_hash},${reason.trim()})`
      return reply({ restored:true })
    })
  } catch { return reply({ message:'Not authorized.' },403) }
})
