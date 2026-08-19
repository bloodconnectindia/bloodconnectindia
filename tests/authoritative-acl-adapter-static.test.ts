const root = new URL("../", import.meta.url);
const adapter = await Deno.readTextFile(
  new URL("supabase/tests/integration/ci/verified-operational-acl.sql", root),
);
const migration = await Deno.readTextFile(
  new URL(
    "supabase/migrations/202608120001_security_authorization_and_request_controls.sql",
    root,
  ),
);
const notes = await Deno.readTextFile(
  new URL(
    "supabase/tests/integration/ci/AUTHORITATIVE_ACL_AND_AUTH_FIXTURE_NOTES.md",
    root,
  ),
);
const fullPrivileges = [
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
  "maintain",
];
const fullTables = [
  "users",
  "donors",
  "blood_requests",
  "blood_stock",
  "blood_banks",
  "hospitals",
];

Deno.test("authoritative adapter contains the exact six-table grant matrix", () => {
  for (const table of fullTables) {
    if (!adapter.includes(`public.${table}`)) {
      throw new Error(`Missing table: ${table}`);
    }
  }
  for (const privilege of fullPrivileges) {
    if (!adapter.toLowerCase().includes(privilege)) {
      throw new Error(`Missing privilege: ${privilege}`);
    }
  }
  if (
    !/grant select, insert, update, delete, truncate, references, trigger, maintain[\s\S]*?to postgres;/i
      .test(adapter)
  ) {
    throw new Error("Exact postgres grant matrix missing");
  }
  if (!/grant select[\s\S]*?to authenticated;/i.test(adapter)) {
    throw new Error("Exact authenticated grant matrix missing");
  }
  if (
    !/grant select, insert, delete on table public\.users to service_role;/i
      .test(adapter)
  ) {
    throw new Error("Exact service_role grant matrix missing");
  }
  for (const forbidden of ["to public", "to anon", "with grant option"]) {
    if (adapter.toLowerCase().includes(forbidden)) {
      throw new Error(`Unexpected ACL expansion: ${forbidden}`);
    }
  }
});

Deno.test("non-owner grants remain least privilege", () => {
  const grants = adapter.match(/^grant[\s\S]*?;/gim) ?? [];
  if (grants.length !== 3) {
    throw new Error(`Unexpected GRANT statement count: ${grants.length}`);
  }
  const authenticated = grants.find((statement) =>
    /to\s+authenticated\s*;/i.test(statement)
  );
  if (!authenticated || !/^grant\s+select\b/i.test(authenticated.trim())) {
    throw new Error("authenticated must receive SELECT only");
  }
  const serviceRole = grants.find((statement) =>
    /to\s+service_role\s*;/i.test(statement)
  );
  if (!serviceRole || !/public\.users\s+to\s+service_role/i.test(serviceRole)) {
    throw new Error("service_role must be limited to public.users");
  }
  if (/\b(update|truncate|references|trigger|maintain)\b/i.test(serviceRole)) {
    throw new Error("service_role privilege expansion found");
  }
});

Deno.test("57 expanded entries are derived exactly from authoritative facts", () => {
  const derived = fullTables.length * fullPrivileges.length +
    fullTables.length + 3;
  if (derived !== 57) {
    throw new Error(`Unexpected derived ACL count: ${derived}`);
  }
  if (!adapter.includes("unexpected<>57")) {
    throw new Error("Adapter exact-count assertion missing");
  }
});

Deno.test("adapter fails closed on owner, RLS, grantor, grantability, grantee, and column ACL", () => {
  for (
    const required of [
      "pg_get_userbyid(c.relowner)<>'postgres'",
      "not c.relrowsecurity",
      "actual.grantor<>'postgres'",
      "actual.is_grantable",
      "actual.grantee='authenticated' and actual.privilege_type='SELECT'",
      "actual.relname='users' and actual.grantee='service_role'",
      "a.attacl is not null",
    ]
  ) {
    if (!adapter.includes(required)) {
      throw new Error(`Fail-closed assertion missing: ${required}`);
    }
  }
});

Deno.test("live role helper alignment and permission-helper introduction are explicit", () => {
  for (
    const required of [
      "current_user_has_role(required_role text)",
      "SECURITY DEFINER",
      'search_path=""',
      "only to `postgres` and `authenticated`",
      "current_user_has_permission(text)` is absent live",
    ]
  ) {
    if (!notes.includes(required)) {
      throw new Error(`Live helper fact missing: ${required}`);
    }
  }
  for (
    const required of [
      "create or replace function security.current_user_has_role(required_role text)",
      "create or replace function security.current_user_has_permission(required_permission text)",
      "security definer",
      "set search_path = ''",
      "revoke all on function security.current_user_has_permission(text) from public",
      "grant execute on function security.current_user_has_permission(text) to authenticated",
    ]
  ) {
    if (!migration.toLowerCase().includes(required.toLowerCase())) {
      throw new Error(`Prepared helper control missing: ${required}`);
    }
  }
  if (/\b(?:from|join)\s+public\.(?:profiles|user_roles)\b/i.test(migration)) {
    throw new Error("Legacy identity dependency found");
  }
});
