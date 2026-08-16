const root = new URL("../", import.meta.url);
const bootstrap = await Deno.readTextFile(
  new URL(
    "supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts",
    root,
  ),
);
const linkage = await Deno.readTextFile(
  new URL(
    "supabase/tests/integration/ci/runtime-auth-fixture-security.sql",
    root,
  ),
);
const driver = await Deno.readTextFile(
  new URL("scripts/ci/run-disposable-integration-phase.sh", root),
);
const workflow = await Deno.readTextFile(
  new URL(".github/workflows/disposable-integration-tests.yml", root),
);

Deno.test("bootstrap contains the required fake identity categories", () => {
  for (
    const label of [
      "ordinary-active",
      "inactive-user",
      "admin",
      "future-super-admin",
      "explicitly-denied-admin",
      "demo-only",
      "malformed-demo",
      "password-recovery-admin",
    ]
  ) {
    if (!bootstrap.includes(`label: "${label}"`)) {
      throw new Error(`Fixture missing: ${label}`);
    }
  }
  const emails = [...bootstrap.matchAll(/email:\s*"([^"]+)"/g)].map((match) =>
    match[1]
  );
  if (
    emails.length < 8 || emails.some((email) => !email.endsWith("@bci.invalid"))
  ) throw new Error("Non-reserved fixture email found");
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(bootstrap)
  ) throw new Error("Hardcoded fixture UUID found");
});

Deno.test("Auth creation uses only supported loopback Admin and REST APIs", () => {
  for (
    const required of [
      "http://127.0.0.1:54321",
      "/auth/v1/admin/users",
      "/rest/v1/users",
      "AbortController",
      "BCI_LOCAL_SERVICE_ROLE_KEY",
    ]
  ) {
    if (!bootstrap.includes(required)) {
      throw new Error(`Bootstrap control missing: ${required}`);
    }
  }
  if (/insert\s+into\s+auth\.users/i.test(bootstrap)) {
    throw new Error("Bootstrap directly manipulates auth.users");
  }
  for (
    const forbidden of [
      "supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY",
      "postgresql://",
      "localhost:",
    ]
  ) {
    if (bootstrap.includes(forbidden)) {
      throw new Error(`Unsafe bootstrap target/material: ${forbidden}`);
    }
  }
});

Deno.test("credentials remain generated runner environment values and are never logged", () => {
  for (
    const required of [
      "crypto.getRandomValues",
      "GITHUB_ENV",
      "RUNNER_TEMP",
      "mode: 0o600",
    ]
  ) {
    if (!bootstrap.includes(required)) {
      throw new Error(`Credential handling missing: ${required}`);
    }
  }
  for (
    const forbidden of [
      "console.log",
      "console.error",
      "Deno.stdout",
      "Deno.stderr",
      'password: "',
    ]
  ) {
    if (bootstrap.includes(forbidden)) {
      throw new Error(
        `Secret-output or hardcoded-password primitive: ${forbidden}`,
      );
    }
  }
  if (
    !bootstrap.includes(
      'Pick<Fixture, "label" | "role" | "status" | "category">',
    )
  ) throw new Error("Safe manifest type is not restricted to approved fields");
});

Deno.test("cleanup and explicit-deny linkage remain disposable and guarded", () => {
  for (
    const required of [
      "--cleanup",
      "deleteFixture",
      "safe.reverse()",
      "manifestPath",
    ]
  ) {
    if (!bootstrap.includes(required)) {
      throw new Error(`Cleanup control missing: ${required}`);
    }
  }
  if (
    !linkage.includes("\\ir ../_disposable_guard.sql") ||
    !linkage.includes("runner-denied-admin@bci.invalid") ||
    !linkage.includes("effect='deny'")
  ) throw new Error("Explicit-deny linkage is incomplete");
});

Deno.test("driver wiring is ordered, approval-gated, and still runtime-blocked", () => {
  const fixture = driver.indexOf("auth-fixtures)");
  const edge = driver.indexOf("edge-functions)");
  if (fixture < 0 || edge <= fixture) {
    throw new Error("Auth fixture phase is not ordered before Edge tests");
  }
  for (
    const required of [
      "PHASE_DRIVER_APPROVED",
      "local-auth-url-rejected",
      "local-auth-credential-missing",
      "auth-fixture-bootstrap-local.ts",
      "runtime-auth-fixture-security.sql",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Driver guard missing: ${required}`);
    }
  }
  if (!workflow.includes("run-disposable-integration-phase.sh auth-fixtures")) {
    throw new Error("Workflow dependency wiring missing");
  }
});
