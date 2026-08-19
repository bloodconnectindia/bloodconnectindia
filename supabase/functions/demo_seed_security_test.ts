const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const read = (path: string) =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("demo seed uses explicit authorization with deny precedence", async () => {
  const endpoint = await read("./seed-demo-data/index.ts");
  for (
    const expected of [
      "bearerUser(request)",
      "actorRows.length !== 1",
      "permission_key='demo.seed'",
      "effect='deny'",
      "'system.full_access'",
      "'demo_seed_denied'",
    ]
  ) {
    assert(
      endpoint.includes(expected),
      `Missing seed authorization control: ${expected}`,
    );
  }
});

Deno.test("demo seed enforces fixed non-privileged roles and active status", async () => {
  const endpoint = await read("./seed-demo-data/index.ts");
  for (
    const [input, mapped] of [["donor", "Donor"], ["hospital", "Hospital"], [
      "blood bank",
      "Blood Bank",
    ]]
  ) {
    const role = new RegExp(
      `\\[\\s*["']${input}["']\\s*,\\s*["']${mapped}["']\\s*\\]`,
    );
    assert(role.test(endpoint), `Missing approved role: ${input}`);
  }
  assert(!endpoint.includes("['admin'"), "Admin must not be seedable");
  assert(
    !endpoint.includes("['super admin'"),
    "Super Admin must not be seedable",
  );
  assert(
    endpoint.includes("${seedUser.role},'Active'"),
    "Demo status must be fixed server-side",
  );
  assert(
    !endpoint.includes("body.status"),
    "Caller-controlled status is forbidden",
  );
});

Deno.test("demo identity receives consistent independent markers and unique mapping", async () => {
  const endpoint = await read("./seed-demo-data/index.ts");
  for (
    const expected of [
      "crypto.randomUUID()",
      "is_demo: true",
      "demo_batch_id: batchId",
      "demo_membership_id: membershipId",
      "security.demo_user_memberships",
      "mapped.length !== 1",
      "where not exists (select 1 from public.users",
    ]
  ) {
    assert(
      endpoint.includes(expected),
      `Missing identity consistency control: ${expected}`,
    );
  }
  assert(
    !endpoint.includes("password_hash"),
    "Seed must not write password_hash",
  );
});

Deno.test("demo seed has replay protection, bounded fixed scope, audit and Auth compensation", async () => {
  const endpoint = await read("./seed-demo-data/index.ts");
  for (
    const expected of [
      "MAX_USERS = 10",
      "MAX_BLOOD_REQUESTS = 50",
      "pg_advisory_xact_lock",
      "'demo.seed'",
      "privileged_operation_requests",
      "public.blood_requests",
      "serviceAuth.auth.admin.deleteUser",
      "demo_seed_completed",
      "demo_seed_failed",
    ]
  ) {
    assert(
      endpoint.includes(expected),
      `Missing seed safety control: ${expected}`,
    );
  }
  for (
    const forbidden of [
      "body.table",
      "body.sql",
      "body.user_id",
      "public.donors",
      "public.hospitals",
      "public.blood_stock",
      "public.blood_banks",
    ]
  ) {
    assert(!endpoint.includes(forbidden), `Forbidden seed scope: ${forbidden}`);
  }
});

Deno.test("browser has no direct privileged seed or mutation path", async () => {
  const files = [
    "../../js/admin-demo-management.js",
    "../../js/auth.js",
    "../../js/blood-request.js",
  ];
  const client = (await Promise.all(files.map(read))).join("\n");
  assert(
    !client.includes("seed-demo-data"),
    "Demo seed must not be browser-exposed yet",
  );
  assert(!client.includes(".rpc("), "Privileged RPC path remains");
  assert(
    !/\.(insert|update|upsert|delete)\(/.test(client),
    "Direct browser mutation path remains",
  );
});

Deno.test("demo seed source contains no embedded privileged secret values", async () => {
  const endpoint = await read("./seed-demo-data/index.ts");
  assert(
    !/(service_role\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^'"\s]+|eyJ[A-Za-z0-9_-]{30,})/
      .test(endpoint),
    "Embedded privileged value detected",
  );
  assert(
    !endpoint.includes("console."),
    "Seed endpoint must not log request or credential material",
  );
  assert(
    !endpoint.includes("password:" + " body."),
    "Caller password must not be accepted",
  );
});
