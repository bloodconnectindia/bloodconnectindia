const workflowPath = new URL(
  "../.github/workflows/disposable-integration-tests.yml",
  import.meta.url,
);
const workflow = await Deno.readTextFile(workflowPath);
const guard = await Deno.readTextFile(
  new URL("../scripts/ci/disposable-integration-guard.ts", import.meta.url),
);
const phaseDriver = await Deno.readTextFile(
  new URL("../scripts/ci/run-disposable-integration-phase.sh", import.meta.url),
);

Deno.test("workflow is manual-only, serialized, time-limited, and has teardown", () => {
  if (!/^on:\s*\n\s+workflow_dispatch:/m.test(workflow)) {
    throw new Error("workflow_dispatch trigger missing");
  }
  for (
    const forbiddenTrigger of [
      "push:",
      "pull_request:",
      "schedule:",
      "repository_dispatch:",
    ]
  ) {
    if (workflow.includes(forbiddenTrigger)) {
      throw new Error(`Forbidden trigger: ${forbiddenTrigger}`);
    }
  }
  for (
    const required of [
      "runs-on: ubuntu-24.04",
      "timeout-minutes: 35",
      "concurrency:",
      "cancel-in-progress: false",
      "if: ${{ always() }}",
      "bash scripts/ci/cleanup-disposable-integration.sh",
    ]
  ) {
    if (!workflow.includes(required)) {
      throw new Error(`Missing workflow control: ${required}`);
    }
  }
});

Deno.test("actions and runtimes are fixed versions", () => {
  const uses = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map((match) =>
    match[1]
  );
  if (
    !uses.length ||
    uses.some((value) => /@(v?\d+|main|master|latest)$/.test(value))
  ) throw new Error("Unbounded action version found");
  for (
    const required of [
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "denoland/setup-deno@667a34cdef165d8d2b2e98dde39547c9daac7282",
      "deno-version: 2.8.1",
    ]
  ) {
    if (!workflow.includes(required)) {
      throw new Error(`Missing fixed version: ${required}`);
    }
  }
});

Deno.test("workflow has no Supabase CLI runtime dependency", () => {
  for (
    const forbidden of [
      "supabase/setup-cli",
      "Install pinned Supabase CLI",
      "BCI_SUPABASE_BIN",
      "supabase_bin",
    ]
  ) {
    if (workflow.includes(forbidden)) {
      throw new Error(`Supabase CLI runtime dependency remains: ${forbidden}`);
    }
  }
});

Deno.test("workflow contains no remote-management or deployment command", () => {
  const forbidden = [
    "supabase " + "login",
    "supabase " + "link",
    "supabase db " + "push",
    "supabase functions " + "deploy",
  ];
  for (const command of forbidden) {
    if (workflow.toLowerCase().includes(command)) {
      throw new Error(`Forbidden command: ${command}`);
    }
  }
  if (
    /https?:\/\/[\w.-]*supabase\.co/i.test(workflow) ||
    /postgres(?:ql)?:\/\/(?!postgres:postgres@(?:127\.0\.0\.1|localhost|\[::1\]))/i
      .test(workflow)
  ) throw new Error("Remote endpoint found");
});

Deno.test("guard enforces loopback, approval, credential absence, and readiness", () => {
  for (
    const required of [
      "workflow_dispatch",
      "RUN_DISPOSABLE_LOCAL_INTEGRATION",
      "127.0.0.1",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      ".supabase/project-ref",
      "PHASE_DRIVER_APPROVED",
    ]
  ) {
    if (!guard.includes(required)) {
      throw new Error(`Guard requirement missing: ${required}`);
    }
  }
  for (
    const required of [
      "PHASE_DRIVER_APPROVED",
      "approval-marker-missing",
      "127.0.0.1",
      "54322",
      "unknown-phase",
    ]
  ) {
    if (!phaseDriver.includes(required)) {
      throw new Error(`Phase readiness control missing: ${required}`);
    }
  }
});

Deno.test("workflow prepares the isolated runtime before database and Edge phases", () => {
  const start = workflow.indexOf(
    "run-disposable-integration-phase.sh start-local-stack",
  );
  const runtime = workflow.indexOf(
    "run-disposable-integration-phase.sh runtime-environment",
  );
  const baseline = workflow.indexOf(
    "run-disposable-integration-phase.sh baseline",
  );
  if (start < 0 || runtime <= start || baseline <= runtime) {
    throw new Error(
      "Disposable runtime preparation is missing or out of order",
    );
  }
  for (
    const required of [
      "tests/disposable-runtime-env-static.test.ts",
      "tests/local-tool-resolution-static.test.ts",
      "tests/admin-session-runtime-static.test.ts",
    ]
  ) {
    if (!workflow.includes(required)) {
      throw new Error(`Group 2 static safety test missing: ${required}`);
    }
  }
});

Deno.test("static safety explicitly enforces both reviewed ACL contracts", () => {
  for (
    const required of [
      "tests/authoritative-acl-adapter-static.test.ts",
      "tests/task14-integration-components-static.test.ts",
    ]
  ) {
    const occurrences =
      workflow.match(new RegExp(required.replaceAll(".", "\\."), "g")) ?? [];
    if (occurrences.length !== 1) {
      throw new Error(
        `ACL static test is not explicitly enforced once: ${required}`,
      );
    }
  }
  if (
    /deno test[^\n]*(?:\stests\s*$|tests\/\*|--allow-all|-A)/m.test(workflow)
  ) {
    throw new Error(
      "Static safety job does not use an explicit safe-test allowlist",
    );
  }
});
