const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const read = (path: string) =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("browser uses one Edge Function and no privileged mutation path", async () => {
  const client = await read("../../js/admin-demo-management.js");
  assert(
    client.includes('functions.invoke("reset-demo-data"'),
    "Missing reset Edge Function invocation",
  );
  assert(!client.includes(".rpc("), "Browser RPC path remains");
  assert(
    !/\.(insert|update|upsert|delete)\(/.test(client),
    "Browser mutation path remains",
  );
  assert(
    client.includes("crypto.randomUUID()"),
    "Missing per-submit replay identifier",
  );
});

Deno.test("reset endpoint is live-aligned and has no legacy identity dependency", async () => {
  const endpoint = await read("./reset-demo-data/index.ts");
  for (
    const forbidden of [
      "public.profiles",
      "public.user_roles",
      "current_user_has_role",
      "body.table",
      "body.user_id",
    ]
  ) {
    assert(
      !endpoint.includes(forbidden),
      `Forbidden reset dependency: ${forbidden}`,
    );
  }
  for (
    const expected of [
      "auth.users",
      "public.users",
      "public.demo_batches",
      "security.demo_user_memberships",
      "public.blood_requests",
    ]
  ) {
    assert(
      endpoint.includes(expected),
      `Missing live-aligned reset dependency: ${expected}`,
    );
  }
});

Deno.test("reset endpoint fails closed around identity, permission, replay and deletion", async () => {
  const endpoint = await read("./reset-demo-data/index.ts");
  for (
    const expected of [
      "actorRows.length !== 1",
      "permission_key='demo.reset'",
      "effect='deny'",
      "'system.full_access'",
      "sql.begin",
      "pg_advisory_xact_lock",
      "privileged_operation_requests",
      "demo_reset_protected_identities",
      "('admin','super admin')",
      "Demo identity deletion count mismatch",
      "demo_reset_completed",
      "demo_reset_failed",
    ]
  ) {
    assert(endpoint.includes(expected), `Missing reset control: ${expected}`);
  }
  assert(
    !/update\s+public\.users/i.test(endpoint),
    "Reset must not update public.users",
  );
  assert(
    !/security\.(roles|permissions|role_permissions|user_permission_overrides)\s+(set|values)/i
      .test(endpoint),
    "Reset must not manage authorization data",
  );
});

Deno.test("clean demo migration is separate and browser writes are revoked", async () => {
  const demo = await read(
    "../migrations/202608120004_live_aligned_demo_lifecycle.sql",
  );
  const security = await read(
    "../migrations/202608120001_security_authorization_and_request_controls.sql",
  );
  for (
    const expected of [
      "public.demo_batches",
      "security.demo_user_memberships",
      "security.privileged_operation_requests",
      "security.demo_reset_protected_identities",
      "('demo.read'",
      "('demo.reset'",
      "security.current_user_has_permission('demo.read')",
      "add column if not exists demo_batch_id",
    ]
  ) {
    assert(
      demo.includes(expected),
      `Missing demo migration element: ${expected}`,
    );
  }
  assert(
    !demo.includes("public.profiles"),
    "Clean migration must not use profiles",
  );
  assert(
    !demo.includes("public.user_roles"),
    "Clean migration must not use user_roles",
  );
  assert(
    !security.includes("privileged_operation_requests"),
    "Demo replay table remains in general security migration",
  );
  assert(
    !security.includes("('demo.reset'"),
    "Demo permission remains in general security migration",
  );
  assert(
    demo.includes(
      "revoke all on public.demo_batches from public, anon, authenticated",
    ),
    "Browser write revocation missing",
  );
});

Deno.test("fixed deletion scope contains only the evidenced operational table", async () => {
  const endpoint = await read("./reset-demo-data/index.ts");
  const operationalDeletes = [
    ...endpoint.matchAll(/delete from public\.([a-z_]+)/g),
  ].map((match) => match[1]);
  assert(
    JSON.stringify(operationalDeletes) ===
      JSON.stringify(["blood_requests", "users"]),
    `Unexpected public deletion scope: ${operationalDeletes}`,
  );
});
