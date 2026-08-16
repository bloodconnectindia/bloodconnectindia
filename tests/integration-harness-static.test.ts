const root = new URL("../supabase/tests/integration/", import.meta.url);
const required = [
  "_disposable_guard.sql", "00_baseline_assertions.sql", "01_identity_fixtures.sql",
  "02_identity_negative_cases.sql", "03_post_security_verification.sql",
  "04_post_demo_verification.sql", "05_rls_acl_matrix.sql",
  "06_failure_concurrency_cases.md", "TEST_RUNBOOK.md"
];
const preparedCi = [
  "ci/verified-operational-acl.sql", "ci/rls-acl-local.sql",
  "ci/edge-functions-local.test.ts", "ci/concurrency-replay-local.sh",
  "ci/concurrency-replay-local.test.ts", "ci/inbucket-recovery-local.test.ts",
];

Deno.test("integration harness is complete and guarded", async () => {
  for (const name of required) {
    const text = await Deno.readTextFile(new URL(name, root));
    if (!text.trim()) throw new Error(`${name} is empty`);
    if (name.endsWith(".sql") && name !== "_disposable_guard.sql" && !text.includes("\\ir _disposable_guard.sql")) throw new Error(`${name} lacks disposable guard`);
  }
});

Deno.test("remaining disposable integration components are prepared", async () => {
  for (const name of preparedCi) {
    if (!(await Deno.readTextFile(new URL(name, root))).trim()) throw new Error(`${name} is empty`);
  }
});

Deno.test("harness contains only fake reserved identities and no live connection material", async () => {
  const joined = (await Promise.all(required.map(name => Deno.readTextFile(new URL(name, root))))).join("\n");
  const forbidden = [/supabase\.co/i, /postgres(?:ql)?:\/\//i, /service[_-]?role/i, /olgsgkztorkobuxeyhvb/i, /@(?:gmail|outlook|yahoo)\./i];
  for (const pattern of forbidden) if (pattern.test(joined)) throw new Error(`Forbidden live/secret reference: ${pattern}`);
  if (!joined.includes("@bci.invalid")) throw new Error("Reserved fake identity domain is missing");
});

Deno.test("runbook preserves the controlled migration order", async () => {
  const text = await Deno.readTextFile(new URL("TEST_RUNBOOK.md", root));
  const names = ["202608120002_users_identity_preflight.sql", "202608120003_users_identity_unique_index.sql", "202608120001_security_authorization_and_request_controls.sql", "202608120004_live_aligned_demo_lifecycle.sql"];
  let position = -1;
  for (const name of names) { const next = text.indexOf(name); if (next <= position) throw new Error(`Migration order is missing or incorrect at ${name}`); position = next; }
});
