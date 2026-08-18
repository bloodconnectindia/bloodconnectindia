const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const manifest = JSON.parse(await read("supabase/migration-manifest.json"));
const validator = await read("supabase/scripts/validate-migration-runner.ps1");
const guard = await read("scripts/ci/disposable-integration-guard.ts");
const driver = await read("scripts/ci/run-disposable-integration-phase.sh");
const cleanup = await read("scripts/ci/cleanup-disposable-integration.sh");
const workflow = await read(".github/workflows/disposable-integration-tests.yml");
const aclRunner = await read(
  "supabase/tests/integration/ci/run-rls-acl-cases.sh",
);
const explicitDeny = await read(
  "supabase/tests/integration/ci/runtime-auth-fixture-security.sql",
);

const approved = [
  [
    "202608110001_authoritative_schema_preflight.sql",
    "D65F966AEA1F61004947732F3F863B8BE88541B661519B693E95C1C4344FD448",
  ],
  [
    "202608110002_canonical_identity_foundation.sql",
    "6684DD234648879AE9007BB4D5FF50E5859DF894AFB24C1B650226B595914FA8",
  ],
  [
    "202608120001_security_authorization_and_request_controls.sql",
    "08176043A7DF3BD196F4BC0ACBE4FEA03115F91172F6F73B6CF6EB149C54F13D",
  ],
  [
    "202608120004_live_aligned_demo_lifecycle.sql",
    "F97C19D5C935489B104D82338D934024133C437EFF1E2C431D547ECEF450E7B5",
  ],
] as const;

const sha256 = async (path: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await Deno.readFile(new URL(path, root)),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").toUpperCase();
};

Deno.test("runnable migration order and approved hashes are exact", async () => {
  const names = approved.map(([name]) => name);
  if (JSON.stringify(manifest.runnableMigrations) !== JSON.stringify(names)) {
    throw new Error("Runnable migration order is not exact");
  }
  const hashNames = Object.keys(manifest.runnableMigrationSha256).sort();
  if (JSON.stringify(hashNames) !== JSON.stringify([...names].sort())) {
    throw new Error("Runnable hash inventory has missing or extra entries");
  }
  for (const [name, expected] of approved) {
    if (manifest.runnableMigrationSha256[name] !== expected) {
      throw new Error(`Manifest hash mismatch: ${name}`);
    }
    if (await sha256(`supabase/migrations/${name}`) !== expected) {
      throw new Error(`Migration content hash mismatch: ${name}`);
    }
  }
});

Deno.test("both readiness guards verify runnable and archived content", () => {
  for (const text of [validator, guard]) {
    for (const required of [
      "runnableMigrationSha256",
      "Runnable migration",
      "denylistedLegacyMigrations",
      "checksum mismatch",
    ]) {
      if (!text.includes(required)) {
        throw new Error(`Migration integrity guard missing: ${required}`);
      }
    }
  }
  const phase = driver.slice(driver.lastIndexOf("start-local-stack)"));
  const validation = phase.indexOf("validate_migrations");
  const quarantine = phase.indexOf(
    'mv -- supabase/migrations/*.sql "$state_dir/migrations/"',
  );
  if (validation < 0 || quarantine <= validation) {
    throw new Error("Driver does not validate approved hashes before quarantine");
  }
});

Deno.test("ACL and persistent explicit-deny mutations are atomic", () => {
  if (!aclRunner.includes("--single-transaction --set=ON_ERROR_STOP=1")) {
    throw new Error("57-entry ACL adapter is not atomic");
  }
  if (!/^begin;$/m.test(explicitDeny) || !/^commit;$/m.test(explicitDeny)) {
    throw new Error("Persistent explicit-deny fixture is not transaction wrapped");
  }
});

Deno.test("restoration failure is visible and approved hashes are revalidated", () => {
  for (const required of [
    "sha256sum --check",
    "validate-migration-runner.ps1",
    "migration-quarantine-not-empty",
    "migration-restore-collision",
    "cleanup-state-not-empty",
  ]) {
    if (!cleanup.includes(required)) {
      throw new Error(`Cleanup safeguard missing: ${required}`);
    }
  }
  if (/cleanup-disposable-integration\.sh\s*\|\|\s*true/.test(workflow)) {
    throw new Error("Workflow suppresses restoration failure");
  }
  for (const required of ["restoration_status", "exit \"$restoration_status\""]) {
    if (!workflow.includes(required)) {
      throw new Error(`Workflow restoration status handling missing: ${required}`);
    }
  }
});
