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

if (($actualRunnable -join "`n") -ne ($expectedRunnable -join "`n")) {
    $errors.Add("Runnable migration manifest mismatch. Expected: $($expectedRunnable -join ', '). Actual: $($actualRunnable -join ', ').")
}

$denylisted = @($manifest.denylistedLegacyMigrations.PSObject.Properties.Name)
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
