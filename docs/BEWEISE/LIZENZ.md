# Beweise: Lizenzsystem

Stand: 2026-11-24. Alles hier ist offen, solange kein echter Beleg daneben steht.
Server-Ziel: `https://test.diviesx.de`, Port 3080, Health `/api/license/health`.

## Checkliste

| Nr | Prüfpunkt | Befehl / Quelle | Erwartet | Beleg | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Health erreichbar | `curl -sS -m 8 https://test.diviesx.de/api/license/health` | 200, `ok: true`, DB ok | 200, Version 1.0.0 | **belegt** |
| 2 | Config öffentlich | `curl -sS -m 8 https://test.diviesx.de/api/license/config` | 200, Laufzeit und Intervalle | tokenDays 7, heartbeatHours 6 | **belegt** |
| 3 | Aktivierung gültiger Key | `POST /api/license/activate` | 200, Token | 200, Token 307 Zeichen, plan standard | **belegt** |
| 4 | Aktivierung ungültiger Key | `POST /api/license/activate` mit falschem Key | `invalid_key` | 400 invalid_key | **belegt** |
| 5 | Sitzplatzlimit | zweite Installation auf Einzelplatz-Key | `seat_limit` | 409 seat_limit | **belegt** |
| 6 | Heartbeat erneuert Token | `POST /api/license/heartbeat` | 200, neues Token, neues `exp` | 200, Token geändert | **belegt** |
| 7 | Deaktivierung gibt Sitz frei | `POST /api/license/deactivate` | 200, danach Aktivierung möglich | 200, Heartbeat danach 403 `deactivated` | **belegt** |
| 8 | Sperre greift | Key in `/admin/keys` sperren, dann aktivieren | `revoked` | 403 revoked nach Revoke | **belegt** |
| 9 | Ablauf greift | Key mit Vergangenheitsdatum | `expired` | - | offen |
| 10 | Token-Signatur | Client prüft Ed25519 gegen `keys/*.pub` | Signatur gültig, manipuliert = ungültig | gültig = licensed, manipuliert = nicht lizenziert | **belegt** |
| 11 | Token abgelaufen | Token mit `exp` in Vergangenheit | `token_expired` | - | offen |
| 12 | DB-Zeilen | `SELECT prefix, last4, status FROM licenses ...` | Key maskiert, HMAC gesetzt | - | offen |
| 13 | Admin-Login | `/admin/login` mit Konto aus `/admin/setup` | 200, Dashboard | 302 Dashboard, Session-Cookie | **belegt** |
| 14 | Admin-Audit | `/admin/audit` nach Testaktivierung | Eintrag mit Zeit und Aktion | - | offen |
| 15 | Rate-Limit Login | 9 Fehlversuche in 5 Minuten | 9. Versuch `rate_limited` | - | offen |
| 16 | Rate-Limit Activate | 11 Aktivierungen in 1 Minute | 11. Versuch `rate_limited` | - | offen |
| 17 | Client-Banner | Client ohne gültige Lizenz starten | Banner sichtbar, App bedienbar | Gate: `/pc` 302, `/app` 402; nach Aktivierung 200 | **belegt** |

## Belege

### Nr. 1 - Health
Datum: 2026-11-24
Quelle: `GET https://test.diviesx.de/api/license/health`
Antwort: `200 {"ok":true,"version":"1.0.0","time":"2026-11-24T12:26:53.463Z"}`

### Nr. 2 - Config
Datum: 2026-11-24
Quelle: `GET https://test.diviesx.de/api/license/config`
Antwort: `200 {"ok":true,"minVersion":"0.3.3","tokenDays":7,"heartbeatHours":6}`

### Nr. 3 - Aktivierung
Datum: 2026-11-24
Quelle: `POST https://test.diviesx.de/api/license/activate`
Anfrage: `install=pc-live-test-4`, Key maskiert (`NVR-****-...-7F5T`)
Antwort: `200 {"ok":true,"token":"<307 Zeichen>","expiresAt":"2026-12-01T12:29:49.955Z","plan":"standard"}`

### Nr. 6 - Heartbeat
Datum: 2026-11-24
Quelle: `POST https://test.diviesx.de/api/license/heartbeat`
Antwort: `200`, neues Token, neues `expiresAt`, `token_changed=true`

### Nr. 7 - Deaktivierung
Datum: 2026-11-24
Quelle: `POST /deactivate`, danach `POST /heartbeat`
Antwort: `200 {"ok":true}`; danach `403 {"ok":false,"error":"deactivated"}`

### Nr. 4 - Ungültiger Key
Datum: 2026-11-24
Quelle: `POST https://test.diviesx.de/api/license/activate` mit `NVR-AAAAA-AAAAA-AAAAA-AAAAA`
Antwort: `400 {"ok":false,"error":"invalid_key"}`

### Nr. 5 - Sitzplatzlimit
Datum: 2026-11-24
Quelle: Key mit `seats=1`, zwei verschiedene `installId`
Antwort: erste Aktivierung 200, zweite `409 {"ok":false,"error":"seat_limit"}`

### Nr. 8 - Sperre
Datum: 2026-11-24
Quelle: Key aktivieren, in `/admin/keys/<id>/revoke` sperren, dann Heartbeat
Antwort: `403 {"ok":false,"error":"revoked"}`

### Nr. 10 - Signatur
Datum: 2026-11-24
Quelle: `prototype/lib/license.mjs` gegen `license-server/keys/license.pem`
Ergebnis: gültiges Token -> `licensed=true`; manipuliertes Payload -> `licensed=false`

### Nr. 13 - Admin-Login
Datum: 2026-11-24
Quelle: `POST /admin/login` mit Konto aus `/admin/setup`
Antwort: `302 /admin/dashboard`, `Set-Cookie: nv_admin` (HttpOnly, Secure, SameSite=Strict)

### Nr. 17 - PC-Gate
Datum: 2026-11-24
Quelle: lokaler Server Port 47853 gegen `https://test.diviesx.de/api/license`
Ohne Lizenz: `/pc` 302, `/app` 402, `/api/info` 200.
Nach Aktivierung: `/api/license/local/status` `licensed:true`, `/pc` 200, `/app` 200.

## Belegformat

Jeder erledigte Punkt bekommt unter der Tabelle einen Block:

```
### Nr. 3 - Aktivierung gültiger Key
Datum: JJJJ-MM-TT
Quelle: POST https://test.diviesx.de/api/license/activate
Anfrage: install=<id>, key=NVR-****-****  (maskiert)
Antwort: 200 {"token":"<gekürzt>","exp":...}
Datei: activate-2026-11-24.txt
```

Maskierung ist Pflicht: keine vollständigen Keys, keine Signatur im Klartext, keine
Zugangsdaten.
