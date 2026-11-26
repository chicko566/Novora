<#
  Smoke-Test gegen einen laufenden Lizenzserver (DB_DRIVER=memory).
  Voraussetzung: Server laeuft auf 127.0.0.1:47851 mit
    LICENSE_KEY_PEPPER=test und ADMIN_SETUP_TOKEN=smoke-setup-token
  Aufruf: powershell -ExecutionPolicy Bypass -File test\smoke.ps1
#>
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:47851'
$setupToken = if ($env:SMOKE_SETUP_TOKEN) { $env:SMOKE_SETUP_TOKEN } else { 'smoke-setup-token' }

function Get-Csrf([string]$html) {
  $match = [regex]::Match($html, 'name="_csrf" value="([a-f0-9]{32})"')
  if (-not $match.Success) { throw 'CSRF-Feld nicht gefunden.' }
  return $match.Groups[1].Value
}

$session = $null
$setupPage = Invoke-WebRequest -Uri "$base/admin/setup" -UseBasicParsing -SessionVariable session
$csrf = Get-Csrf $setupPage.Content
$setup = Invoke-WebRequest -Uri "$base/admin/setup" -Method Post -UseBasicParsing -WebSession $session -Body @{
  _csrf = $csrf
  token = $setupToken
  email = 'admin@example.test'
  password = 'SmokeTest-12345'
  password2 = 'SmokeTest-12345'
}
Write-Host ("setup: HTTP {0}, dashboard={1}" -f $setup.StatusCode, ($setup.Content -like '*Dashboard*'))

$newPage = Invoke-WebRequest -Uri "$base/admin/keys/new" -UseBasicParsing -WebSession $session
$csrf2 = Get-Csrf $newPage.Content
$created = Invoke-WebRequest -Uri "$base/admin/keys/new" -Method Post -UseBasicParsing -WebSession $session -Body @{
  _csrf = $csrf2
  mode = 'single'
  plan = 'standard'
  seats = '2'
  days = '30'
  count = '1'
  note = 'Smoke-Test'
  customer_email = 'smoke@example.org'
}
$keyMatch = [regex]::Match($created.Content, '(NVR(?:-[2-9A-Z]{5}){4})')
if (-not $keyMatch.Success) { throw 'Kein Schluessel in der Antwort gefunden.' }
$key = $keyMatch.Groups[1].Value
Write-Host ("keys/new: HTTP {0}, key={1}" -f $created.StatusCode, $key)

$health = Invoke-RestMethod -Uri "$base/api/license/health" -Method Get
Write-Host ("health: ok={0} version={1}" -f $health.ok, $health.version)

$config = Invoke-RestMethod -Uri "$base/api/license/config" -Method Get
Write-Host ("config: tokenDays={0} heartbeatHours={1}" -f $config.tokenDays, $config.heartbeatHours)

$payload = @{ key = $key; installId = 'smoke-install-1'; deviceName = 'Smoke-PC'; platform = 'windows'; appVersion = '0.1.4' } | ConvertTo-Json
$activated = Invoke-RestMethod -Uri "$base/api/license/activate" -Method Post -ContentType 'application/json' -Body $payload
Write-Host ("activate: ok={0} plan={1} tokenLen={2}" -f $activated.ok, $activated.plan, $activated.token.Length)

$headers = @{ Authorization = "Bearer $($activated.token)" }
$heartbeat = Invoke-RestMethod -Uri "$base/api/license/heartbeat" -Method Post -Headers $headers
Write-Host ("heartbeat: ok={0} neuesToken={1}" -f $heartbeat.ok, ($heartbeat.token -ne $activated.token))

$authenticated = Invoke-RestMethod -Uri "$base/api/license/deactivate" -Method Post -Headers @{ Authorization = "Bearer $($heartbeat.token)" }
Write-Host ("deactivate: ok={0}" -f $authenticated.ok)

try {
  $wrong = @{ key = 'NVR-22222-22222-22222-22222'; installId = 'smoke-install-2' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/api/license/activate" -Method Post -ContentType 'application/json' -Body $wrong | Out-Null
  Write-Host 'invalid_key: FEHLER - ungueltiger Key wurde akzeptiert'
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  $body = $_.ErrorDetails.Message
  Write-Host ("invalid_key: HTTP {0} {1}" -f $status, $body)
}

try {
  Invoke-RestMethod -Uri "$base/api/license/heartbeat" -Method Post -Headers @{ Authorization = "Bearer $($heartbeat.token).x" } | Out-Null
  Write-Host 'tampered: FEHLER - manipuliertes Token akzeptiert'
} catch {
  Write-Host ("tampered: HTTP {0}" -f [int]$_.Exception.Response.StatusCode)
}

Write-Host 'SMOKE OK'
