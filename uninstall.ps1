# Entfernt Novora-Shortcuts und beendet den Server. Daten bleiben optional erhalten.
param([switch]$RemoveData)

$dst = Join-Path $env:LOCALAPPDATA 'Novora'
$desktop = [Environment]::GetFolderPath('Desktop')
$startmenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Novora.lnk'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Novora Server.lnk'

foreach ($l in @((Join-Path $desktop 'Novora.lnk'), $startmenu, $startup)) {
  if (Test-Path $l) { Remove-Item $l -Force; Write-Host "entfernt: $l" }
}

$busy = Get-NetTCPConnection -LocalPort 47830 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Stop-Process -Id $busy.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-Host "Server beendet."
}

if ($RemoveData -and (Test-Path $dst)) {
  Remove-Item $dst -Recurse -Force
  Write-Host "Programmordner entfernt: $dst"
} elseif (Test-Path $dst) {
  Write-Host "Programmordner bleibt: $dst (mit -RemoveData loeschen)"
}
