const requiredRunId = /^bci-local-[0-9]+-[0-9]+$/;

export const normalizePath = (path: string) => {
  const value = path.replaceAll("\\", "/").replace(/\/$/, "");
  return value.replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
};

export const pathIsBelow = (root: string, candidate: string) => {
  const base = normalizePath(root);
  const value = normalizePath(candidate);
  return value.startsWith(`${base}/`) && !value.split("/").includes("..");
};

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");

const randomSecret = (size = 32) =>
  base64url(crypto.getRandomValues(new Uint8Array(size)));

const jwt = async (role: "anon" | "service_role", secret: string) => {
  const encoder = new TextEncoder();
  const header = base64url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64url(encoder.encode(JSON.stringify({
    role,
    iss: "supabase-demo",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 315360000,
  })));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${header}.${payload}`),
    ),
  );
  return `${header}.${payload}.${base64url(signature)}`;
};

const functionConfig = async (functionsRoot: string) => {
  const config: Record<string, {
    entrypointPath: string;
    importMapPath: string;
    staticFiles: string[];
    verifyJWT: boolean;
  }> = {};
  for await (const entry of Deno.readDir(functionsRoot)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    const entrypoint = `${functionsRoot}/${entry.name}/index.ts`;
    try {
      const stat = await Deno.stat(entrypoint);
      if (!stat.isFile) continue;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
    const importMap = `${functionsRoot}/${entry.name}/deno.json`;
    let importMapPath = "";
    try {
      if ((await Deno.stat(importMap)).isFile) {
        importMapPath = `/home/deno/functions/${entry.name}/deno.json`;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    config[entry.name] = {
      entrypointPath: `/home/deno/functions/${entry.name}/index.ts`,
      importMapPath,
      staticFiles: [],
      verifyJWT: true,
    };
  }
  return JSON.stringify(Object.fromEntries(Object.entries(config).sort()));
};

const renderKong = (template: string, anonKey: string) => {
  const values: Record<string, string> = {
    ApiHost: "127.0.0.1",
    ApiPort: "54321",
    BearerToken: `Bearer ${anonKey}`,
    EdgeRuntimeId: "edge-runtime",
    GotrueId: "auth",
    LogflareId: "analytics-disabled",
    PgmetaId: "meta-disabled",
    PoolerId: "pooler-disabled",
    QueryToken: anonKey,
    RealtimeId: "realtime-disabled",
    RestId: "rest",
    StorageId: "storage-disabled",
    StudioId: "studio-disabled",
  };
  let rendered = template;
  for (const [name, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{ .${name} }}`, value);
  }
  if (/{{\s*\.[A-Za-z0-9_]+\s*}}/.test(rendered)) {
    throw new Error("Kong template contains an unresolved field");
  }
  return rendered;
};

if (import.meta.main) {
  const runnerTemp = Deno.env.get("RUNNER_TEMP") ?? "";
  const runId = Deno.env.get("BCI_TEST_RUN_ID") ?? "";
  const githubEnv = Deno.env.get("GITHUB_ENV") ?? "";
  const nativeRunnerTemp = Deno.env.get("BCI_RUNNER_TEMP_NATIVE") ?? runnerTemp;
  const nativeGithubEnv = Deno.env.get("BCI_GITHUB_ENV_NATIVE") ?? githubEnv;
  if (!runnerTemp || !githubEnv || !requiredRunId.test(runId)) {
    throw new Error("Disposable runtime scope is invalid");
  }
  const realTemp = await Deno.realPath(nativeRunnerTemp);
  const realGithubEnv = await Deno.realPath(nativeGithubEnv);
  if (!pathIsBelow(realTemp, realGithubEnv)) {
    throw new Error("Process environment file escaped temporary storage");
  }
  const runtimeDir = `${normalizePath(realTemp)}/bci-compose-${runId}`;
  const exportedRuntimeDir = `${
    normalizePath(runnerTemp)
  }/bci-compose-${runId}`;
  if (
    !pathIsBelow(realTemp, runtimeDir) ||
    !pathIsBelow(runnerTemp, exportedRuntimeDir)
  ) {
    throw new Error("Compose runtime directory escaped temporary storage");
  }
  await Deno.mkdir(runtimeDir, { recursive: false, mode: 0o700 });

  const databasePassword = randomSecret();
  const jwtSecret = randomSecret(48);
  const anonKey = await jwt("anon", jwtSecret);
  const serviceRoleKey = await jwt("service_role", jwtSecret);
  const hmacKey = randomSecret(48);
  const pgsodiumKey = randomSecret(32);
  const functionsConfig = await functionConfig("supabase/functions");
  const databaseUrl =
    `postgresql://postgres:${databasePassword}@127.0.0.1:54322/postgres`;
  const internalDatabaseUrl =
    `postgresql://postgres:${databasePassword}@db:5432/postgres`;
  const authDatabaseUrl =
    `postgresql://supabase_auth_admin:${databasePassword}@db:5432/postgres`;

  const stackEnv = [
    `POSTGRES_PASSWORD=${databasePassword}`,
    `JWT_SECRET=${jwtSecret}`,
    "JWT_EXP=3600",
    `GOTRUE_DB_DATABASE_URL=${authDatabaseUrl}`,
    "GOTRUE_DB_DRIVER=postgres",
    "GOTRUE_API_HOST=0.0.0.0",
    "GOTRUE_API_PORT=9999",
    "GOTRUE_API_EXTERNAL_URL=http://127.0.0.1:54321",
    "API_EXTERNAL_URL=http://127.0.0.1:54321",
    "GOTRUE_SITE_URL=http://127.0.0.1:3000",
    "GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:3000/pages/admin-reset-password.html",
    "GOTRUE_DISABLE_SIGNUP=false",
    "GOTRUE_JWT_ADMIN_ROLES=service_role",
    "GOTRUE_JWT_AUD=authenticated",
    `GOTRUE_JWT_SECRET=${jwtSecret}`,
    "GOTRUE_EXTERNAL_EMAIL_ENABLED=true",
    "GOTRUE_MAILER_AUTOCONFIRM=false",
    "GOTRUE_SMTP_HOST=mailpit",
    "GOTRUE_SMTP_PORT=1025",
    "GOTRUE_SMTP_ADMIN_EMAIL=admin@bci.invalid",
    "GOTRUE_SMTP_SENDER_NAME=BloodConnectIndia Local",
    "GOTRUE_LOG_LEVEL=error",
    `PGRST_DB_URI=${internalDatabaseUrl}`,
    "PGRST_DB_SCHEMAS=public,graphql_public",
    "PGRST_DB_EXTRA_SEARCH_PATH=public,extensions",
    "PGRST_DB_ANON_ROLE=anon",
    `PGRST_JWT_SECRET=${jwtSecret}`,
    "PGRST_SERVER_PORT=3000",
    "SUPABASE_URL=http://kong:8000",
    `SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    `SUPABASE_DB_URL=${internalDatabaseUrl}`,
    `SUPABASE_INTERNAL_JWT_SECRET=${jwtSecret}`,
    "SUPABASE_INTERNAL_HOST_PORT=54321",
    `SUPABASE_INTERNAL_FUNCTIONS_CONFIG=${functionsConfig}`,
    `SECURITY_HMAC_KEY=${hmacKey}`,
    "APP_ORIGIN=http://127.0.0.1:3000",
    "",
  ].join("\n");

  const kongTemplate = await Deno.readTextFile(
    "compose/vendor/supabase-cli/kong.yml",
  );
  await Deno.writeTextFile(`${runtimeDir}/stack.env`, stackEnv, {
    createNew: true,
    mode: 0o600,
  });
  await Deno.writeTextFile(
    `${runtimeDir}/kong.yml`,
    renderKong(kongTemplate, anonKey),
    { createNew: true, mode: 0o600 },
  );
  await Deno.writeTextFile(`${runtimeDir}/pgsodium_root.key`, pgsodiumKey, {
    createNew: true,
    mode: 0o600,
  });
  await Deno.writeTextFile(
    realGithubEnv,
    [
      `BCI_RUNTIME_DIR=${exportedRuntimeDir}`,
      "BCI_LOCAL_SUPABASE_URL=http://127.0.0.1:54321",
      `BCI_LOCAL_ANON_KEY=${anonKey}`,
      `BCI_LOCAL_SERVICE_ROLE_KEY=${serviceRoleKey}`,
      `BCI_DATABASE_URL=${databaseUrl}`,
      "",
    ].join("\n"),
    { append: true },
  );
  console.log(
    "Disposable Compose runtime material prepared in temporary storage.",
  );
}
