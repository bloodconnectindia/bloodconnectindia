$ErrorActionPreference = 'Stop'

$supabaseRoot = Split-Path -Parent $PSScriptRoot
$migrationRoot = Join-Path $supabaseRoot 'migrations'
$archiveRoot = Join-Path $supabaseRoot 'legacy-migrations\incompatible-profiles-user-roles'
$manifestPath = Join-Path $supabaseRoot 'migration-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$errors = [System.Collections.Generic.List[string]]::new()

$actualRunnable = @(Get-ChildItem -LiteralPath $migrationRoot -File -Filter '*.sql' |
    Sort-Object Name | ForEach-Object Name)
$expectedRunnable = @($manifest.runnableMigrations)
$runnableHashProperties = @($manifest.runnableMigrationSha256.PSObject.Properties)
$runnableHashNames = @($runnableHashProperties.Name)

if (($actualRunnable -join "`n") -ne ($expectedRunnable -join "`n")) {
    $errors.Add("Runnable migration manifest mismatch. Expected: $($expectedRunnable -join ', '). Actual: $($actualRunnable -join ', ').")
}

if ((($runnableHashNames | Sort-Object) -join "`n") -ne
    (($expectedRunnable | Sort-Object) -join "`n")) {
    $errors.Add('Runnable migration hash inventory must contain exactly one entry for every approved runnable migration.')
}

foreach ($name in $expectedRunnable) {
    $path = Join-Path $migrationRoot $name
    $expectedHash = [string]$manifest.runnableMigrationSha256.$name
    if ($expectedHash -notmatch '^[0-9A-Fa-f]{64}$') {
        $errors.Add("Runnable migration has a missing or invalid SHA-256 value: $name")
        continue
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        continue
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
    if ($actualHash -ne $expectedHash) {
        $errors.Add("Runnable migration checksum mismatch: $name")
    }
}

$denylisted = @($manifest.denylistedLegacyMigrations.PSObject.Properties.Name)
$actualArchived = @(Get-ChildItem -LiteralPath $archiveRoot -File -Filter '*.sql' |
    Sort-Object Name | ForEach-Object Name)
if (($actualArchived -join "`n") -ne (($denylisted | Sort-Object) -join "`n")) {
    $errors.Add('Archived migration hash inventory must contain exactly one entry for every archived SQL migration.')
}
foreach ($name in $denylisted) {
    if (Test-Path -LiteralPath (Join-Path $migrationRoot $name)) {
        $errors.Add("Denylisted legacy migration is runnable: $name")
    }

    $archivedPath = Join-Path $archiveRoot $name
    if (-not (Test-Path -LiteralPath $archivedPath -PathType Leaf)) {
        $errors.Add("Archived legacy migration is missing: $name")
        continue
    }

    $expectedHash = [string]$manifest.denylistedLegacyMigrations.$name
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivedPath).Hash
    if ($actualHash -ne $expectedHash) {
        $errors.Add("Archived legacy migration checksum mismatch: $name")
    }
}

foreach ($migration in Get-ChildItem -LiteralPath $migrationRoot -File -Filter '*.sql') {
    $content = Get-Content -LiteralPath $migration.FullName -Raw
    if ($migration.Name -ne '202608110001_authoritative_schema_preflight.sql' -and
        $content -match '(?i)public\s*\.\s*(profiles|user_roles)\b') {
        $errors.Add("Runnable migration references a legacy identity table: $($migration.Name)")
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Migration runner validation passed. Approved runnable order: $($actualRunnable -join ' -> ')"
