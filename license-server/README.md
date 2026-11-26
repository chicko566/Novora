# Novora Lizenzserver

Node-22-Server (ESM) fuer Lizenzschluessel, Aktivierungen und Admin-Verwaltung.
Einzige npm-Abhaengigkeit: `mysql2`. Fuer Tests und lokale Laeufe gibt es einen
In-Memory-Store (`DB_DRIVER=memory`).

## Aufbau

```
license-server/
  server.js              Einstiegspunkt (HTTP, Routing, CORS, Shutdown)
  lib/config.mjs         Config + ENV
  lib/keys.mjs           Schluesselformat NVR-XXXXX-... (Crockford-Base32, Pruefsumme)
  lib/tokens.mjs         Ed25519-Keystore, Token signieren/pruefen
  lib/license.mjs        activate / heartbeat / deactivate
  lib/api.mjs            /api/license/*
  lib/adminRoutes.mjs    /admin/* (Login, Setup, Keys, Audit, TOTP)
  lib/admin.mjs          scrypt, TOTP (RFC 6238), Sessions, CSRF
  lib/ratelimit.mjs      Limits pro IP
  lib/store/memory.mjs   Test-Store
  lib/store/mysql.mjs    MySQL-Store
  lib/html.mjs           Layout/CSS (keine externen Assets)
  admin/*.mjs            serverseitige Seiten
  migrations/001_init.sql
  keys/                  wird beim Start erzeugt (license.pem, license.pub.pem)
  test/license.test.mjs  Tests ohne MySQL
  test/smoke.ps1         Smoke-Test gegen laufenden Server
```

## Voraussetzungen

- Node.js 22 oder neuer
- MySQL 5.7+/8.x oder MariaDB 10.x (nur bei `DB_DRIVER=mysql`)
- HTTPS-Endpunkt (Reverse Proxy/Plesk), damit Cookies `Secure` gesetzt werden koennen

## Installation

```bash
cd license-server
npm install            # installiert nur mysql2, erzeugt node_modules/
```

Auf einem Server ohne npm: `node_modules/` lokal installieren und per SFTP
mit hochladen (pure JS, keine Build-Tools noetig).

## Konfiguration

Es gibt zwei Wege: `config.json` (nicht im Repository) oder Umgebungsvariablen.
ENV hat Vorrang. Es wird **keine** `.env` gelesen.

| Variable | Default | Bedeutung |
| --- | --- | --- |
| `PORT` | `47850` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DB_DRIVER` | `mysql` | `mysql` oder `memory` |
| `DB_HOST` | `127.0.0.1` | MySQL-Host |
| `DB_PORT` | `3306` | MySQL-Port |
| `DB_USER` | - | MySQL-Benutzer |
| `DB_PASSWORD` | - | MySQL-Passwort |
| `DB_NAME` | - | Datenbankname |
| `LICENSE_KEY_PEPPER` | - | Pflicht, geheimer HMAC-Pepper (32+ Zeichen empfohlen) |
| `ADMIN_SETUP_TOKEN` | - | Einmal-Token fuer den ersten Admin |
| `PUBLIC_BASE_URL` | - | oeffentliche Basis-URL (nur Anzeige/Config) |
| `SECURE_COOKIES` | `false` | `true` hinter HTTPS, falls der Proxy kein `X-Forwarded-Proto` sendet |
| `TOKEN_DAYS` | `7` | Gueltigkeit der Lizenz-Tokens |
| `HEARTBEAT_HOURS` | `6` | empfohlenes Heartbeat-Intervall |
| `ADMIN_SESSION_HOURS` | `12` | Admin-Sitzungsdauer |

Beispiel: `cp config.example.json config.json`, Werte eintragen, danach
`chmod 600 config.json` und die Datei **ausserhalb** des Webroots ablegen.

Beim Start wird `keys/license.pem` (PKCS8, Ed25519, chmod 600) erzeugt, falls sie
fehlt; `keys/license.pub.pem` (SPKI) ist der Public Key fuer die Clients.
Den Private Key sichern und niemals mit ausliefern.

## Datenbank

```sql
CREATE DATABASE s5123_lizenz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lizenz'@'localhost' IDENTIFIED BY '<passwort>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON s5123_lizenz.* TO 'lizenz'@'localhost';
FLUSH PRIVILEGES;
```

Schema importieren (oder der Server legt es beim Start selbst an):

```bash
mysql -u lizenz -p s5123_lizenz < migrations/001_init.sql
```

Tabellen: `licenses`, `activations`, `license_events`, `admin_users`,
`admin_sessions`, `schema_migrations`. Alle Zeiten in UTC.

## Start

```bash
PORT=47850 DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_NAME=s5123_lizenz \
DB_USER=lizenz DB_PASSWORD='...' LICENSE_KEY_PEPPER='...' ADMIN_SETUP_TOKEN='...' \
node server.js
```

Unter Windows (PowerShell):

```powershell
$env:PORT='47850'; $env:DB_DRIVER='mysql'; $env:DB_HOST='127.0.0.1'
$env:DB_NAME='s5123_lizenz'; $env:DB_USER='lizenz'; $env:DB_PASSWORD='...'
$env:LICENSE_KEY_PEPPER='...'; $env:ADMIN_SETUP_TOKEN='...'
node server.js
```

Startlog nennt Port, DB-Treiber, Keystore-Status und ob ein Admin fehlt - ohne Secrets.

### Deployment per SFTP / Plesk

1. Ordner `license-server/` inkl. `node_modules/` per SFTP hochladen
   (nicht in den oeffentlichen Webroot, sondern z. B. `/var/www/novora-license`).
2. `config.json` mit echten Werten anlegen (Rechte 600, Besitzer = Node-Benutzer).
3. In Plesk eine Node.js-Anwendung anlegen: Startdatei `server.js`, Port `47850`.
4. Reverse Proxy / Apache auf `https://<domain>/api` und `/admin` -> `127.0.0.1:47850`.
5. Prozessmanager (Plesk Node.js, systemd oder pm2) fuer Neustart nach Reboot.
6. `https://<domain>/admin` aufrufen: ohne Admin leitet der Server auf `/admin/setup`.

### Erster Admin

`/admin/setup` ist nur erreichbar, solange `admin_users` leer ist.
Setup-Token = `ADMIN_SETUP_TOKEN`; E-Mail + Passwort (min. 10 Zeichen) setzen.
Danach ist die Seite geschlossen. 2FA (TOTP) kann im Dashboard aktiviert werden.

### Admin-Funktionen

Dashboard (Zaehler, bald ablaufende Keys, letzte Ereignisse), Schluesselliste mit
Suche, Anlegen einzeln oder als CSV (`plan;sitze;tage;notiz;email`), Detailseite
mit Verlaengern, Sperren/Aufheben, Plaetze bearbeiten, einzelne Geraete oder alle
Geraete freigeben, Audit-Log (200 Eintraege), CSV-Export.

Der volle Lizenzschluessel wird **nur einmal** nach dem Anlegen angezeigt.
Gespeichert werden HMAC-SHA256(pepper, key), Prefix und letzte 4 Zeichen.

## API

Alle Antworten JSON/UTF-8. CORS ist fuer `/api/license/*` auf `*` gesetzt.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/license/health` | `{ok, version, time}` |
| GET | `/api/license/config` | `{minVersion, tokenDays, heartbeatHours}` |
| POST | `/api/license/activate` | `{key, installId, deviceName, platform, appVersion}` |
| POST | `/api/license/heartbeat` | `Authorization: Bearer <token>` |
| POST | `/api/license/deactivate` | `Authorization: Bearer <token>` |

Fehlercodes: `invalid_key`, `expired`, `revoked`, `seat_limit`, `rate_limited`,
`invalid_token`, `token_expired`, `deactivated`, `server_error`.

Token: `base64url(JSON).base64url(Ed25519-Signatur)`, Payload
`{v:1, lic, inst, plan, feat, iat, exp, jti}`, Laufzeit `TOKEN_DAYS` (7 Tage).
Signaturpruefung mit dem Public Key, Ablauf wird serverseitig geprueft.

Beispiel:

```bash
curl -s -X POST https://<domain>/api/license/activate \
  -H 'Content-Type: application/json' \
  -d '{"key":"NVR-XXXXX-XXXXX-XXXXX-XXXXX","installId":"pc-1","deviceName":"Buero","platform":"windows","appVersion":"0.1.4"}'
```

## Backup

- MySQL: taeglicher Dump, z. B.
  `mysqldump --single-transaction s5123_lizenz | gzip > lizenz-$(date +%F).sql.gz`
  und zusaetzlich `migrations/` archivieren.
- `keys/license.pem` separat und verschluesselt sichern. Geht der Key verloren,
  werden alle bereits ausgestellten Tokens ungueltig (Clients muessen neu aktivieren).
- `config.json` sichern (enthaelt DB-Passwort und Pepper).
- Restore: DB importieren, `keys/` und `config.json` zurueckkopieren, Dienst starten.

## Sicherheit

- Keine `.env` im Projekt, keine Zugangsdaten im Repository oder in Logs.
- `LICENSE_KEY_PEPPER` und `keys/license.pem` sind geheim; Pepper-Wechsel macht
  alle gespeicherten Key-Hashes unbrauchbar.
- Admin nur ueber HTTPS; Cookies sind `HttpOnly`, `SameSite=Strict`, `Secure` bei HTTPS.
- Jedes Formular hat ein CSRF-Token; Sessions liegen nur als SHA-256-Hash in der DB.
- Rate-Limits: Login 8/5 min, activate 10/min, heartbeat 120/min, deactivate 30/min (pro IP).
- Passwoerter: scrypt (N=16384, r=8, p=1). TOTP optional (RFC 6238, HMAC-SHA1, 30 s, 6 Stellen).
- IPs werden nur als HMAC-Hash gespeichert.
- Nach der Einrichtung `ADMIN_SETUP_TOKEN` entfernen/rotieren und DB-/SFTP-Passwoerter wechseln.
- Sicherheitsheader: CSP ohne externe Quellen, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

## Tests

```bash
node --test test/license.test.mjs
# oder
npm test
```

Getestet ohne MySQL: Schluesselformat/Pruefsumme, Aktivierung, Heartbeat mit neuem
Token, manipuliertes Token, Sperre, Sitzlimit, abgelaufenes Token/Lizenz, Freigabe.

Smoke-Test gegen einen laufenden Server (`DB_DRIVER=memory`, Port 47851):

```powershell
$env:DB_DRIVER='memory'; $env:PORT='47851'; $env:LICENSE_KEY_PEPPER='test'
$env:ADMIN_SETUP_TOKEN='smoke-setup-token'; node server.js
# zweites Fenster:
powershell -ExecutionPolicy Bypass -File test\smoke.ps1
```

## Betriebshinweise

- `DB_DRIVER=memory` verliert alle Daten beim Neustart - nur fuer Tests.
- Migrationen laufen beim Start automatisch (`schema_migrations`), zusaetzlich
  laesst sich `migrations/001_init.sql` manuell importieren.
- Der Server bindet standardmaessig auf `0.0.0.0`; hinter einem Proxy genuegt
  `HOST=127.0.0.1`.
- Logausgabe erfolgt nach stdout/stderr (Plesk/Systemd sammelt sie ein).
