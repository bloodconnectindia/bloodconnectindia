export type DisposableRuntimeValues = {
  apiUrl: string;
  databaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

const requiredStatusNames = [
  "API_URL",
  "DB_URL",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
] as const;

const parseValue = (line: string) => {
  const match = line.match(
    /^([A-Z][A-Z0-9_]*)=(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s'"\r\n]+))$/,
  );
  if (!match) throw new Error("Malformed local Supabase status output");
  return { name: match[1], value: match[2] ?? match[3] ?? match[4] ?? "" };
};

const validateSecret = (value: string, name: string) => {
  if (value.length < 32 || /[\s\r\n]/.test(value)) {
    throw new Error(`Local ${name} is missing or malformed`);
  }
};

export const parseDisposableStatus = (
  statusOutput: string,
): DisposableRuntimeValues => {
  const values = new Map<string, string>();
  const lines = statusOutput.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) throw new Error("Local Supabase status output is empty");
  for (const line of lines) {
    const parsed = parseValue(line);
    if (values.has(parsed.name)) {
      throw new Error(`Duplicate local Supabase status field: ${parsed.name}`);
    }
    values.set(parsed.name, parsed.value);
  }
  for (const name of requiredStatusNames) {
    if (!values.has(name)) {
      throw new Error(`Local Supabase status field is missing: ${name}`);
    }
  }

  const apiUrl = values.get("API_URL")!;
  if (apiUrl !== "http://127.0.0.1:54321") {
    throw new Error("Local Supabase API target is not approved loopback");
  }
  const databaseUrl = values.get("DB_URL")!;
  let parsedDatabase: URL;
  try {
    parsedDatabase = new URL(databaseUrl);
  } catch {
    throw new Error("Local Supabase database target is malformed");
  }
  if (
    parsedDatabase.protocol !== "postgresql:" ||
    parsedDatabase.hostname !== "127.0.0.1" ||
    parsedDatabase.port !== "54322" ||
    parsedDatabase.pathname !== "/postgres" ||
    parsedDatabase.username !== "postgres"
  ) {
    throw new Error("Local Supabase database target is not approved loopback");
  }

  const anonKey = values.get("ANON_KEY")!;
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY")!;
  validateSecret(anonKey, "anonymous key");
  validateSecret(serviceRoleKey, "service-role key");
  if (anonKey === serviceRoleKey) {
    throw new Error("Local Supabase role credentials are not distinct");
  }
  return { apiUrl, databaseUrl, anonKey, serviceRoleKey };
};

const normalize = (path: string) => {
  const replaced = path.replaceAll("\\", "/");
  const prefix = replaced.match(/^[A-Za-z]:/)?.[0].toLowerCase() ??
    (replaced.startsWith("/") ? "/" : "");
  const rest = prefix === "/"
    ? replaced.slice(1)
    : replaced.slice(prefix.length);
  const parts: string[] = [];
  for (const part of rest.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${prefix}${prefix && prefix !== "/" ? "/" : ""}${parts.join("/")}`
    .replace(/\/$/, "");
};
export const pathIsBelow = (root: string, candidate: string) => {
  const normalizedRoot = normalize(root);
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate.startsWith(`${normalizedRoot}/`);
};

const randomHex = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
};

if (import.meta.main) {
  const runnerTemp = Deno.env.get("RUNNER_TEMP") ?? "";
  const githubEnv = Deno.env.get("GITHUB_ENV") ?? "";
  const statusFile = Deno.env.get("BCI_SUPABASE_STATUS_FILE") ?? "";
  const runId = Deno.env.get("BCI_TEST_RUN_ID") ?? "";
  if (!runnerTemp || !githubEnv || !statusFile) {
    throw new Error("Disposable runtime paths are missing");
  }
  if (!/^bci-local-[0-9]+-[0-9]+$/.test(runId)) {
    throw new Error("Disposable runtime run ID is invalid");
  }
  const realTemp = await Deno.realPath(runnerTemp);
  const realStatus = await Deno.realPath(statusFile);
  const realGithubEnv = await Deno.realPath(githubEnv);
  if (
    !pathIsBelow(realTemp, realStatus) ||
    !pathIsBelow(realTemp, realGithubEnv)
  ) {
    throw new Error("Disposable runtime file is outside approved temp storage");
  }

  const values = parseDisposableStatus(await Deno.readTextFile(realStatus));
  const runtimeEnv = `${normalize(realTemp)}/bci-runtime-env-${runId}.env`;
  if (!pathIsBelow(realTemp, runtimeEnv)) {
    throw new Error("Disposable Edge Function env path escaped temp storage");
  }
  const hmacKey = randomHex();
  await Deno.writeTextFile(
    runtimeEnv,
    [
      `SUPABASE_DB_URL=${values.databaseUrl}`,
      `SUPABASE_SERVICE_ROLE_KEY=${values.serviceRoleKey}`,
      `SECURITY_HMAC_KEY=${hmacKey}`,
      "APP_ORIGIN=http://127.0.0.1:3000",
      "",
    ].join("\n"),
    { createNew: true, mode: 0o600 },
  );
  await Deno.writeTextFile(
    realGithubEnv,
    [
      `BCI_LOCAL_SUPABASE_URL=${values.apiUrl}`,
      `BCI_LOCAL_ANON_KEY=${values.anonKey}`,
      `BCI_LOCAL_SERVICE_ROLE_KEY=${values.serviceRoleKey}`,
      "",
    ].join("\n"),
    { append: true },
  );
  console.log("Disposable loopback runtime environment prepared.");
}
