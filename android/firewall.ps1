# Firewall-Regeln für Novora (als Administrator ausführen)

$ErrorActionPreference = 'Continue'

function EnsureRule($name, $proto, $port) {
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($existing) { Write-Host "existiert: $name"; return }
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow `
    -Protocol $proto -LocalPort $port -Profile Private | Out-Null
  Write-Host "angelegt: $name"
}

EnsureRule 'Novora TCP 47830' 'TCP' 47830
EnsureRule 'Novora UDP 47831' 'UDP' 47831
Write-Host 'Fertig. Nur privates Netz erlaubt.'
