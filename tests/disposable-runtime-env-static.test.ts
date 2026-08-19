import {
  parseDisposableStatus,
  pathIsBelow,
} from "../scripts/ci/prepare-disposable-runtime-env.ts";

const root = new URL("../", import.meta.url);
const source = await Deno.readTextFile(
  new URL("scripts/ci/prepare-disposable-runtime-env.ts", root),
);
const driver = await Deno.readTextFile(
  new URL("scripts/ci/run-disposable-integration-phase.sh", root),
);
const cleanup = await Deno.readTextFile(
  new URL("scripts/ci/cleanup-disposable-integration.sh", root),
);

const key = (character: string) => `${character}`.repeat(40);
const validStatus = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  `ANON_KEY="${key("a")}"`,
  `SERVICE_ROLE_KEY="${key("s")}"`,
].join("\n");

Deno.test("runtime status parser accepts only the exact disposable targets", () => {
  const parsed = parseDisposableStatus(validStatus);
  if (
    parsed.apiUrl !== "http://127.0.0.1:54321" ||
    new URL(parsed.databaseUrl).hostname !== "127.0.0.1"
  ) throw new Error("Approved loopback status was not preserved");
  for (
    const replacement of [
      ["http://127.0.0.1:54321", "https://project.supabase.co"],
      ["127.0.0.1:54322", "192.168.1.20:54322"],
      ["127.0.0.1:54322", "db.example.test:5432"],
    ]
  ) {
    let rejected = false;
    try {
      parseDisposableStatus(
        validStatus.replace(replacement[0], replacement[1]),
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Unsafe target accepted: ${replacement[1]}`);
  }
});

Deno.test("missing, duplicate, and malformed status output fails closed", () => {
  for (
    const invalid of [
      "",
      validStatus.replace(/^ANON_KEY=.*$/m, ""),
      `${validStatus}\nANON_KEY=${key("b")}`,
      validStatus.replace(/^DB_URL=.*$/m, "DB_URL not-an-assignment"),
      validStatus.replace(key("s"), "short"),
    ]
  ) {
    let rejected = false;
    try {
      parseDisposableStatus(invalid);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Malformed status output was accepted");
  }
});

Deno.test("runtime secret paths remain below disposable temp storage", () => {
  if (!pathIsBelow("C:/runner/temp", "C:/runner/temp/runtime.env")) {
    throw new Error("Valid child path rejected");
  }
  for (
    const unsafe of [
      "C:/runner/runtime.env",
      "C:/runner/temp-other/runtime.env",
      "C:/repository/.env",
    ]
  ) {
    if (pathIsBelow("C:/runner/temp", unsafe)) {
      throw new Error(`Unsafe temp path accepted: ${unsafe}`);
    }
  }
  for (
    const required of [
      "Deno.realPath",
      "createNew: true",
      "mode: 0o600",
      "RUNNER_TEMP",
      "GITHUB_ENV",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Temp safeguard missing: ${required}`);
    }
  }
});

Deno.test("runtime preparation and cleanup never expose secret material", () => {
  for (
    const required of [
      "trap cleanup_runtime_materials EXIT",
      "cleanup_entry_status=$?",
      "temporary-secret-cleanup-failed",
    ]
  ) {
    if (!cleanup.includes(required)) {
      throw new Error(
        `Unconditional secret cleanup control missing: ${required}`,
      );
    }
  }
  for (
    const required of [
      '"$supabase_bin" status -o env',
      "BCI_SUPABASE_STATUS_FILE",
      "bci-runtime-env-",
      "functions serve --env-file",
    ]
  ) {
    if (!driver.includes(required)) {
      throw new Error(`Driver wiring missing: ${required}`);
    }
  }
  for (
    const temporary of [
      '"$runner_temp/bci-auth-fixtures-$run_id.json"',
      '"$runner_temp/bci-supabase-status-$run_id.env"',
      '"$runner_temp/bci-runtime-env-$run_id.env"',
      '"$runner_temp/bci-process-env-$run_id.env"',
      '"$runner_temp/bci-edge-functions-$run_id.env"',
      '"$runner_temp/bci-edge-functions-$run_id.log"',
      '"$edge_pid_file"',
    ]
  ) {
    if (!cleanup.includes(temporary)) {
      throw new Error(`Temporary cleanup missing: ${temporary}`);
    }
  }
  for (
    const forbidden of [
      "console.error",
      "Deno.env.toObject",
      "JSON.stringify(values)",
      "printenv",
      "set -x",
    ]
  ) {
    if (source.includes(forbidden) || driver.includes(forbidden)) {
      throw new Error(`Secret-output primitive found: ${forbidden}`);
    }
  }
});

Deno.test("server-only disposable variables do not enter browser sources", async () => {
  const browserFiles: URL[] = [];
  const collect = async (directory: URL) => {
    for await (const entry of Deno.readDir(directory)) {
      const child = new URL(
        entry.name + (entry.isDirectory ? "/" : ""),
        directory,
      );
      if (entry.isDirectory) await collect(child);
      else if (/\.(?:html|js|ts|tsx|jsx)$/i.test(entry.name)) {
        browserFiles.push(child);
      }
    }
  };
  await collect(new URL("js/", root));
  for await (const entry of Deno.readDir(root)) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      browserFiles.push(new URL(entry.name, root));
    }
  }
  const forbidden = [
    "BCI_LOCAL_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SECURITY_HMAC_KEY",
  ];
  for (const file of browserFiles) {
    const content = await Deno.readTextFile(file);
    for (const name of forbidden) {
      if (content.includes(name)) {
        throw new Error(`Server-only variable ${name} found in browser source`);
      }
    }
  }
});
