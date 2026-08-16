const required = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  BCI_TRIGGER_CONFIRMATION: "RUN_DISPOSABLE_LOCAL_INTEGRATION",
  BCI_DISPOSABLE_APPROVAL: "approved",
  BCI_DATABASE_HOST: "127.0.0.1",
  BCI_DATABASE_PORT: "54322",
  BCI_DATABASE_NAME: "postgres",
};

for (const [name, expected] of Object.entries(required)) {
  if (Deno.env.get(name) !== expected) throw new Error(`Safety guard rejected ${name}`);
}

const runId = Deno.env.get("BCI_TEST_RUN_ID") || "";
if (!/^bci-local-[0-9]+-[0-9]+$/.test(runId)) throw new Error("Invalid disposable run ID");

const databaseUrl = new URL(Deno.env.get("BCI_DATABASE_URL") || "invalid:");
if (databaseUrl.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) || databaseUrl.port !== "54322" || databaseUrl.pathname !== "/postgres") {
  throw new Error("Database URL is not the runner-local Supabase database");
}

const forbiddenEnvironmentNames = [
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_DB_URL",
  "DATABASE_URL", "PRODUCTION_DATABASE_URL", "LIVE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
];
for (const name of forbiddenEnvironmentNames) {
  if (Deno.env.get(name)) throw new Error(`Forbidden credential/environment variable is configured: ${name}`);
}

for (const path of [".supabase/project-ref", "supabase/.temp/project-ref", ".env", ".env.local", ".env.production"]) {
  try {
    const value = (await Deno.readTextFile(path)).trim();
    if (value) throw new Error(`Remote-link or environment file must be absent in CI: ${path}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

const requiredReadinessFiles = [
  "supabase/config.toml",
  "supabase/tests/integration/ci/disposable-baseline.sql",
  "supabase/tests/integration/ci/PHASE_DRIVER_APPROVED",
];
const missing: string[] = [];
for (const path of requiredReadinessFiles) {
  try { await Deno.stat(path); } catch (error) { if (error instanceof Deno.errors.NotFound) missing.push(path); else throw error; }
}
if (missing.length) throw new Error(`Database execution is intentionally blocked pending reviewed readiness files: ${missing.join(", ")}`);

console.log("Local-only safety and readiness gate passed without displaying credentials.");
