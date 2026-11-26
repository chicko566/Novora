# Installiert Novora fuer den aktuellen Benutzer nach %LOCALAPPDATA%\Novora
# Keine Admin-Rechte noetig. Firewall-Regeln optional (siehe Hinweis am Ende).
param([switch]$NoStart)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'prototype'
$dst = Join-Path $env:LOCALAPPDATA 'Novora'

if (-not (Test-Path (Join-Path $src 'server.mjs'))) { throw "prototype/ nicht gefunden neben install.ps1" }

Write-Host "Ziel: $dst"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

# Dateien kopieren, data.json (Layout/Geraete) nicht ueberschreiben
$exclude = @('data.json', 'node_modules')
Get-ChildItem $src -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
  Copy-Item $_.FullName -Destination $dst -Recurse -Force
}
if (-not (Test-Path (Join-Path $dst 'data.json'))) {
  Copy-Item (Join-Path $src 'data.json') $dst -Force -ErrorAction SilentlyContinue
}
$toolsExe = Join-Path $PSScriptRoot 'dist\tools\novora-icons.exe'
if (Test-Path $toolsExe) {
  $toolsDst = Join-Path $dst 'tools'
  New-Item -ItemType Directory -Force -Path $toolsDst | Out-Null
  Copy-Item $toolsExe -Destination (Join-Path $toolsDst 'novora-icons.exe') -Force
}

function New-Shortcut($path, $target, $argLine, $workdir, $desc) {
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $target
  $s.Arguments = $argLine
  $s.WorkingDirectory = $workdir
  $s.Description = $desc
  $s.WindowStyle = 7
  $s.Save()
}

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$vbs = Join-Path $dst 'start-hidden.vbs'
$desktop = [Environment]::GetFolderPath('Desktop')
$startmenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Novora.lnk'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Novora Server.lnk'

New-Shortcut (Join-Path $desktop 'Novora.lnk') $wscript "`"$vbs`"" $dst 'Novora starten'
New-Shortcut $startmenu $wscript "`"$vbs`"" $dst 'Novora'
New-Shortcut $startup $wscript "`"$vbs`"" $dst 'Novora Server (Autostart)'

Write-Host "Verknuepfungen: Desktop, Startmenue, Autostart"

$busy = Get-NetTCPConnection -LocalPort 47830 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "Server laeuft bereits auf Port 47830 - Neustart nicht noetig."
} elseif (-not $NoStart) {
  Start-Process -FilePath $wscript -ArgumentList "`"$vbs`"" -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Host "Server gestartet."
}

$ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress
Write-Host ""
Write-Host "PC-Editor : http://127.0.0.1:47830/pc"
if ($ips) { Write-Host ("Handy     : " + (($ips | ForEach-Object { "http://$_`:47830/app" }) -join '  |  ')) }
Write-Host ""
Write-Host "Firewall (einmalig, als Admin): powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\android\firewall.ps1`""
Write-Host "Deinstallieren: uninstall.ps1"
