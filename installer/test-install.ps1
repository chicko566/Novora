# test-install.ps1 - stiller Installationstest des Novora-Setups.
# Installiert nach %TEMP%\novora-install-test, prueft Dateien/Eintraege/Verknuepfung,
# deinstalliert wieder und raeumt auf. Startet die App nicht.
# Eine bereits vorhandene echte Installation wird nicht angetastet: deren
# Startmenue-Verknuepfung und Uninstall-Registry-Eintrag werden gesichert und
# am Ende wiederhergestellt.
[CmdletBinding()]
param(
  [string]$Setup = '',
  [string]$TestDir = (Join-Path $env:TEMP 'novora-install-test')
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$AppId = '{7C1D9E42-3A6B-4F58-9C2E-0B5A8D41F7C3}'
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\${AppId}_is1"
$UninstallKeyPath = "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\${AppId}_is1"
$Programs = [Environment]::GetFolderPath('Programs')
$GroupShortcut = Join-Path $Programs 'Novora.lnk'
$GroupFolder = Join-Path $Programs 'Novora'
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Novora.lnk'

if (-not $Setup) { $Setup = Join-Path $here 'out\NovoraSetup-0.3.1.exe' }

$failures = New-Object System.Collections.Generic.List[string]
$results = New-Object System.Collections.Generic.List[string]

function Check($name, [bool]$ok, $detail = '') {
  if ($ok) { $results.Add("OK   $name") }
  else { $failures.Add("FAIL $name $detail") }
}
function Invoke-Wait($exe, [string[]]$arguments, [string]$what) {
  $p = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -Wait
  Write-Host "$what -> ExitCode $($p.ExitCode)"
  return $p.ExitCode
}
function ShortcutTarget($lnk) {
  if (-not (Test-Path $lnk)) { return '' }
  $ws = New-Object -ComObject WScript.Shell
  return $ws.CreateShortcut($lnk).TargetPath
}

# --- Vorbedingungen --------------------------------------------------------
if (-not (Test-Path $Setup)) { Write-Host "FEHLER: Setup fehlt: $Setup"; exit 1 }
$TestDir = [System.IO.Path]::GetFullPath($TestDir).TrimEnd('\')
$realDir = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Novora')).TrimEnd('\')
if ($TestDir -eq $realDir) { Write-Host "FEHLER: TestDir darf nicht die echte Installation sein: $TestDir"; exit 1 }
if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }

Write-Host "Setup   : $Setup"
Write-Host "TestDir : $TestDir"

# --- Bestehende Installation sichern --------------------------------------
$backupDir = Join-Path $env:TEMP ('novora-test-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$hadKey = Test-Path $UninstallKey
$hadGroupLnk = Test-Path $GroupShortcut
$hadGroupFolder = Test-Path $GroupFolder
if ($hadKey) { & reg export $UninstallKeyPath (Join-Path $backupDir 'uninstall.reg') /y | Out-Null }
if ($hadGroupLnk) { Copy-Item $GroupShortcut (Join-Path $backupDir 'Novora.lnk') -Force }
if ($hadGroupFolder) { Copy-Item $GroupFolder (Join-Path $backupDir 'Novora-folder') -Recurse -Force }

$installerLog = Join-Path $backupDir 'install.log'
$uninstallerLog = Join-Path $backupDir 'uninstall.log'
$installed = $false

try {
  # --- Stille Installation -------------------------------------------------
  $code = Invoke-Wait $Setup @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-',
    "/DIR=$TestDir", '/TASKS="!desktopicon"', "/LOG=$installerLog"
  ) 'Installation'
  $installed = (Test-Path (Join-Path $TestDir 'unins000.exe'))
  Check 'Installation ExitCode 0' ($code -eq 0) "(code $code)"

  # --- Dateien -------------------------------------------------------------
  foreach ($rel in @('Novora.exe', 'WebView2Loader.dll', 'runtime\node.exe', 'app\server.mjs', 'app\package.json', 'app\web\pc.html')) {
    Check "Datei $rel" (Test-Path (Join-Path $TestDir $rel))
  }
  Check 'data.json nicht mitinstalliert' (-not (Test-Path (Join-Path $TestDir 'app\data.json')))
  Check 'keine docs/test im Payload' (-not (Test-Path (Join-Path $TestDir 'app\docs')) -and -not (Test-Path (Join-Path $TestDir 'app\test')))

  # --- Startmenue-Verknuepfung (nur die des Testlaufs zaehlt) -------------
  $candidates = @(
    (Join-Path $GroupFolder 'Novora.lnk'),
    $GroupShortcut
  ) | Where-Object { Test-Path $_ }
  $lnk = $candidates | Where-Object { (ShortcutTarget $_) -like "$TestDir*" } | Select-Object -First 1
  Check 'Startmenue-Verknuepfung vorhanden' ([bool]$lnk) "(Kandidaten: $($candidates -join ', '))"
  if ($lnk) {
    $target = ShortcutTarget $lnk
    Check 'Verknuepfung zeigt auf Novora.exe' ($target -ieq (Join-Path $TestDir 'Novora.exe')) "-> $target"
  }

  # --- Uninstall-Eintrag ---------------------------------------------------
  $entry = Get-ItemProperty $UninstallKey -ErrorAction SilentlyContinue
  Check 'Uninstall-Eintrag vorhanden' ($null -ne $entry)
  if ($entry) {
    Check 'Uninstall DisplayName Novora' ($entry.DisplayName -eq 'Novora') "-> $($entry.DisplayName)"
    Check 'Uninstall AppVersion 0.3.1' ($entry.DisplayVersion -eq '0.3.1') "-> $($entry.DisplayVersion)"
    Check 'Uninstall Icon vorhanden' (Test-Path (Join-Path $TestDir 'Novora.exe'))
  }
  Check 'kein Desktop-Icon im Testlauf' (-not ((Test-Path $DesktopShortcut) -and ((ShortcutTarget $DesktopShortcut) -like "$TestDir*")))

  # --- WebView2-Erkennung (nur Information, blockiert nicht) ---------------
  if (Test-Path $installerLog) {
    $logText = Get-Content $installerLog -Raw
    if ($logText -match 'WebView2 Runtime found: (\S+)') { Write-Host "WebView2 erkannt: $($Matches[1])" }
    elseif ($logText -match 'WebView2 Evergreen Runtime not found') { Write-Host 'WebView2 nicht erkannt (Warnung im stillen Lauf uebersprungen).' }
  }

  # --- Deinstallation ------------------------------------------------------
  if ($installed) {
    $code = Invoke-Wait (Join-Path $TestDir 'unins000.exe') @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$uninstallerLog") 'Deinstallation'
    Check 'Deinstallation ExitCode 0' ($code -eq 0) "(code $code)"
  }
  Start-Sleep -Milliseconds 500
  Check 'Installationsordner entfernt' (-not (Test-Path $TestDir))
  Check 'Uninstall-Eintrag entfernt' (-not (Test-Path $UninstallKey))
}
finally {
  # --- Aufraeumen und Sicherung zurueck ------------------------------------
  if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force -ErrorAction SilentlyContinue }

  $keyNow = Test-Path $UninstallKey
  if ($hadKey) {
    if ($keyNow) { Remove-Item $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue }
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & reg import (Join-Path $backupDir 'uninstall.reg') 2>$null | Out-Null
    $ErrorActionPreference = $saved
  } elseif ($keyNow) {
    Remove-Item $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path $GroupShortcut) { Remove-Item $GroupShortcut -Force -ErrorAction SilentlyContinue }
  if (Test-Path $GroupFolder) { Remove-Item $GroupFolder -Recurse -Force -ErrorAction SilentlyContinue }
  if ($hadGroupLnk) { Copy-Item (Join-Path $backupDir 'Novora.lnk') $GroupShortcut -Force -ErrorAction SilentlyContinue }
  if ($hadGroupFolder) { Copy-Item (Join-Path $backupDir 'Novora-folder') $GroupFolder -Recurse -Force -ErrorAction SilentlyContinue }

  if ((Test-Path $installerLog) -and (Select-String -Path $installerLog -Pattern 'WebView2 Runtime not found' -Quiet)) {
    Write-Host 'Hinweis: keine WebView2-Runtime auf diesem System (Warnung im Setup uebersprungen, stiller Lauf).'
  }
  Remove-Item $backupDir -Recurse -Force -ErrorAction SilentlyContinue
}

$results | ForEach-Object { Write-Host $_ }
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  Write-Host "ERGEBNIS: FAIL ($($failures.Count) Fehler)"
  exit 1
}
Write-Host 'ERGEBNIS: PASS - Installation, Verknuepfung, Uninstall-Eintrag und Entfernen geprueft.'
exit 0
