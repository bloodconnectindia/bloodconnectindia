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
      "C:\\Users\\Jagdamb\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe",
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

Deno.test("Windows Docker resolution is singular, deterministic, and fail closed", () => {
  const start = wrapper.indexOf("function Resolve-ApprovedDocker");
  const end = wrapper.indexOf("$deno = Resolve-ApprovedTool", start);
  const resolver = wrapper.slice(start, end);
  const reviewed = resolver.indexOf(
    "Test-Path -LiteralPath $ReviewedPath -PathType Leaf",
  );
  const fallback = resolver.indexOf(
    "Get-Command 'docker.exe' -CommandType Application -All",
  );
  if (start < 0 || end <= start || reviewed < 0 || fallback <= reviewed) {
    throw new Error("Exact reviewed docker.exe does not win before fallback");
  }
  for (
    const required of [
      "Sort-Object -Unique",
      "$applications.Count -eq 0",
      "$applications.Count -ne 1",
      "fallback is ambiguous",
      "$resolvedFallback = [string]$applications[0]",
      "IsPathFullyQualified($resolvedFallback)",
      "Test-Path -LiteralPath $resolvedFallback -PathType Leaf",
    ]
  ) {
    if (!resolver.includes(required)) {
      throw new Error(`Docker fallback guard missing: ${required}`);
    }
  }
  if (
    resolver.includes("Get-Command 'docker' ") ||
    resolver.includes("CommandType Alias") ||
    resolver.includes("CommandType Function") ||
    resolver.includes("CommandType ExternalScript")
  ) {
    throw new Error(
      "Docker fallback can accept extensionless or non-application commands",
    );
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
