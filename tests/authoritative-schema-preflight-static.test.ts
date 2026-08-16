const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const preflight = await read("supabase/migrations/202608110001_authoritative_schema_preflight.sql");
const manifest = JSON.parse(await read("supabase/migration-manifest.json"));

const withoutComments = preflight
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");

Deno.test("authoritative preflight is first and contains no mutating SQL statement", () => {
  if (manifest.runnableMigrations[0] !== "202608110001_authoritative_schema_preflight.sql") {
    throw new Error("Authoritative preflight is not first in the runnable manifest");
  }
  const destructive = /^\s*(create|alter|drop|truncate|update|insert|delete|merge|grant|revoke|comment|refresh|vacuum|reindex|cluster)\b/im;
  if (destructive.test(withoutComments)) throw new Error("Preflight contains a mutating SQL statement");
});

Deno.test("authoritative preflight covers operational and legacy relations", () => {
  for (const relation of ["users", "donors", "blood_requests", "blood_stock", "blood_banks", "hospitals", "profiles", "user_roles"]) {
    if (!preflight.includes(relation)) throw new Error(`Missing relation check: ${relation}`);
  }
  for (const required of ["pg_constraint", "pg_index", "relrowsecurity", "auth.users", "schema_migrations"]) {
    if (!preflight.includes(required)) throw new Error(`Missing catalog or identity check: ${required}`);
  }
});

Deno.test("authoritative preflight is aggregate-only and fail-closed", () => {
  for (const required of ["malformed", "duplicated", "do not match auth.users", "privileged user row(s)", "raise exception"]) {
    if (!preflight.toLowerCase().includes(required)) throw new Error(`Missing fail-closed case: ${required}`);
  }
  for (const forbidden of ["select user_id into", "raise notice '%', user_id", "raise exception '%', user_id"]) {
    if (preflight.toLowerCase().includes(forbidden)) throw new Error("Preflight may expose an identity value");
  }
});
