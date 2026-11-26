# Novora Lizenzserver: Betrieb

Stand: 2026-11-24. Ziel: Node-Server mit MySQL auf dem bestehenden Webspace,
Deploy per SFTP, Health-Check über HTTPS.

## 1. Voraussetzungen

- Node.js >= 22 auf dem Server (ESM).
- MySQL-Datenbank; Host, Port und Schema stehen ausschließlich in der
  Server-`config.json` (nicht im Repository dokumentieren).
- Zugang zum Webspace per SFTP.
- Domain `test.diviesx.de` zeigt auf den Server.

## 2. Verzeichnislayout

- Anwendungsroot: `/` (der Lizenzserver liegt im Root des Webspace).
- `config.json`: Serverkonfiguration (Port, DB, Pepper-Referenz), Rechte 600.
- `keys/`: Ed25519-Schlüsselpaar, Rechte 600, niemals öffentlich ausliefern.
- Port: 3080.

## 3. Deploy

Werkzeug: `tools\deploy-license.py`.

```
python tools\deploy-license.py --dry-run
python tools\deploy-license.py
python tools\deploy-license.py --download-pub
```

- Überträgt die Serverdateien per SFTP.
- Überspringt `test/`, `keys/` und `config.json` beim Upload.
- Setzt `config.json` auf Rechte 600.
- `--dry-run` zeigt die Dateiliste ohne Schreiben.
- `--download-pub` holt den öffentlichen Schlüssel zur Prüfung lokal ab.

Nach dem Deploy: Panel-Prozess neu starten, sonst läuft die alte Version weiter.

## 4. Erstinbetriebnahme

1. Deploy ausführen.
2. `config.json` auf dem Server prüfen (DB-Zugang, Pepper, Port 3080).
3. Node-Prozess starten (PVQ-Panel oder gleichwertiger Prozessmanager).
4. `GET https://test.diviesx.de/api/license/health` muss 200 mit DB-Status liefern.
5. `/admin/setup` im Browser aufrufen und Admin-Konto anlegen.
6. Danach `/admin/login` und Testschlüssel unter `/admin/keys` erzeugen.

## 5. Health-Check

```
curl -sS -m 8 https://test.diviesx.de/api/license/health
```

Erwartet: 200, JSON mit `ok: true`, Version und Datenbankstatus.
Alles andere (502, Timeout, 500) ist ein Betriebsfehler, siehe Abschnitt 8.

## 6. Admin-Zugang

- `/admin/login` mit Konto aus `/admin/setup`.
- Login-Limit: 8 Versuche je 5 Minuten, danach Sperre.
- Sitzungen laufen ab; bei Verdacht auf Missbrauch Konto-Passwort über
  `/admin/security` ändern und aktive Sitzungen verwerfen.
- Der Login-Token (`adminLoginToken`) erlaubt die Anmeldung ohne Passwort und
  kann nach der Einrichtung rotiert werden.

## 7. Backup und Rotation

Backup:
- MySQL-Dump des Lizenz-Schemas (Keys, Installationen, Audit) regelmäßig ziehen.
- `config.json` und `keys/` separat sichern, Rechte 600 beibehalten.
- Dump und Schlüssel getrennt ablegen; ohne privaten Schlüssel sind alte Token nicht
  mehr prüfbar.

Rotation:
- Pepper-Rotation in `/admin/security` durchführen; alte HMAC-Werte bleiben lesbar,
  neue Aktivierungen nutzen den neuen Pepper.
- Schlüsselwechsel nur mit Übergangsphase: neuer öffentlicher Schlüssel muss im Client
  ankommen, bevor der alte private Schlüssel verschwindet.
- Nach jeder Rotation Health-Check und eine Testaktivierung durchführen.

## 8. Fehlerbilder

| Symptom | Ursache | Maßnahme |
| --- | --- | --- |
| 502 vom Proxy | Node-Prozess läuft nicht oder Port 3080 zu | Panel-Prozess starten, Port prüfen |
| Port-Timeout | Firewall oder Prozess hängt | Prozess neu starten, Port 3080 freigeben |
| Health 500 / DB-Fehler | MySQL-Zugang falsch oder DB weg | `config.json` prüfen, DB-Verbindung testen |
| Alle Aktivierungen `server_error` | Schlüssel oder Pepper fehlt | `keys/` und `config.json` prüfen, Rechte 600 |
| `rate_limited` im Normalbetrieb | zu viele Clients hinter einer IP | Limits prüfen, Heartbeat-Intervall kontrollieren |

## 9. Aktueller Stand

- Health-Endpunkt: **200** am 2026-11-24, DB-Verbindung steht, Version 1.0.0.
- Admin-Konto wurde über `/admin/setup` angelegt; Login funktioniert.
- Live-Beleg: Schlüssel angelegt, `/api/license/activate` 200 mit 7-Tage-Token,
  `/api/license/heartbeat` 200 mit neuem Token, `/deactivate` 200,
  Heartbeat danach 403 `deactivated`.
- PC-Gate lokal gegen den Live-Server: ohne Lizenz `/pc` 302 und `/app` 402;
  nach Aktivierung `/pc` 200 und `/app` 200.
- Offen: Panel-Neustart nach dem Passkey-/Token-Deploy; echter Windows-Hello-Test;
  APK-Installation auf dem A16 (USB-Debugging).
