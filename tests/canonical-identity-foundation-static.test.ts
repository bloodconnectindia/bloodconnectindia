const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const migrationName = "202608110002_canonical_identity_foundation.sql";
const migration = await read(`supabase/migrations/${migrationName}`);
const verification = await read("supabase/tests/integration/ci/verify-canonical-identity-foundation.sql");
const negativeCases = await read("supabase/tests/integration/ci/run-canonical-identity-negative-cases.sh");
const manifest = JSON.parse(await read("supabase/migration-manifest.json"));
const driver = await read("scripts/ci/run-disposable-integration-phase.sh");

Deno.test("canonical identity foundation is ordered before authorization", () => {
  const expected = [
    "202608110001_authoritative_schema_preflight.sql",
    migrationName,
    "202608120001_security_authorization_and_request_controls.sql",
    "202608120004_live_aligned_demo_lifecycle.sql",
  ];
  if (JSON.stringify(manifest.runnableMigrations) !== JSON.stringify(expected)) {
    throw new Error("Canonical identity migration order is incorrect");
  }
});

Deno.test("canonical identity foundation is additive and performs no data rewrite", () => {
  const withoutComments = migration.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  for (const forbidden of [
    /^\s*(update|insert|delete|truncate|drop|rename)\b/im,
    /alter\s+column\s+user_id/i,
    /set\s+not\s+null/i,
    /validate\s+constraint/i,
  ]) {
    if (forbidden.test(withoutComments)) throw new Error(`Unsafe identity operation found: ${forbidden}`);
  }
  for (const required of [
    "add column if not exists auth_user_id uuid",
    "foreign key (auth_user_id) references auth.users(id)",
    "on delete restrict",
    "users_auth_user_id_matches_legacy_check",
    "create unique index users_auth_user_id_unique_nonnull_idx",
  ]) {
    if (!migration.toLowerCase().includes(required)) throw new Error(`Missing additive safeguard: ${required}`);
  }
  if (/\bnot\s+valid\b/i.test(withoutComments)) throw new Error("Foundation leaves a constraint unvalidated");
});

Deno.test("identity failures are aggregate-only and disposable verification proves no backfill", () => {
  for (const forbidden of ["raise notice '%', user_id", "raise exception '%', user_id", "select email", "select mobile"] ) {
    if (migration.toLowerCase().includes(forbidden)) throw new Error("Identity migration may expose protected data");
  }
  for (const required of ["count(*)", "values are intentionally not displayed", "auth_user_id is not null"]) {
    if (!migration.toLowerCase().includes(required)) throw new Error(`Missing aggregate safety behavior: ${required}`);
  }
  if (!verification.includes("unexpectedly populated identity data")) throw new Error("Disposable verification does not prove absence of backfill");
  if (!driver.includes("verify-canonical-identity-foundation.sql")) throw new Error("Disposable driver does not verify the foundation");
  const phase = driver.slice(driver.indexOf("identity-foundation)"), driver.indexOf("identity-index)"));
  if (!phase.includes("202608110001_authoritative_schema_preflight.sql")) throw new Error("Disposable driver does not re-run the preflight after the foundation");
});

Deno.test("all auth_user_id constraints and indexes are inventoried semantically", () => {
  for (const required of [
    "auth_user_attnum = any(con.conkey)",
    "con.confrelid = 'auth.users'::regclass",
    "con.confkey[1]",
    "con.confdeltype = 'r'",
    "con.confupdtype = 'a'",
    "con.confmatchtype = 's'",
    "pg_get_expr(con.conbin, con.conrelid)",
    "auth_user_attnum = any(i.indkey::smallint[])",
    "pg_get_expr(i.indexprs, i.indrelid)",
    "pg_get_expr(i.indpred, i.indrelid)",
    "i.indnkeyatts = 1 and i.indnatts = 1",
    "am.amname = 'btree'",
  ]) {
    if (!migration.includes(required)) throw new Error(`Missing semantic inventory check: ${required}`);
  }
});

Deno.test("guarded disposable cases reject alternate incompatible identity objects", () => {
  const cases = [
    "alternate_cascade_identity_fk",
    "alternate_incompatible_identity_fk",
    "alternate_identity_check",
    "alternate_full_identity_unique",
    "alternate_identity_expression",
    "alternate_identity_predicate",
  ];
  for (const name of cases) if (!negativeCases.includes(name)) throw new Error(`Missing negative identity case: ${name}`);
  for (const guard of ["BCI_DISPOSABLE_APPROVAL", "127.0.0.1", "54322", "ON_ERROR_STOP=1"]) {
    if (!negativeCases.includes(guard)) throw new Error(`Negative identity runner lacks local guard: ${guard}`);
  }
  if (!driver.includes("run-canonical-identity-negative-cases.sh")) throw new Error("Disposable driver does not run negative identity cases");
});
