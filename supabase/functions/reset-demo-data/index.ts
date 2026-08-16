import {
  bearerUser,
  options,
  originAllowed,
  reply,
  sql,
} from "../_shared/security.ts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const generic = { message: "Demo reset was not completed." };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return originAllowed(request) ? options() : reply(generic, 403);
  }
  if (request.method !== "POST" || !originAllowed(request)) {
    return reply(generic, 403);
  }

  let actorUserId: string | null = null;
  let auditTarget: string | null = null;
  let auditRequestId: string | null = null;
  try {
    const user = await bearerUser(request);
    if (!user) return reply(generic, 403);
    actorUserId = user.id;

    const body = await request.json();
    const phrase = body.confirmation_phrase;
    const target = body.target_demo_batch_id || null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const requestId = body.request_id;
    auditTarget = typeof target === "string" ? target : null;
    auditRequestId = typeof requestId === "string" ? requestId : null;
    if (
      phrase !== "RESET DEMO DATA" ||
      (target !== null && (typeof target !== "string" || !uuid.test(target))) ||
      typeof requestId !== "string" || !uuid.test(requestId) ||
      reason.length < 3 || reason.length > 500
    ) return reply(generic, 400);

    return await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`;
      if (target === null) {
        await transaction`select pg_advisory_xact_lock(hashtextextended('demo.reset.all', 0))`;
      }

      // Ambiguous or inactive public.users identity mappings always fail closed.
      const actorRows =
        await transaction`select role,status from public.users where user_id=${user.id}`;
      if (
        actorRows.length !== 1 ||
        String(actorRows[0].status).toLowerCase() !== "active"
      ) {
        return reply(generic, 403);
      }

      const allowed = await transaction`
        select 1
        where not exists (
          select 1 from security.user_permission_overrides d
          where d.user_id=${user.id} and d.permission_key='demo.reset' and d.effect='deny'
            and (d.expires_at is null or d.expires_at>now())
        ) and (
          exists (
            select 1 from security.role_permissions rp
            where lower(rp.role_name)=lower(${String(actorRows[0].role)})
              and rp.permission_key in ('demo.reset','system.full_access')
          ) or exists (
            select 1 from security.user_permission_overrides a
            where a.user_id=${user.id} and a.permission_key='demo.reset' and a.effect='allow'
              and (a.expires_at is null or a.expires_at>now())
          )
        )`;
      if (!allowed.length) {
        await transaction`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason) values ('demo_reset_denied',${user.id},'demo_batch',${target},'missing demo.reset permission or explicitly denied')`;
        return reply(generic, 403);
      }

      const claimed = await transaction`
        insert into security.privileged_operation_requests (request_id,actor_user_id,action,target_id,status)
        values (${requestId},${user.id},'demo.reset',${target},'started')
        on conflict (request_id) do nothing returning request_id`;
      if (!claimed.length) {
        await transaction`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason,metadata) values ('demo_reset_replay_rejected',${user.id},'demo_batch',${target},'duplicate privileged operation request',${
          JSON.stringify({ request_id: requestId })
        }::jsonb)`;
        return reply(generic, 409);
      }

      const batches = await transaction`
        update public.demo_batches
        set status='resetting',reset_requested_at=now(),reset_requested_by_auth_user_id=${user.id},reset_request_id=${requestId}
        where status='active' and (${target}::uuid is null or id=${target}::uuid)
        returning id`;
      if (!batches.length) throw new Error("No eligible demo reset target");

      await transaction`
        select m.auth_user_id from security.demo_user_memberships m
        join public.demo_batches b on b.id=m.demo_batch_id and b.reset_request_id=${requestId}
        for update of m`;
      await transaction`
        select a.id from auth.users a join security.demo_user_memberships m on m.auth_user_id=a.id
        join public.demo_batches b on b.id=m.demo_batch_id and b.reset_request_id=${requestId}
        for update of a`;
      await transaction`
        select u.user_id from public.users u join security.demo_user_memberships m on u.user_id=m.auth_user_id::text
        join public.demo_batches b on b.id=m.demo_batch_id and b.reset_request_id=${requestId}
        for update of u`;

      const unsafeIdentity = await transaction`
        select m.auth_user_id
        from security.demo_user_memberships m
        join public.demo_batches b on b.id=m.demo_batch_id and b.reset_request_id=${requestId}
        left join auth.users a on a.id=m.auth_user_id
        left join security.demo_reset_protected_identities p on p.auth_user_id=m.auth_user_id
        left join lateral (
          select count(*)::int as mapping_count,min(u.role) as role,min(u.status) as status
          from public.users u where u.user_id=m.auth_user_id::text
        ) mapped on true
        where m.lifecycle<>'demo_only' or a.id is null or mapped.mapping_count<>1
          or coalesce(mapped.role,'')='' or coalesce(mapped.status,'')=''
          or lower(coalesce(mapped.role,'')) in ('admin','super admin')
          or m.auth_user_id=${user.id}::uuid or p.auth_user_id is not null
          or coalesce(a.raw_app_meta_data->>'is_demo','false')<>'true'
          or coalesce(a.raw_app_meta_data->>'demo_batch_id','')<>m.demo_batch_id::text
          or coalesce(a.raw_app_meta_data->>'demo_membership_id','')<>m.membership_id::text
        limit 1`;
      if (unsafeIdentity.length) {
        throw new Error("Demo identity markers are inconsistent");
      }

      await transaction`
        create temporary table demo_reset_candidates on commit drop as
        select m.auth_user_id,m.demo_batch_id,m.membership_id
        from security.demo_user_memberships m
        join public.demo_batches b on b.id=m.demo_batch_id and b.reset_request_id=${requestId}`;
      const candidateCountRows =
        await transaction`select count(*)::int as total from demo_reset_candidates`;
      const candidateCount = Number(candidateCountRows[0].total);

      // Fixed operational scope: public.blood_requests is the only locally
      // verified table with a prepared demo_batch_id marker.
      const deletedRequests = await transaction`
        delete from public.blood_requests r using public.demo_batches b
        where r.demo_batch_id=b.id and b.reset_request_id=${requestId}
        returning r.demo_batch_id`;
      const deletedUsers = await transaction`
        delete from public.users u using demo_reset_candidates c
        where u.user_id=c.auth_user_id::text
          and u.user_id<>${user.id}
          and lower(coalesce(u.role,'')) not in ('admin','super admin')
          and not exists (select 1 from security.demo_reset_protected_identities p where p.auth_user_id=c.auth_user_id)
        returning u.user_id`;
      const deletedMemberships = await transaction`
        delete from security.demo_user_memberships m using demo_reset_candidates c
        where m.auth_user_id=c.auth_user_id
        returning m.auth_user_id`;
      const deletedAuthUsers = await transaction`
        delete from auth.users a using demo_reset_candidates c
        where a.id=c.auth_user_id
          and a.raw_app_meta_data->>'is_demo'='true'
          and a.raw_app_meta_data->>'demo_batch_id'=c.demo_batch_id::text
          and a.raw_app_meta_data->>'demo_membership_id'=c.membership_id::text
        returning a.id`;
      if (
        deletedUsers.length !== candidateCount ||
        deletedMemberships.length !== candidateCount ||
        deletedAuthUsers.length !== candidateCount
      ) {
        throw new Error("Demo identity deletion count mismatch");
      }

      await transaction`
        update public.demo_batches set status='reset',reset_at=now(),reset_by_auth_user_id=${user.id}
        where reset_request_id=${requestId}`;
      await transaction`update security.privileged_operation_requests set status='completed',completed_at=now() where request_id=${requestId}`;
      await transaction`
        insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason,metadata)
        values ('demo_reset_completed',${user.id},'demo_batch',${target},${reason},${
        JSON.stringify({
          request_id: requestId,
          batches: batches.length,
          blood_requests: deletedRequests.length,
          demo_users: candidateCount,
        })
      }::jsonb)`;
      return reply({ completed: true });
    });
  } catch {
    if (actorUserId) {
      try {
        await sql`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason,metadata) values ('demo_reset_failed',${actorUserId},'demo_batch',${auditTarget},'server-side reset transaction failed',${
          JSON.stringify({ request_id: auditRequestId })
        }::jsonb)`;
      } catch {
        /* Do not replace the generic response if audit storage is unavailable. */
      }
    }
    return reply(generic, 400);
  }
});
