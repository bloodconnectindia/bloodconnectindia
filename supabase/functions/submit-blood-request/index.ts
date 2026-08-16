import { hash, options, reply, sql } from '../_shared/security.ts'
const groups = new Set(['A+','A-','B+','B-','AB+','AB-','O+','O-'])
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options()
  if (request.method !== 'POST') return reply({ accepted: false, message: 'Request unavailable.' }, 405)
  try {
    const body = await request.json(); const patient = String(body.patient_name ?? '').trim(); const hospital = String(body.hospital ?? '').trim(); const address = String(body.address ?? '').trim(); const mobileDigits = String(body.mobile ?? '').replace(/\D/g, ''); const mobile = mobileDigits.length === 12 && mobileDigits.startsWith('91') ? mobileDigits.slice(2) : mobileDigits; const blood = String(body.blood_group ?? '')
    const subject = await hash(`contact:${mobile || String(body.mobile ?? '').trim().slice(0,64)}`)
    return await sql.begin(async transaction => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${subject}, 0))`
      const blocked = await transaction`select blocked_until from security.blood_request_submission_state where subject_hash=${subject}`
      if (blocked[0]?.blocked_until && new Date(blocked[0].blocked_until) > new Date()) return reply({ accepted: false, message: 'Submissions are temporarily paused. Please contact a hospital or blood bank if urgent.' }, 429)
      const valid = patient.length >= 2 && patient.length <= 100 && hospital.length >= 2 && hospital.length <= 160 && address.length >= 5 && address.length <= 500 && /^[6-9]\d{9}$/.test(mobile) && groups.has(blood)
      if (!valid) {
        await transaction`insert into security.blood_request_abuse_events (subject_hash,event_type,reason) values (${subject},'validation_pattern','server validation failed')`
        const count = await transaction`select count(*)::int as total from security.blood_request_abuse_events where subject_hash=${subject} and event_type='validation_pattern' and created_at>now()-interval '30 minutes'`
        const total = Number(count[0].total); if (total >= 3) { await transaction`insert into security.blood_request_submission_state (subject_hash,blocked_until) values (${subject},now()+interval '15 minutes') on conflict (subject_hash) do update set blocked_until=excluded.blocked_until,updated_at=now()`; await transaction`insert into security.blood_request_abuse_events (subject_hash,event_type,reason) values (${subject},'blocked','repeated invalid pattern')`; return reply({ accepted:false,message:'Submissions are temporarily paused. Please contact a hospital or blood bank if urgent.' },429) }
        return reply({ accepted:false,message: total === 2 ? 'Please correct the form. One more repeated invalid submission may temporarily pause requests.' : 'Please correct the highlighted request details.' },400)
      }
      const fingerprint = await hash(`request:${patient.toLowerCase()}|${mobile}|${blood}|${hospital.toLowerCase()}`)
      await transaction`select pg_advisory_xact_lock(hashtextextended(${fingerprint}, 0))`
      const duplicate = await transaction`select 1 from security.blood_request_deduplication where request_hash=${fingerprint} and expires_at>now()`
      if (duplicate.length) { await transaction`insert into security.blood_request_abuse_events (subject_hash,event_type,reason) values (${subject},'duplicate','recent equivalent request')`; return reply({ accepted:false,message:'A similar request was already received. Please avoid resubmitting unless details changed.' },409) }
      await transaction`insert into public.blood_requests (patient_name,blood_group,hospital,mobile,address) values (${patient},${blood},${hospital},${mobile},${address})`
      await transaction`insert into security.blood_request_deduplication (request_hash,expires_at) values (${fingerprint},now()+interval '10 minutes') on conflict (request_hash) do update set created_at=now(),expires_at=excluded.expires_at`
      await transaction`insert into security.blood_request_abuse_events (subject_hash,event_type) values (${subject},'submitted')`
      return reply({ accepted:true })
    })
  } catch { return reply({ accepted:false,message:'Unable to submit the request right now.' },500) }
})
