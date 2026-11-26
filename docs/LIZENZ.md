# Novora Lizenzsystem

Stand: 2026-11-24. Release-Bezug: PC 0.3.3 (Build 303), APK 0.1.7 (versionCode 8).

Dieses Dokument beschreibt das Lizenzmodell, das Key-Format, den Aktivierungsablauf am PC,
die Gerätebindung, die Admin-Oberfläche, die Server-API, die Sicherheitsgrenzen und die
Dateien, die der Client anlegt.

## 1. Modell

- Lizenz liegt am PC, nicht am Handy. Das Handy koppelt per QR-Code, die Lizenzprüfung
  läuft über den PC-Client.
- Online-Aktivierung gegen den Lizenzserver, danach ein signierter Offline-Token, der
  lokal geprüft wird.
- Token-Laufzeit: 7 Tage. Der Client erneuert per Heartbeat alle 6 Stunden.
- Reaktion auf fehlende Erneuerung: Nach 1 Stunde ohne gültigen Heartbeat gilt der
  Token als veraltet (STALE) und die App zeigt den Lizenz-Banner.

## 2. Key-Format

- Präfix `NVR-`, danach 20 Zeichen: 15 Nutzzeichen + 5 Prüfsummenzeichen.
- Alphabet: Crockford Base32 ohne die mehrdeutigen Zeichen `I`, `L`, `O`, `U` sowie
  ohne `0` und `1`.
- Die Prüfsumme erkennt Tippfehler und Vertauschungen, bevor eine Netzabfrage startet.
- Die Datenbank speichert den Key nie im Klartext: nur HMAC-SHA256 mit Pepper,
  dazu Präfix und die letzten 4 Zeichen für die Anzeige im Admin.

## 3. Aktivierung am PC

1. Nutzer trägt den Key im PC-Client ein.
2. Client prüft Format und Prüfsumme lokal.
3. Client sendet `POST /api/license/activate` mit Key und Installations-ID.
4. Server prüft Key-HMAC, Status, Laufzeit und Sitzplatzlimit, gibt einen signierten
   Token zurück.
5. Client speichert Token in `license.json` und die Installations-ID in `install.json`.
6. Danach läuft die Erneuerung still per Heartbeat.

Ablauf der Anfrage: Timeout 8 Sekunden. Bei Fehler bleibt der Client bedienbar, zeigt
aber den Lizenz-Banner.

## 4. Gerätebindung

- Jede Installation erzeugt eine eigene Installations-ID (inst).
- Die Lizenz ist an eine oder mehrere Installationen gebunden, abhängig vom Plan.
- Ein weiterer PC verbraucht einen weiteren Sitzplatz; ist das Limit erreicht, antwortet
  der Server mit `seat_limit`.
- `POST /api/license/deactivate` gibt einen Sitzplatz frei (z. B. beim Rechnerwechsel).

## 5. Admin

Routen: `/admin/setup`, `/admin/login`, `/admin/dashboard`, `/admin/security`,
`/admin/keys`, `/admin/audit`.

- `/admin/setup` legt beim ersten Start das Admin-Konto an.
- `/admin/login` ist auf 8 Versuche je 5 Minuten begrenzt.
- `/admin/keys` erzeugt, sperrt und verlängert Keys, zeigt Sitzplätze und letzte Nutzung.
- `/admin/security` verwaltet Pepper-Rotation und Sitzungsregeln.
- `/admin/audit` protokolliert Aktivierungen, Heartbeats, Sperren und Admin-Aktionen.

## 6. Server-API

| Route | Zweck | Limit |
| --- | --- | --- |
| `GET /api/license/health` | Betriebsstatus, Version, DB-Erreichbarkeit | - |
| `GET /api/license/config` | öffentliche Parameter (Token-Laufzeit, Intervalle) | - |
| `POST /api/license/activate` | Key einlösen, Token ausstellen | 10/min |
| `POST /api/license/heartbeat` | Token erneuern, Sitzplatz bestätigen | 120/min |
| `POST /api/license/deactivate` | Sitzplatz freigeben | - |

Fehlercodes: `invalid_key`, `expired`, `revoked`, `seat_limit`, `rate_limited`,
`invalid_token`, `token_expired`, `deactivated`, `server_error`.

## 7. Sicherheit

- Token: `base64url(JSON).base64url(Ed25519-Signatur)`.
- Payload: `{v, lic, inst, plan, feat, iat, exp, jti}`.
- Signatur mit Ed25519, privater Schlüssel bleibt auf dem Server (`keys/`, Rechte 600).
- Client prüft Signatur gegen den öffentlichen Schlüssel, zusätzlich `exp` und `jti`.
- Transport nur über HTTPS.
- `config.json` und `keys/` mit Rechten 600, nicht im Webroot-Serve-Pfad.

## 8. Dateien im Client

- `%APPDATA%\Novora\install.json`: Installations-ID, Erststart, Gerätename.
- `%APPDATA%\Novora\license.json`: Token, Plan, Ablauf, letzter Heartbeat.

Beide Dateien sind reine Klientendaten, kein Servergeheimnis.

## 9. Grenzen

- Der Client ist JavaScript und damit patchbar. Das System verhindert Missbrauch, ist
  aber kein DRM. Wer die Prüfung im Client entfernt, umgeht sie lokal.
- Der Wert liegt in der serverseitigen Key-Ausgabe, im Sitzplatzlimit und im Audit-Log,
  nicht in einem unknackbaren Client.
- Offline-Betrieb endet spätestens nach Ablauf der Token-Laufzeit plus Kulanz.

## 10. Offene Punkte

- Live-Status: `https://test.diviesx.de/api/license/health` antwortet derzeit mit
  502 bzw. Port-Timeout. Server-Panel-Start und Deploy sind noch offen.
- Belege für Health, Aktivierung, Heartbeat, Deaktivierung, Sperre, Signaturprüfung,
  DB-Zeilen und Admin-Login stehen in `docs/BEWEISE/LIZENZ.md` und sind dort als
  offen markiert, bis sie real erhoben sind.
