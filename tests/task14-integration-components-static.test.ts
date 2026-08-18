const root = new URL("../", import.meta.url);
const files = [
  "supabase/tests/integration/ci/verified-operational-acl.sql",
  "supabase/tests/integration/ci/rls-acl-local.sql",
  "supabase/tests/integration/ci/edge-functions-local.test.ts",
  "supabase/tests/integration/ci/concurrency-replay-local.sh",
  "supabase/tests/integration/ci/concurrency-replay-local.test.ts",
  "supabase/tests/integration/ci/inbucket-recovery-local.test.ts",
  "scripts/ci/run-disposable-integration-phase.sh",
];
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const content = new Map(
  await Promise.all(
    files.map(async (path) => [path, await read(path)] as const),
  ),
);

Deno.test("Task 14 components exist and remain approval gated", () => {
  for (const [path, text] of content) {
    if (!text.trim()) throw new Error(`Empty component: ${path}`);
  }
  const driver = content.get(files.at(-1)!)!;
  for (
    const required of [
      "PHASE_DRIVER_APPROVED",
      "edge-functions-local.test.ts",
      "concurrency-replay-local.sh",
      "inbucket-recovery-local.test.ts",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Driver wiring missing: ${required}`);
    }
  }
});

Deno.test("authoritative ACL adapter remains exact and fail closed", () => {
  const adapter = content.get(files[0])!;
  for (
    const required of [
      "unexpected<>57",
      "raise exception",
      "actual.grantor<>'postgres'",
      "actual.is_grantable",
      "a.attacl is not null",
    ]
  ) {
    if (!adapter.includes(required)) {
      throw new Error(`ACL fail-closed control missing: ${required}`);
    }
  }
});

Deno.test("RLS cases cover all principals, operational relations, deny precedence, and private schemas", () => {
  const rls = content.get(files[1])!;
  for (
    const expected of [
      "anon",
      "authenticated",
      "Ordinary",
      "Admin",
      "Super Admin",
      "Explicit deny",
      "users",
      "donors",
      "blood_requests",
      "blood_stock",
      "blood_banks",
      "hospitals",
      "demo_batches",
      "roles",
      "demo_user_memberships",
    ]
  ) {
    if (!rls.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`RLS coverage missing: ${expected}`);
    }
  }
});

Deno.test("network targets are loopback only and requests have hard aborts", () => {
  const runtime = [files[2], files[4], files[5]].map((path) =>
    content.get(path)!
  ).join("\n");
  const urls = [...runtime.matchAll(/https?:\/\/[^"'`\s]+/g)].map((match) =>
    match[0]
  );
  for (const url of urls) {
    if (!/^http:\/\/127\.0\.0\.1:(3000|3999|54321|54324)/.test(url)) {
      throw new Error(`Non-loopback runtime URL: ${url}`);
    }
  }
  if ((runtime.match(/AbortController/g) ?? []).length < 3) {
    throw new Error("One or more runtime drivers lacks a hard request timeout");
  }
  const shell = content.get(files[3])!;
  if (
    !shell.includes("timeout 105s") ||
    !content.get(files.at(-1)!)!.includes("timeout 120s")
  ) throw new Error("Bounded driver timeout missing");
});

Deno.test("tests do not emit credential or recovery material", () => {
  const runtime = [files[2], files[3], files[4], files[5]].map((path) =>
    content.get(path)!
  ).join("\n");
  for (
    const forbidden of [
      /console\.(?:log|error|warn)/,
      /Deno\.env\.toObject/,
      /printenv/,
      /set -x/,
    ]
  ) {
    if (forbidden.test(runtime)) {
      throw new Error(`Potential secret-output primitive: ${forbidden}`);
    }
  }
});

Deno.test("runtime preparation contains no remote management or deployment command", () => {
  const joined = [...content.values()].join("\n").toLowerCase();
  for (
    const forbidden of [
      "supabase " + "login",
      "supabase " + "link",
      "supabase db " + "push",
      "supabase functions " + "deploy",
      "supabase.co",
    ]
  ) {
    if (joined.includes(forbidden)) {
      throw new Error(`Forbidden remote operation: ${forbidden}`);
    }
  }
});
