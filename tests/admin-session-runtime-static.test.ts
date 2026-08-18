const root = new URL("../", import.meta.url);
const runtime = await Deno.readTextFile(
  new URL("supabase/tests/integration/ci/edge-functions-local.test.ts", root),
);
const bootstrap = await Deno.readTextFile(
  new URL(
    "supabase/tests/integration/ci/auth-fixture-bootstrap-local.ts",
    root,
  ),
);

Deno.test("session authorization runtime matrix is complete", () => {
  for (
    const required of [
      "admin-session-authorization",
      "Active Admin session was rejected",
      "Ordinary session was authorized",
      "Inactive session was authorized",
      "Missing bearer session was accepted",
      "Invalid bearer session was accepted",
      "verified_identity",
      'role: "Admin"',
      'status: "Active"',
    ]
  ) {
    if (!runtime.includes(required)) {
      throw new Error(`Session runtime case missing: ${required}`);
    }
  }
});

Deno.test("session revalidation uses a dedicated restorable local fixture", () => {
  for (
    const required of [
      'label: "session-revalidation-admin"',
      'email: "runner-session-revalidation@bci.invalid"',
      'category: "session-revalidation"',
    ]
  ) {
    if (!bootstrap.includes(required)) {
      throw new Error(`Session fixture control missing: ${required}`);
    }
  }
  for (
    const required of [
      "BCI_LOCAL_SERVICE_ROLE_KEY",
      "deleteMapping(userId)",
      'insertMapping(userId, "Admin", "Inactive")',
      'insertMapping(userId, "Admin", "Active")',
      "finally",
      "mappingIsRestored(userId)",
    ]
  ) {
    if (!runtime.includes(required)) {
      throw new Error(`Session restoration control missing: ${required}`);
    }
  }
  if (
    /\b(update|patch)\b/i.test(
      runtime.slice(
        runtime.indexOf("const deleteMapping"),
        runtime.indexOf("Deno.test({"),
      ),
    )
  ) {
    throw new Error(
      "Session fixture attempts an unapproved UPDATE/PATCH grant path",
    );
  }
});

Deno.test("session runtime test does not expose credentials or token material", () => {
  for (
    const forbidden of [
      "console.log",
      "console.error",
      "Deno.stdout",
      "Deno.stderr",
      "JSON.stringify(serviceHeaders)",
      "JSON.stringify(revalidationToken)",
    ]
  ) {
    if (runtime.includes(forbidden)) {
      throw new Error(`Sensitive output primitive found: ${forbidden}`);
    }
  }
});
