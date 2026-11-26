# build.ps1 - baut Payload und kompiliert den Novora-Setup-Installer (Inno Setup 6).
# Keine Admin-Rechte, kein npm, kein git. Aendert nichts ausserhalb von installer\.
[CmdletBinding()]
param(
  [string]$Version = '',
  [string]$Iscc = 'C:\Users\torbe\AppData\Local\Programs\Inno Setup 6\ISCC.exe',
  [string]$NodeExe = ''
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent

# Version: -Version wins, else root package.json, else legacy default.
if (-not $Version) {
  $pkgPath = Join-Path $root 'package.json'
  if (Test-Path $pkgPath) {
    try {
      $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
      if ($pkg.version) { $Version = [string]$pkg.version }
    } catch { }
  }
  if (-not $Version) { $Version = '0.3.3' }
}
$payload = Join-Path $here 'payload'
$outDir = Join-Path $here 'out'
$iss = Join-Path $here 'Novora.iss'

function Fail($msg) { Write-Host "FEHLER: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "-> $msg" }

Write-Host "Novora-Installer bauen, Version $Version"

# --- Quellen pruefen -------------------------------------------------------
$desktopOut = Join-Path $root 'desktop\out'
$srcExe = Join-Path $desktopOut 'Novora.exe'
$srcLoader = Join-Path $desktopOut 'WebView2Loader.dll'
$srcApp = Join-Path $root 'prototype'

foreach ($p in @($srcExe, $srcLoader, (Join-Path $srcApp 'server.mjs'), $iss)) {
  if (-not (Test-Path $p)) { Fail "fehlt: $p" }
}
if (-not $NodeExe) {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $NodeExe = $cmd.Source }
  elseif (Test-Path 'C:\Program Files\nodejs\node.exe') { $NodeExe = 'C:\Program Files\nodejs\node.exe' }
}
if (-not $NodeExe -or -not (Test-Path $NodeExe)) { Fail "node.exe nicht gefunden (Parameter -NodeExe setzen)" }
if (-not (Test-Path $Iscc)) { Fail "ISCC.exe nicht gefunden: $Iscc" }

# Version in der .iss muss zur Skript-Konstante passen (Default dort 0.3.0).
$issText = Get-Content $iss -Raw
if ($issText -match '#define\s+MyAppVersion\s+"([^"]+)"') {
  $issDefault = $Matches[1]
  if ($issDefault -ne $Version) { Write-Host "Hinweis: .iss-Default $issDefault wird per /D auf $Version ueberschrieben." }
}

# --- Payload neu aufbauen --------------------------------------------------
Step "Payload leeren: $payload"
if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item -ItemType Directory -Force -Path $payload | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'runtime') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'app') | Out-Null

Step 'Huelle kopieren (Novora.exe, WebView2Loader.dll)'
Copy-Item $srcExe (Join-Path $payload 'Novora.exe') -Force
Copy-Item $srcLoader (Join-Path $payload 'WebView2Loader.dll') -Force

Step "Node-Runtime kopieren: $NodeExe"
Copy-Item $NodeExe (Join-Path $payload 'runtime\node.exe') -Force

Step 'App-Inhalt kopieren (ohne docs, test, data.json, Startskripte)'
$excludeTop = @('docs', 'test', 'data.json', '.gitignore', 'README.md', 'start.bat', 'start-hidden.vbs', 'node_modules', 'package-lock.json',
  'assets', 'brandset.js')
Get-ChildItem $srcApp -Force | Where-Object { $excludeTop -notcontains $_.Name } | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $payload 'app') -Recurse -Force
}
# Sicherheitsnetz: alles Ausgeschlossene im Payload wieder entfernen.
foreach ($e in $excludeTop) {
  $target = Join-Path $payload ('app\' + $e)
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}

Step 'EXE-Icon-Helfer kopieren (tools\novora-icons.exe)'
$srcIcons = Join-Path $root 'dist\tools\novora-icons.exe'
if (-not (Test-Path $srcIcons)) { Fail "Icon-Helfer fehlt: $srcIcons (desktop\icons\build.ps1 ausfuehren)" }
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'tools') | Out-Null
Copy-Item $srcIcons (Join-Path $payload 'tools\novora-icons.exe') -Force

Step 'Update-Pubkey kopieren (update.pub neben Novora.exe)'
$srcUpdatePub = Join-Path $root 'tools\keys\ed25519.pub.pem'
if (-not (Test-Path $srcUpdatePub)) { Fail "Update-Pubkey fehlt: $srcUpdatePub (erzeugen: node tools\publish.mjs --gen-keys tools\keys)" }
Copy-Item $srcUpdatePub (Join-Path $payload 'update.pub') -Force

# Pflichtdateien im Payload pruefen
$mustHave = @(
  'Novora.exe', 'WebView2Loader.dll', 'update.pub', 'runtime\node.exe',
  'tools\novora-icons.exe',
  'app\server.mjs', 'app\worker.ps1', 'app\package.json',
  'app\web\pc.html', 'app\web\app.html', 'app\lib\store.mjs', 'app\audio\volume.ps1'
)
foreach ($m in $mustHave) {
  if (-not (Test-Path (Join-Path $payload $m))) { Fail "Payload unvollstaendig: $m" }
}
# data.json darf nicht mitgeliefert werden (Nutzerdaten)
if (Test-Path (Join-Path $payload 'app\data.json')) { Fail 'app\data.json darf nicht im Payload sein' }

$payloadSize = (Get-ChildItem $payload -Recurse -File | Measure-Object Length -Sum).Sum
Step ("Payload bereit: {0:N1} MB" -f ($payloadSize / 1MB))

# --- Installer kompilieren -------------------------------------------------
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$setup = Join-Path $outDir ("NovoraSetup-$Version.exe")
if (Test-Path $setup) { Remove-Item $setup -Force }

Step "ISCC: $iss"
& $Iscc "/DMyAppVersion=$Version" $iss
if ($LASTEXITCODE -ne 0) { Fail "ISCC beendete mit Code $LASTEXITCODE" }
if (-not (Test-Path $setup)) { Fail "Setup-EXE nicht erzeugt: $setup" }

# --- Ergebnis pruefen ------------------------------------------------------
$fi = Get-Item $setup
$sizeMb = $fi.Length / 1MB
$head = [System.IO.File]::ReadAllBytes($setup)[0..1]
$magic = [System.Text.Encoding]::ASCII.GetString($head)
if ($magic -ne 'MZ') { Fail "Setup hat keinen MZ-Header (gefunden: $magic)" }
if ($sizeMb -lt 10 -or $sizeMb -gt 40) { Fail ("Setup-Groesse unplausibel: {0:N1} MB" -f $sizeMb) }

Write-Host ''
Write-Host ("FERTIG: {0}" -f $setup)
Write-Host ("Groesse: {0:N1} MB  MZ-Header: ok" -f $sizeMb)
Write-Host ("Payload: {0:N1} MB" -f ($payloadSize / 1MB))
