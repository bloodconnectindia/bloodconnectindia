[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('start-local-stack','runtime-environment','baseline','schema-preflight','identity-negative','identity-clean','identity-foundation','identity-evidence','identity-index','authorization-migration','authorization-verification','demo-migration','demo-verification','auth-fixtures','edge-functions','concurrency-replay','password-recovery')]
    [string]$Phase,

    [Parameter(Mandatory)]
    [ValidatePattern('^bci-local-[0-9]+-[0-9]+$')]
    [string]$RunId
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path

function Resolve-ApprovedTool {
    param(
        [string]$Name,
        [string[]]$Candidates
    )
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue
    if ($null -ne $command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $command.Source).Path
    }
    throw "Approved executable is unavailable: $Name"
}

$deno = Resolve-ApprovedTool 'deno' @(
    (Join-Path $repoRoot '.tools\deno-recovered\deno.exe')
)
$supabase = Resolve-ApprovedTool 'supabase' @(
    (Join-Path $repoRoot '.tools\supabase\supabase.exe'),
    (Join-Path $env:LOCALAPPDATA 'Supabase\supabase.exe'),
    (Join-Path $env:USERPROFILE '.local\bin\supabase.exe'),
    'C:\Tools\Supabase\2.101.0\supabase.exe',
    'C:\Program Files\Supabase CLI\supabase.exe'
)
$psql = Resolve-ApprovedTool 'psql' @(
    (Join-Path $repoRoot '.tools\postgresql-17\bin\psql.exe'),
    'C:\Program Files\PostgreSQL\17\bin\psql.exe',
    'C:\Program Files\PostgreSQL\17.11\bin\psql.exe',
    'C:\Tools\PostgreSQL\17.11\bin\psql.exe'
)
$bash = Resolve-ApprovedTool 'bash' @('C:\Program Files\Git\bin\bash.exe')
$gitRoot = Split-Path -Parent (Split-Path -Parent $bash)
$sha256sum = Resolve-ApprovedTool 'sha256sum' @(
    (Join-Path $gitRoot 'usr\bin\sha256sum.exe')
)
$cygpath = Resolve-ApprovedTool 'cygpath' @(
    (Join-Path $gitRoot 'usr\bin\cygpath.exe')
)

if ((& $deno --version | Select-Object -First 1) -ne 'deno 2.8.1 (stable, release, x86_64-pc-windows-msvc)') {
    throw 'Bundled Deno version is not exactly 2.8.1'
}
if ((& $supabase --version).Trim() -ne '2.101.0') {
    throw 'Supabase CLI version is not exactly 2.101.0'
}
if ((& $psql --version) -notmatch '^psql \(PostgreSQL\) 17\.11(?:\s|$)') {
    throw 'psql version is not exactly 17.11'
}
if ((& $bash --version | Select-Object -First 1) -notmatch '^GNU bash, version ') {
    throw 'Approved Git Bash could not be verified'
}
if ((& $sha256sum --version | Select-Object -First 1) -notmatch '^sha256sum \(GNU coreutils\) ') {
    throw 'Approved Git sha256sum could not be verified'
}

$localTemp = Join-Path ([System.IO.Path]::GetTempPath()) 'bloodconnectindia-disposable'
New-Item -ItemType Directory -Path $localTemp -Force | Out-Null
$githubEnv = Join-Path $localTemp "bci-process-env-$RunId.env"
if (-not (Test-Path -LiteralPath $githubEnv)) {
    New-Item -ItemType File -Path $githubEnv | Out-Null
}

foreach ($line in Get-Content -LiteralPath $githubEnv) {
    if (-not $line) { continue }
    if ($line -notmatch '^(BCI_LOCAL_SUPABASE_URL|BCI_LOCAL_ANON_KEY|BCI_LOCAL_SERVICE_ROLE_KEY)=([^\r\n]+)$') {
        throw 'Local disposable environment state contains an unexpected entry'
    }
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
}

$toBashPath = {
    param([string]$Path)
    $converted = (& $cygpath -u $Path).Trim()
    if (-not $converted.StartsWith('/')) { throw 'Git Bash path conversion failed' }
    return $converted
}

$env:BCI_DENO_BIN = & $toBashPath $deno
$env:BCI_SUPABASE_BIN = & $toBashPath $supabase
$env:BCI_PSQL_BIN = & $toBashPath $psql
$env:BCI_SHA256SUM_BIN = & $toBashPath $sha256sum
$env:BCI_TEST_RUN_ID = $RunId
$env:RUNNER_TEMP = & $toBashPath $localTemp
$env:GITHUB_ENV = & $toBashPath $githubEnv

$bashRepo = & $toBashPath $repoRoot
$phaseDriver = "$bashRepo/scripts/ci/run-disposable-integration-phase.sh"
Push-Location -LiteralPath $repoRoot
try {
    & $bash $phaseDriver $Phase
    if ($LASTEXITCODE -ne 0) { throw "Disposable phase failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
