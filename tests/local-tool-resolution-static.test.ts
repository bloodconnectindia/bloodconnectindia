const root = new URL("../", import.meta.url);
const wrapper = await Deno.readTextFile(
  new URL("scripts/local/run-disposable-integration-phase.ps1", root),
);
const driver = await Deno.readTextFile(
  new URL("scripts/ci/run-disposable-integration-phase.sh", root),
);

Deno.test("Windows wrapper pins every approved tool without PATH mutation", () => {
  for (
    const required of [
      ".tools\\deno-recovered\\deno.exe",
      "C:\\Users\\Jagdamb\\AppData\\Local\\Programs\\PostgreSQLClient\\17.11\\bin\\psql.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "deno 2.8.1",
      "PostgreSQL\\) 17\\.11",
      "Docker Client version is not exactly 29.7.2",
      "Docker Server version is not exactly 29.7.2",
      "Git\\bin\\bash.exe",
      "usr\\bin\\sha256sum.exe",
      "usr\\bin\\cygpath.exe",
      "BCI_RUNNER_TEMP_NATIVE",
      "BCI_GITHUB_ENV_NATIVE",
      "Get-Command",
      "CommandType Application",
    ]
  ) {
    if (!wrapper.includes(required)) {
      throw new Error(`Tool guard missing: ${required}`);
    }
  }
  for (
    const forbidden of [
      "setx",
      "EnvironmentVariableTarget]::User",
      "EnvironmentVariableTarget]::Machine",
      "$env:PATH =",
      "printenv",
      "Get-ChildItem -Recurse",
      "BCI_SUPABASE_BIN",
      "Resolve-ApprovedTool 'supabase'",
    ]
  ) {
    if (wrapper.includes(forbidden)) {
      throw new Error(`Persistent or broad tool behavior: ${forbidden}`);
    }
  }
});

Deno.test("tool paths are process scoped and Git Bash converted", () => {
  for (
    const variable of [
      "BCI_DENO_BIN",
      "BCI_PSQL_BIN",
      "BCI_SHA256SUM_BIN",
      "BCI_DOCKER_BIN",
    ]
  ) {
    if (!wrapper.includes(`$env:${variable}`) || !driver.includes(variable)) {
      throw new Error(`Process-scoped tool handoff missing: ${variable}`);
    }
  }
  if (
    !wrapper.includes(
      "SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')",
    )
  ) {
    throw new Error("Disposable values are not process scoped");
  }
  if (!wrapper.includes("& $cygpath -u $Path")) {
    throw new Error("Git Bash path conversion is missing");
  }
});

Deno.test("Linux runner keeps command-name fallbacks", () => {
  for (
    const fallback of [
      "${BCI_DENO_BIN:-deno}",
      "${BCI_PSQL_BIN:-psql}",
      "${BCI_SHA256SUM_BIN:-sha256sum}",
      "${BCI_DOCKER_BIN:-docker}",
    ]
  ) {
    if (!driver.includes(fallback)) {
      throw new Error(`Linux fallback missing: ${fallback}`);
    }
  }
});
