const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const [baseline, adapter, driver, cleanup, workflow, config] = await Promise
  .all([
    read("supabase/tests/integration/ci/disposable-baseline.sql"),
    read("supabase/tests/integration/ci/auth-identity-adapter.sql"),
    read("scripts/ci/run-disposable-integration-phase.sh"),
    read("scripts/ci/cleanup-disposable-integration.sh"),
    read(".github/workflows/disposable-integration-tests.yml"),
    read("supabase/config.toml"),
  ]);

Deno.test("baseline is minimal, guarded, and live-aligned", () => {
  for (
    const relation of [
      "public.users",
      "public.donors",
      "public.blood_requests",
      "public.blood_stock",
      "public.blood_banks",
      "public.hospitals",
    ]
  ) {
    if (!baseline.includes(relation)) {
      throw new Error(`Missing baseline relation: ${relation}`);
    }
  }
  for (
    const column of [
      "user_id text",
      "role text",
      "status text",
      "patient_name text",
      "blood_group text",
      "hospital text",
      "mobile text",
      "address text",
    ]
  ) {
    if (!baseline.includes(column)) {
      throw new Error(`Missing verified baseline column: ${column}`);
    }
  }
  for (
    const forbidden of [
      "public.profiles",
      "public.user_roles",
      "create table auth.users",
    ]
  ) {
    if (baseline.toLowerCase().includes(forbidden)) {
      throw new Error(`Forbidden baseline assumption: ${forbidden}`);
    }
  }
  if (/^\s*demo_batch_id\s+/mi.test(baseline)) {
    throw new Error("Baseline prematurely defines demo_batch_id");
  }
});

Deno.test("adapter uses native Auth and reserved fake identities only", () => {
  if (
    !adapter.includes("insert into auth.users") ||
    !adapter.includes("@bci.invalid")
  ) throw new Error("Native fake Auth adapter missing");
  for (const forbidden of ["password", "service_role", "supabase.co"]) {
    if (adapter.toLowerCase().includes(forbidden)) {
      throw new Error(`Unsafe adapter material: ${forbidden}`);
    }
  }
});

Deno.test("phase allowlist and exact controlled order are present", () => {
  const phases = [
    "start-local-stack",
    "runtime-environment",
    "baseline",
    "schema-preflight",
    "identity-negative",
    "identity-clean",
    "identity-foundation",
    "identity-evidence",
    "identity-index",
    "authorization-migration",
    "authorization-verification",
    "demo-migration",
    "demo-verification",
    "auth-fixtures",
    "edge-functions",
    "concurrency-replay",
    "password-recovery",
  ];
  const dispatcher = driver.slice(driver.lastIndexOf('case "$phase" in'));
  let position = -1;
  for (const phase of phases) {
    const next = dispatcher.indexOf(`${phase})`);
    if (next <= position) {
      throw new Error(`Phase missing or out of dispatcher order: ${phase}`);
    }
    position = next;
  }
  if (!driver.includes("unknown-phase") || !driver.includes("exit 64")) {
    throw new Error("Unknown phase does not fail closed");
  }
});

Deno.test("driver is approval-gated and loopback-only", () => {
  for (
    const required of [
      "PHASE_DRIVER_APPROVED",
      "approval-marker-missing",
      "BCI_DISPOSABLE_APPROVAL",
      "127.0.0.1",
      "54322",
      "/postgres",
      "remote-link-state",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Missing driver guard: ${required}`);
    }
  }
  if (!config.includes('project_id = "bloodconnectindia-disposable-ci"')) {
    throw new Error("Disposable project ID missing");
  }
});

Deno.test("migration discovery is quarantined and restored with checksum verification", () => {
  const phase = driver.slice(driver.lastIndexOf("start-local-stack)"));
  const validation = phase.indexOf("validate_migrations");
  const move = phase.indexOf(
    'mv -- supabase/migrations/*.sql "$state_dir/migrations/"',
  );
  const start = phase.indexOf('"$supabase_bin" start');
  if (validation < 0 || move <= validation || start <= move) {
    throw new Error(
      "Approved hashes are not verified before quarantine/startup",
    );
  }
  for (
    const required of [
      "manifest.sha256",
      "sha256sum --check",
      "validate-migration-runner.ps1",
      "migration-quarantine-not-empty",
    ]
  ) {
    if (!cleanup.includes(required)) {
      throw new Error(`Cleanup verification missing: ${required}`);
    }
  }
  if (!workflow.includes("cleanup-disposable-integration.sh")) {
    throw new Error("Always-run workflow cleanup does not restore migrations");
  }
  if (/cleanup-disposable-integration\.sh\s*\|\|\s*true/.test(workflow)) {
    throw new Error("Cleanup failure is suppressed");
  }
});

Deno.test("index is outside a wrapper transaction and ordered before authorization", () => {
  const index = driver.indexOf("202608120003_users_identity_unique_index.sql");
  const verification = driver.indexOf("verify-identity-index.sql");
  const authorization = driver.indexOf(
    "202608120001_security_authorization_and_request_controls.sql",
  );
  if (index < 0 || verification <= index || authorization <= verification) {
    throw new Error("Controlled index ordering is incorrect");
  }
  const phase = driver.slice(
    driver.lastIndexOf("identity-index)", index),
    driver.indexOf("authorization-migration)"),
  );
  if (phase.includes("psql_atomic_file")) {
    throw new Error("Concurrent index phase is transaction-wrapped");
  }
  for (
    const required of [
      "cleanup-failed-identity-index.sql",
      "identity-index-failed-retry-required",
      "identity-index-cleanup-refused",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Concurrent index failure control missing: ${required}`);
    }
  }
});

Deno.test("approved mutating files use the atomic psql helper only", () => {
  for (
    const required of [
      "psql_atomic_file supabase/tests/integration/ci/disposable-baseline.sql",
      "psql_atomic_file supabase/tests/integration/ci/auth-identity-adapter.sql",
      'psql_atomic_file "$state_dir/migrations/202608110002_canonical_identity_foundation.sql"',
      'psql_atomic_file "$state_dir/migrations/202608120001_security_authorization_and_request_controls.sql"',
      'psql_atomic_file "$state_dir/migrations/202608120004_live_aligned_demo_lifecycle.sql"',
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Atomic mutation dispatch missing: ${required}`);
    }
  }
  if (!driver.includes("--single-transaction --set=ON_ERROR_STOP=1")) {
    throw new Error("Atomic psql helper is incomplete");
  }
});

Deno.test("no remote-management command, remote URL, or unsanitized output primitive exists", () => {
  const combined = [driver, workflow, cleanup].join("\n").toLowerCase();
  for (
    const forbidden of [
      "supabase " + "login",
      "supabase " + "link",
      "supabase db " + "push",
      "supabase functions " + "deploy",
      "supabase.co",
      "printenv",
      "env |",
      "set -x",
    ]
  ) {
    if (combined.includes(forbidden)) {
      throw new Error(`Forbidden executable content: ${forbidden}`);
    }
  }
  if (!driver.includes("result()") || !driver.includes('"status"')) {
    throw new Error("Structured phase result missing");
  }
});
