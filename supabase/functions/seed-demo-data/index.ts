import {
  bearerUser,
  options,
  originAllowed,
  reply,
  serviceAuth,
  sql,
} from "../_shared/security.ts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bloodGroups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const allowedRoles = new Map([
  ["donor", "Donor"],
  ["hospital", "Hospital"],
  ["blood bank", "Blood Bank"],
]);
const generic = { message: "Demo seed was not completed." };
const MAX_USERS = 10;
const MAX_BLOOD_REQUESTS = 50;

type SeedUser = { email: string; role: string };
type SeedBloodRequest = {
  patient_name: string;
  blood_group: string;
  hospital: string;
  mobile: string;
  address: string;
};

const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${
    [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
  }aA1!`;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return originAllowed(request) ? options() : reply(generic, 403);
  }
  if (request.method !== "POST" || !originAllowed(request)) {
    return reply(generic, 403);
  }

  let actorUserId: string | null = null;
  let requestId: string | null = null;
  let batchId: string | null = null;
  const createdAuthUserIds: string[] = [];
  try {
    const actor = await bearerUser(request);
    if (!actor) return reply(generic, 403);
    actorUserId = actor.id;

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    requestId = typeof body.request_id === "string" ? body.request_id : null;
    const users: SeedUser[] = Array.isArray(body.users) ? body.users : [];
    const bloodRequests: SeedBloodRequest[] = Array.isArray(body.blood_requests)
      ? body.blood_requests
      : [];
    if (
      !requestId || !uuid.test(requestId) || label.length < 1 ||
      label.length > 160 || reason.length < 3 || reason.length > 500 ||
      users.length > MAX_USERS || bloodRequests.length > MAX_BLOOD_REQUESTS ||
      (users.length === 0 && bloodRequests.length === 0)
    ) return reply(generic, 400);

    const normalizedUsers: SeedUser[] = [];
    for (const user of users) {
      const email = typeof user?.email === "string"
        ? user.email.trim().toLowerCase()
        : "";
      const role = typeof user?.role === "string"
        ? allowedRoles.get(user.role.trim().toLowerCase())
        : undefined;
      if (!emailPattern.test(email) || email.length > 320 || !role) {
        return reply(generic, 400);
      }
      normalizedUsers.push({ email, role });
    }
    if (
      new Set(normalizedUsers.map((user) => user.email)).size !==
        normalizedUsers.length
    ) return reply(generic, 400);

    const normalizedRequests = bloodRequests.map((item) => {
      const digits = String(item?.mobile ?? "").replace(/\D/g, "");
      return {
        patient: String(item?.patient_name ?? "").trim(),
        blood: String(item?.blood_group ?? ""),
        hospital: String(item?.hospital ?? "").trim(),
        mobile: digits.length === 12 && digits.startsWith("91")
          ? digits.slice(2)
          : digits,
        address: String(item?.address ?? "").trim(),
      };
    });
    if (
      normalizedRequests.some((item) =>
        item.patient.length < 2 || item.patient.length > 100 ||
        item.hospital.length < 2 || item.hospital.length > 160 ||
        item.address.length < 5 || item.address.length > 500 ||
        !/^[6-9]\d{9}$/.test(item.mobile) || !bloodGroups.has(item.blood)
      )
    ) return reply(generic, 400);

    batchId = crypto.randomUUID();
    return await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`;

      const actorRows =
        await transaction`select role,status from public.users where user_id=${actor.id}`;
      if (
        actorRows.length !== 1 ||
        String(actorRows[0].status).toLowerCase() !== "active"
      ) return reply(generic, 403);
      const allowed = await transaction`
        select 1 where not exists (
          select 1 from security.user_permission_overrides d
          where d.user_id=${actor.id} and d.permission_key='demo.seed' and d.effect='deny'
            and (d.expires_at is null or d.expires_at>now())
        ) and (
          exists (
            select 1 from security.role_permissions rp
            where lower(rp.role_name)=lower(${String(actorRows[0].role)})
              and rp.permission_key in ('demo.seed','system.full_access')
          ) or exists (
            select 1 from security.user_permission_overrides a
            where a.user_id=${actor.id} and a.permission_key='demo.seed' and a.effect='allow'
              and (a.expires_at is null or a.expires_at>now())
          )
        )`;
      if (!allowed.length) {
        await transaction`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason) values ('demo_seed_denied',${actor.id},'demo_batch',${batchId},'missing demo.seed permission or explicitly denied')`;
        return reply(generic, 403);
      }

      const claimed = await transaction`
        insert into security.privileged_operation_requests (request_id,actor_user_id,action,target_id,status)
        values (${requestId},${actor.id},'demo.seed',${batchId},'started')
        on conflict (request_id) do nothing returning request_id`;
      if (!claimed.length) {
        await transaction`insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason) values ('demo_seed_replay_rejected',${actor.id},'demo_batch',${batchId},'duplicate privileged operation request')`;
        return reply(generic, 409);
      }

      await transaction`insert into public.demo_batches (id,label,status,created_by_auth_user_id) values (${batchId},${label},'active',${actor.id})`;

      for (const seedUser of normalizedUsers) {
        const membershipId = crypto.randomUUID();
        const { data, error } = await serviceAuth.auth.admin.createUser({
          email: seedUser.email,
          password: randomPassword(),
          email_confirm: true,
          app_metadata: {
            is_demo: true,
            demo_batch_id: batchId,
            demo_membership_id: membershipId,
          },
        });
        if (error || !data.user) {
          throw new Error("Demo Auth identity creation failed");
        }
        createdAuthUserIds.push(data.user.id);

        const mapped = await transaction`
          insert into public.users (user_id,role,status)
          select ${data.user.id},${seedUser.role},'Active'
          where not exists (select 1 from public.users where user_id=${data.user.id})
          returning user_id`;
        if (mapped.length !== 1) {
          throw new Error("Demo public.users mapping was not unique");
        }
        await transaction`
          insert into security.demo_user_memberships (auth_user_id,demo_batch_id,membership_id,lifecycle,created_by_auth_user_id)
          values (${data.user.id},${batchId},${membershipId},'demo_only',${actor.id})`;
      }

      for (const item of normalizedRequests) {
        await transaction`
          insert into public.blood_requests (patient_name,blood_group,hospital,mobile,address,demo_batch_id)
          values (${item.patient},${item.blood},${item.hospital},${item.mobile},${item.address},${batchId})`;
      }

      await transaction`update security.privileged_operation_requests set status='completed',completed_at=now() where request_id=${requestId}`;
      await transaction`
        insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason,metadata)
        values ('demo_seed_completed',${actor.id},'demo_batch',${batchId},${reason},${
        JSON.stringify({
          request_id: requestId,
          users: normalizedUsers.length,
          blood_requests: normalizedRequests.length,
        })
      }::jsonb)`;
      return reply({ completed: true, batch_id: batchId });
    });
  } catch {
    let cleanupFailed = false;
    for (const authUserId of createdAuthUserIds.reverse()) {
      const { error } = await serviceAuth.auth.admin.deleteUser(
        authUserId,
        false,
      );
      cleanupFailed ||= Boolean(error);
    }
    if (actorUserId) {
      try {
        await sql`
          insert into security.authorization_audit_log (event_type,actor_user_id,target_type,target_id,reason,metadata)
          values ('demo_seed_failed',${actorUserId},'demo_batch',${batchId},${
          cleanupFailed
            ? "transaction failed; Auth compensation incomplete"
            : "transaction failed; created Auth identities compensated"
        },${
          JSON.stringify({
            request_id: requestId,
            created_auth_users: createdAuthUserIds.length,
            cleanup_failed: cleanupFailed,
          })
        }::jsonb)`;
      } catch {
        /* Keep the response generic when failure auditing is unavailable. */
      }
    }
    return reply(generic, 400);
  }
});
