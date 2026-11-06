<#
.SYNOPSIS
    Sync the workspace bundles (theme + boot animation) into a DeepSeek Harness
    profile and make sure the profile's patch layer loads them on every start.

.DESCRIPTION
    Every folder under bundle\ is copied to <profile>\bundles\<name>\ and gets
    an insert row in the profile's cordis.patch.yml pointing at the installed
    copy, so the profile stays self-contained: the theme and the boot animation
    keep working even if the workspace folder is moved or deleted, and they
    survive DeepSeek Harness upgrades.

    The rows are managed idempotently: re-running the script updates them in
    place and never duplicates them.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File C:\D界面主题\tools\install-theme.ps1
    powershell -ExecutionPolicy Bypass -File C:\D界面主题\tools\install-theme.ps1 -ProfileDir C:\Users\Administrator\.dsh\profiles\desktop
#>
[CmdletBinding()]
param(
    [string]$Source,
    [string]$ProfileDir
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Source) { $Source = Join-Path $scriptRoot '..\bundle' }
if (-not $ProfileDir) {
    $ProfileDir = if ($env:DSH_PROFILE_DIR) { $env:DSH_PROFILE_DIR } else { Join-Path $env:USERPROFILE '.dsh\profiles\desktop' }
}

$Source = (Resolve-Path -LiteralPath $Source).Path
$ProfileDir = (Resolve-Path -LiteralPath $ProfileDir).Path
$PatchFile = Join-Path $ProfileDir 'cordis.patch.yml'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$bundlesDir = Join-Path $ProfileDir 'bundles'
New-Item -ItemType Directory -Force -Path $bundlesDir | Out-Null

Write-Host "source : $Source"
Write-Host "profile: $ProfileDir"
Write-Host ''

$text = Get-Content -LiteralPath $PatchFile -Raw -Encoding UTF8

foreach ($dir in Get-ChildItem -LiteralPath $Source -Directory | Sort-Object Name) {
    $name = $dir.Name
    $target = Join-Path $bundlesDir $name

    # copy every file of the bundle (index.js, css, client js, locale, icon…)
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Get-ChildItem -LiteralPath $dir.FullName -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($dir.FullName.Length + 1)
        $dest = Join-Path $target $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
    }

    # the bundle's own patch declares its row id
    $bundlePatch = Join-Path $target 'cordis.patch.yml'
    $id = $null
    if (Test-Path -LiteralPath $bundlePatch) {
        $bundleText = Get-Content -LiteralPath $bundlePatch -Raw -Encoding UTF8
        $m = [regex]::Match($bundleText, '(?m)^\s*-\s+id:\s*(?<id>[A-Za-z0-9._-]+)\s*$')
        if ($m.Success) { $id = $m.Groups['id'].Value }
    }
    if (-not $id) { $id = $name }

    $entry = Join-Path $target 'index.js'
    if (-not (Test-Path -LiteralPath $entry)) {
        Write-Warning "$name has no index.js - skipped"
        continue
    }
    $rowName = ((Resolve-Path -LiteralPath $entry).Path -replace '\\', '/')
    $block = "- insert:`r`n    - id: $id`r`n      name: `"$rowName`"`r`n"

    $pattern = "(?ms)^- insert:\r?\n[ \t]+- id: $([regex]::Escape($id))\s*.*?(?=\r?\n- |\z)"
    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, { param($m) $block })
        Write-Host ("{0,-16} row updated  -> {1}" -f $name, $rowName)
    } else {
        $text = $text.TrimEnd() + "`r`n" + $block
        Write-Host ("{0,-16} row appended -> {1}" -f $name, $rowName)
    }
}

[System.IO.File]::WriteAllText($PatchFile, $text, $utf8NoBom)

Write-Host ''
Write-Host 'installed bundles:'
Get-ChildItem -LiteralPath $bundlesDir -Directory | ForEach-Object {
    $files = @(Get-ChildItem -LiteralPath $_.FullName -Recurse -File)
    '  {0,-18} {1,2} files, {2,6} bytes' -f $_.Name, $files.Count, ($files | Measure-Object -Property Length -Sum).Sum
}
Write-Host ''
Write-Host 'done - refresh the Harness GUI (Ctrl+R) or restart the app to see the changes.'
