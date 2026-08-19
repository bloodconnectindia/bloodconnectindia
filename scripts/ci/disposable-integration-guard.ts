const required = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  BCI_TRIGGER_CONFIRMATION: "RUN_DISPOSABLE_LOCAL_INTEGRATION",
  BCI_DISPOSABLE_APPROVAL: "approved",
  BCI_DATABASE_HOST: "127.0.0.1",
  BCI_DATABASE_PORT: "54322",
  BCI_DATABASE_NAME: "postgres",
};

for (const [name, expected] of Object.entries(required)) {
  if (Deno.env.get(name) !== expected) {
    throw new Error(`Safety guard rejected ${name}`);
  }
}

const runId = Deno.env.get("BCI_TEST_RUN_ID") || "";
if (!/^bci-local-[0-9]+-[0-9]+$/.test(runId)) {
  throw new Error("Invalid disposable run ID");
}

const databaseUrl = new URL(Deno.env.get("BCI_DATABASE_URL") || "invalid:");
if (
  databaseUrl.protocol !== "postgresql:" ||
  !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) ||
  databaseUrl.port !== "54322" || databaseUrl.pathname !== "/postgres"
) {
  throw new Error("Database URL is not the runner-local Supabase database");
}

const forbiddenEnvironmentNames = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "PRODUCTION_DATABASE_URL",
  "LIVE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "BCI_LOCAL_SUPABASE_URL",
  "BCI_LOCAL_ANON_KEY",
  "BCI_LOCAL_SERVICE_ROLE_KEY",
];
for (const name of forbiddenEnvironmentNames) {
  if (Deno.env.get(name)) {
    throw new Error(
      `Forbidden credential/environment variable is configured: ${name}`,
    );
  }
}

for (
  const path of [
    ".supabase/project-ref",
    "supabase/.temp/project-ref",
    ".env",
    ".env.local",
    ".env.production",
  ]
) {
  try {
    const value = (await Deno.readTextFile(path)).trim();
    if (value) {
      throw new Error(
        `Remote-link or environment file must be absent in CI: ${path}`,
      );
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

const requiredReadinessFiles = [
  "supabase/config.toml",
  "supabase/tests/integration/ci/disposable-baseline.sql",
  "supabase/tests/integration/ci/PHASE_DRIVER_APPROVED",
  "scripts/ci/prepare-disposable-runtime-env.ts",
];
const missing: string[] = [];
for (const path of requiredReadinessFiles) {
  try {
    await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) missing.push(path);
    else throw error;
  }
}
if (missing.length) {
  throw new Error(
    `Database execution is intentionally blocked pending reviewed readiness files: ${
      missing.join(", ")
    }`,
  );
}

const manifest = JSON.parse(
  await Deno.readTextFile("supabase/migration-manifest.json"),
) as {
  runnableMigrations?: string[];
  runnableMigrationSha256?: Record<string, string>;
  denylistedLegacyMigrations?: Record<string, string>;
};
const approvedOrder = [
  "202608110001_authoritative_schema_preflight.sql",
  "202608110002_canonical_identity_foundation.sql",
  "202608120001_security_authorization_and_request_controls.sql",
  "202608120004_live_aligned_demo_lifecycle.sql",
];
if (
  JSON.stringify(manifest.runnableMigrations) !== JSON.stringify(approvedOrder)
) {
  throw new Error(
    "Runnable migration order or filename inventory is not approved",
  );
}
const actualRunnable = [];
for await (const entry of Deno.readDir("supabase/migrations")) {
  if (entry.isFile && entry.name.endsWith(".sql")) {
    actualRunnable.push(entry.name);
  }
}
actualRunnable.sort();
if (JSON.stringify(actualRunnable) !== JSON.stringify(approvedOrder)) {
  throw new Error("Runnable migration directory inventory is not exact");
}
const approvedHashes = manifest.runnableMigrationSha256 ?? {};
if (
  JSON.stringify(Object.keys(approvedHashes).sort()) !==
    JSON.stringify([...approvedOrder].sort())
) {
  throw new Error("Runnable migration hash inventory is not exact");
}
const sha256 = async (path: string) => {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").toUpperCase();
};
for (const name of approvedOrder) {
  const expected = approvedHashes[name];
  if (!/^[0-9A-F]{64}$/.test(expected ?? "")) {
    throw new Error(`Runnable migration hash is missing or invalid: ${name}`);
  }
  if (await sha256(`supabase/migrations/${name}`) !== expected) {
    throw new Error(`Runnable migration checksum mismatch: ${name}`);
  }
}
const archivedHashes = manifest.denylistedLegacyMigrations ?? {};
const archivedDirectory =
  "supabase/legacy-migrations/incompatible-profiles-user-roles";
const archivedFiles = [];
for await (const entry of Deno.readDir(archivedDirectory)) {
  if (entry.isFile && entry.name.endsWith(".sql")) {
    archivedFiles.push(entry.name);
  }
}
archivedFiles.sort();
if (
  JSON.stringify(archivedFiles) !==
    JSON.stringify(Object.keys(archivedHashes).sort())
) {
  throw new Error("Archived migration hash inventory is not exact");
}
for (const [name, expected] of Object.entries(archivedHashes)) {
  if (!/^[0-9A-F]{64}$/.test(expected)) {
    throw new Error(`Archived migration hash is invalid: ${name}`);
  }
  const path = `${archivedDirectory}/${name}`;
  if (await sha256(path) !== expected) {
    throw new Error(`Archived migration checksum mismatch: ${name}`);
  }
}

console.log(
  "Local-only safety and readiness gate passed without displaying credentials.",
);
