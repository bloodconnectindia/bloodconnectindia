import {
  canonicalJson,
  selectFirstFailure,
  validateComposeText,
} from "../scripts/ci/verify-compose-source.ts";
import { verifyDockerBindings } from "../scripts/ci/verify-docker-bindings.ts";

const root = new URL("../", import.meta.url);
const compose = await Deno.readTextFile(
  new URL("compose/compose.loopback.yaml", root),
);
const driver = await Deno.readTextFile(
  new URL("scripts/ci/run-disposable-integration-phase.sh", root),
);
const cleanup = await Deno.readTextFile(
  new URL("scripts/ci/cleanup-disposable-integration.sh", root),
);
const runtime = await Deno.readTextFile(
  new URL("scripts/ci/prepare-compose-runtime.ts", root),
);
const manifestText = await Deno.readTextFile(
  new URL("compose/source-manifest.json", root),
);
const manifest = JSON.parse(manifestText);

const rejected = (candidate: string) => {
  try {
    validateComposeText(candidate);
    return false;
  } catch {
    return true;
  }
};

const validateDriver = (candidate: string) => {
  for (
    const required of [
      "approval-marker-missing",
      "approval-marker-stale",
      "source-manifest-integrity-failed",
      "remote-link-state",
      "NONLOOP_LISTENERS",
      "nonloop-listeners-detected",
      "post-start-binding-inspection",
      "HostConfig.PortBindings",
      "NetworkSettings.Ports",
      "com.docker.compose.project",
      "bloodconnectindia-disposable-loopback",
    ]
  ) {
    if (!candidate.includes(required)) {
      throw new Error(`Driver guard missing: ${required}`);
    }
  }
  if (
    candidate.includes('"$supabase_bin" start') ||
    candidate.includes("functions serve")
  ) {
    throw new Error("Legacy startup accepted");
  }
};

Deno.test("canonical manifest and exact topology pass static validation", () => {
  if (manifestText !== `${canonicalJson(manifest)}\n`) {
    throw new Error("Manifest is not canonical");
  }
  validateComposeText(compose);
});

Deno.test("image, publication, network, and migration mutations fail closed", () => {
  const mutations = [
    compose.replace("@sha256:5e52ca", "@sha256:000000"),
    compose.replace(/@sha256:5e52ca[^\s]+/, ""),
    compose.replace("host_ip: 127.0.0.1", "host_ip: 0.0.0.0"),
    compose.replace("        host_ip: 127.0.0.1\n", ""),
    compose.replace('published: "54321"', 'published: "8000"'),
    compose.replace(
      "name: bloodconnectindia-disposable-loopback",
      "name: bridge",
    ),
    `${compose}\n# supabase/migrations:/docker-entrypoint-initdb.d\n`,
    compose.replace(
      '      - name: api-loopback\n        target: 8000\n        published: "54321"\n        host_ip: 127.0.0.1\n        protocol: tcp\n        app_protocol: http\n        mode: host',
      '      - "127.0.0.1:54321:8000"',
    ),
  ];
  if (mutations.some((value) => !rejected(value))) {
    throw new Error("Unsafe Compose mutation accepted");
  }
});

Deno.test("approval, source integrity, listener, and post-start inspection precede use", () => {
  for (
    const required of [
      "PHASE_DRIVER_APPROVED",
      "approval-marker-stale",
      "verify-compose-source.ts",
      "source-manifest-integrity-failed",
      "NONLOOP_LISTENERS",
      "post-start-binding-inspection",
      "compose up --detach --wait",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Driver guard missing: ${required}`);
    }
  }
  const phase = driver.slice(driver.lastIndexOf("start-local-stack)"));
  const up = phase.indexOf("compose up --detach --wait");
  const identity = phase.indexOf("verify_project_and_bindings", up);
  const nonloop = phase.indexOf("NONLOOP_LISTENERS", identity);
  const readiness = phase.indexOf("verify_required_readiness", nonloop);
  const trusted = phase.indexOf('touch "$state_dir/stack-started"', readiness);
  if (
    up < 0 || identity <= up || nonloop <= identity || readiness <= nonloop ||
    trusted <= readiness
  ) {
    throw new Error(
      "Trusted stack marker precedes a post-start verification gate",
    );
  }
  if (
    driver.includes('"$supabase_bin" start') ||
    driver.includes("functions serve")
  ) {
    throw new Error("Supabase-managed startup remains executable");
  }
  validateDriver(driver);
  for (
    const guard of [
      "approval-marker-stale",
      "source-manifest-integrity-failed",
      "remote-link-state",
      "NONLOOP_LISTENERS",
      "post-start-binding-inspection",
    ]
  ) {
    let failed = false;
    try {
      validateDriver(driver.replaceAll(guard, "removed-guard"));
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`Weakened driver accepted: ${guard}`);
  }
});

Deno.test("runtime secrets are temp-only and never printed", () => {
  for (
    const required of [
      "crypto.getRandomValues",
      "createNew: true",
      "mode: 0o600",
      "renderKong",
      "SUPABASE_INTERNAL_FUNCTIONS_CONFIG",
      "pgsodium_root.key",
      "BCI_RUNNER_TEMP_NATIVE",
    ]
  ) {
    if (!runtime.includes(required)) {
      throw new Error(`Runtime control missing: ${required}`);
    }
  }
  for (
    const forbidden of [
      "console.error",
      "Deno.env.toObject",
      "JSON.stringify(stackEnv)",
    ]
  ) {
    if (runtime.includes(forbidden)) {
      throw new Error(`Secret output primitive: ${forbidden}`);
    }
  }
  if (
    !cleanup.includes("bci-compose-$run_id") ||
    !cleanup.includes("emergency_secret_cleanup")
  ) {
    throw new Error("Runtime secret cleanup precedence missing");
  }
  for (
    const required of [
      "--project-name bloodconnectindia-disposable-ci",
      "--file compose/compose.loopback.yaml",
      "compose down --volumes --remove-orphans",
      "verify_compose_cleanup_scope",
    ]
  ) {
    if (!cleanup.includes(required)) {
      throw new Error(`Cleanup scope guard missing: ${required}`);
    }
  }
});

Deno.test("both Docker binding structures fail closed for every unsafe mutation", () => {
  const network = '{"bloodconnectindia-disposable-loopback":{}}';
  const valid = '{"8000/tcp":[{"HostIp":"127.0.0.1","HostPort":"54321"}]}';
  verifyDockerBindings("kong", valid, valid, network);
  verifyDockerBindings("auth", "{}", '{"9999/tcp":null}', network);
  const unsafe: Array<[string, string, string, string]> = [
    ["kong", valid, "{}", network],
    ["kong", "{}", valid, network],
    [
      "kong",
      valid.replace("127.0.0.1", ""),
      valid.replace("127.0.0.1", ""),
      network,
    ],
    [
      "kong",
      valid.replace("127.0.0.1", "0.0.0.0"),
      valid.replace("127.0.0.1", "0.0.0.0"),
      network,
    ],
    [
      "kong",
      valid.replace("127.0.0.1", "::"),
      valid.replace("127.0.0.1", "::"),
      network,
    ],
    [
      "kong",
      valid.replace("127.0.0.1", "[::]"),
      valid.replace("127.0.0.1", "[::]"),
      network,
    ],
    [
      "kong",
      valid.replace("127.0.0.1", "192.168.1.4"),
      valid.replace("127.0.0.1", "192.168.1.4"),
      network,
    ],
    [
      "kong",
      valid.replace("54321", "54323"),
      valid.replace("54321", "54323"),
      network,
    ],
    [
      "auth",
      '{"9999/tcp":[{"HostIp":"127.0.0.1","HostPort":"54321"}]}',
      '{"9999/tcp":[{"HostIp":"127.0.0.1","HostPort":"54321"}]}',
      network,
    ],
    ["kong", valid, valid, '{"bridge":{}}'],
  ];
  for (const args of unsafe) {
    let failed = false;
    try {
      verifyDockerBindings(...args);
    } catch {
      failed = true;
    }
    if (!failed) {
      throw new Error(`Unsafe Docker binding accepted: ${args.join("|")}`);
    }
  }
});

Deno.test("partial starts are untrusted but remain cleanup-eligible", () => {
  const attempt = driver.indexOf('touch "$state_dir/compose-start-attempted"');
  const up = driver.indexOf("compose up --detach --wait", attempt);
  const trusted = driver.indexOf('touch "$state_dir/stack-started"', up);
  if (attempt < 0 || up <= attempt || trusted <= up) {
    throw new Error("Compose attempt/trust ordering rejected");
  }
  if (
    !cleanup.includes('[[ -f "$state_dir/compose-start-attempted" ]]') ||
    !cleanup.includes("compose down --volumes --remove-orphans")
  ) {
    throw new Error("Partial Compose start is not teardown-eligible");
  }
});

Deno.test("cleanup preserves the first meaningful failure deterministically", () => {
  const cases: Array<[number[], number]> = [
    [[17, 23], 17],
    [[0, 23], 23],
    [[0, 0, 31], 31],
    [[17, 23, 31], 17],
  ];
  for (const [statuses, expected] of cases) {
    if (selectFirstFailure(statuses) !== expected) {
      throw new Error("Cleanup precedence rejected");
    }
  }
  for (
    const required of [
      "first_failure=0",
      "record_failure()",
      "if (( first_failure == 0 ))",
      'exit "$first_failure"',
    ]
  ) {
    if (!cleanup.includes(required)) {
      throw new Error(`Cleanup aggregation missing: ${required}`);
    }
  }
});

Deno.test("manifest binds provenance, assets, helpers, and application inputs", () => {
  if (
    manifest.provenance.repository !== "https://github.com/supabase/cli.git" ||
    manifest.provenance.commitTree !==
      "fddbcd3a72c24152043b275924917e4040aceab0"
  ) {
    throw new Error("Immutable CLI provenance missing");
  }
  for (
    const path of [
      "compose/compose.loopback.yaml",
      "compose/vendor/supabase-cli/schema.sql",
      "compose/vendor/supabase-cli/webhook.sql",
      "compose/vendor/supabase-cli/_supabase.sql",
      "compose/vendor/supabase-cli/kong.yml",
      "compose/vendor/supabase-cli/main.ts",
      "scripts/ci/prepare-compose-runtime.ts",
      "scripts/ci/verify-compose-source.ts",
      "scripts/ci/verify-docker-bindings.ts",
      "scripts/ci/cleanup-disposable-integration.sh",
      "scripts/local/run-disposable-integration-phase.ps1",
      "supabase/config.toml",
    ]
  ) {
    if (!manifest.bundleFiles[path]) {
      throw new Error(`Manifest hash missing: ${path}`);
    }
  }
});
