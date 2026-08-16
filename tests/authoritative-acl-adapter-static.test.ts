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
  "blood_stock",
  "blood_banks",
  "hospitals",
];

Deno.test("authoritative adapter contains the exact six-table grant matrix", () => {
  for (const table of [...fullTables, "blood_requests"]) {
    if (!adapter.includes(`public.${table}`)) {
      throw new Error(`Missing table: ${table}`);
    }
  }
  for (const privilege of fullPrivileges) {
    if (!adapter.toLowerCase().includes(privilege)) {
      throw new Error(`Missing privilege: ${privilege}`);
    }
  }
  if (!adapter.includes("to postgres, authenticated, service_role")) {
    throw new Error("Full non-anon grantee matrix missing");
  }
  if (!adapter.includes("to anon;")) throw new Error("Anon matrix missing");
  for (const forbidden of ["to public", "with grant option"]) {
    if (adapter.toLowerCase().includes(forbidden)) {
      throw new Error(`Unexpected ACL expansion: ${forbidden}`);
    }
  }
});

Deno.test("blood_requests anon exception is exactly INSERT plus MAINTAIN", () => {
  const anonStatements = (adapter.match(/grant[\s\S]*?;/gi) ?? []).filter(
    (statement) => /to\s+anon\s*;/i.test(statement),
  );
  if (anonStatements.length !== 2) {
    throw new Error(
      `Unexpected anon GRANT statement count: ${anonStatements.length}`,
    );
  }
  const bloodRequestStatement = anonStatements.find((statement) =>
    /public\.blood_requests/i.test(statement)
  );
  if (!bloodRequestStatement) {
    throw new Error("blood_requests anon statement missing");
  }
  if (
    !/grant\s+insert,\s*maintain\s+on\s+table\s+public\.blood_requests\s+to\s+anon;/i
      .test(adapter)
  ) throw new Error("Exact blood_requests anon grant missing");
  for (
    const forbidden of [
      "select",
      "update",
      "delete",
      "truncate",
      "references",
      "trigger",
    ]
  ) {
    if (new RegExp(`\\b${forbidden}\\b`, "i").test(bloodRequestStatement)) {
      throw new Error(`blood_requests anon grant expanded with ${forbidden}`);
    }
  }
});

Deno.test("186 expanded entries are derived exactly from authoritative facts", () => {
  const derived = fullTables.length * 4 * fullPrivileges.length +
    3 * fullPrivileges.length + 2;
  if (derived !== 186) {
    throw new Error(`Unexpected derived ACL count: ${derived}`);
  }
  if (!adapter.includes("unexpected<>186")) {
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
      "actual.grantee not in ('postgres','anon','authenticated','service_role')",
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
