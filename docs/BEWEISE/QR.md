# Beweise: Koppeln per QR-Code

Stand: 2026-11-24. Ziel: Handy koppelt an den PC durch Scannen eines QR-Codes mit der
App-Kamera. Kein manueller PIN, keine Code-Eingabe als Pflichtweg.

Regeln:

- Status je Pruefung: `offen`, `PASS`, `FAIL`.
- `PASS` nur mit ausgefuehrtem Befehl und eingetragener Ausgabe.
- Keine Secrets in diesem Dokument: keine vollstaendigen Kopplungs-Codes, keine Tokens,
  keine vollstaendigen QR-Inhalte mit Secret.
- Befehle laufen ab Repo-Wurzel `D:\Projekte\StreamDeck` in PowerShell.

## Zwei Dinge sauber trennen

1. **QR-Scan ohne PIN** (Ziel): Das Handy liest die Adresse des PCs aus dem QR und koppelt
   automatisch. Der Nutzer tippt nichts.
2. **Code im QR** (Ist-Zustand): Der QR traegt zusaetzlich einen 6-stelligen Einmalcode,
   der nach 60 s ablaeuft. Die Android-App wertet diesen Parameter heute nicht aus; sie
   liest nur `ip` und `port` und oeffnet die Web-Oberflaeche. Die Kopplung passiert dort
   ueber die automatische Kopplung im privaten Netz oder ueber die Code-Eingabe.

Ein QR-Scan ohne PIN ist also bereits moeglich, das gewuenschte Secret-Modell
(`secret` mit 120 s Gueltigkeit) ist es nicht.

## Ist-Stand (Quelltext-Lesung, kein Prueflauf)

| Punkt | Beleg |
|---|---|
| QR-Inhalt: `novora://pair?ip=<ip>&port=<port>&code=<6-stellig>` | `prototype\web\pc.js:1577` |
| Code wird beim PC angefordert und nach 120 s im UI ausgeblendet | `prototype\web\pc.js:2144-2149` (`POST /api/pair/request`) |
| Code-Erzeugung: 6 Ziffern, TTL 60 s, einmalig | `prototype\lib\auth.mjs:4` (`CODE_TTL_MS = 60_000`), `auth.mjs:80-105` |
| Handy liest `code` und sendet ihn an `/api/pair/claim` | `prototype\web\app.js:358-371`, `app.js:415`, `app.js:1894` |
| Automatische Kopplung im privaten Netz (ohne Code) | `prototype\web\app.js:339-354`, `prototype\server.mjs:425-449` |
| Android parst nur `ip` und `port`, ignoriert `code`/`secret` | `android\src\de\novora\app\MainActivity.java:538-552`, `:577-607` |
| Android entfernt `secret` aus der weitergereichten URL | `MainActivity.java:545-547`, `:556-559` |
| Kamera-Scan: Systemkamera-Foto plus ZXing-Dekodierung, nur QR | `MainActivity.java:448`, `:525-554`, `:609-614`; `app.js:418-428` |
| Kein manueller PIN im Ablauf | `app.js:486-495`, `MainActivity.java:538-552` |

Abweichung zum Ziel: Der QR enthaelt `code` (6-stellig, 60 s) statt `secret` (120 s). Die
Kopplung selbst braucht keinen PIN; das Secret-Modell mit 120 s Gueltigkeit ist nicht
umgesetzt.

## Pruefungen

### Q1 - QR-Inhalt entspricht dem vereinbarten Format

Befehl:

```powershell
Select-String -Path prototype\web\pc.js -Pattern 'novora://pair'
```

Erwartet: genau eine Fundstelle, Format `novora://pair?ip=...&port=...&code=...` (Ist) bzw.
`...&secret=...&v=2` (Ziel). Kein Lizenzschluessel im QR.

Ist: offen

### Q2 - Kamera-Berechtigung und Scan funktionieren

Befehl (Handy per USB, App gestartet, Scan-Knopf gedrueckt):

```powershell
adb logcat -c
adb logcat -d | Select-String -Pattern 'Novora|ZXing|CAMERA|scan'
```

Erwartet: Berechtigungsdialog erscheint beim ersten Scan, nach Zustimmung wird ein
Novora-QR dekodiert, Log enthaelt keinen vollstaendigen QR-Text mit Secret.

Ist: offen

### Q3 - Code ist einmalig

Befehl: denselben QR zweimal scannen, danach `POST /api/pair/claim` mit demselben Code.

Erwartet: erstes Koppeln erfolgreich (`200`), zweiter Versuch `403` (`code invalid`).

Ist: offen

### Q4 - Gueltigkeit 120 s (Ziel; Ist: 60 s)

Befehl:

```powershell
$c = (Invoke-RestMethod -Method Post http://127.0.0.1:47830/api/pair/request).code
Start-Sleep 121
Invoke-WebRequest -Method Post -Uri http://127.0.0.1:47830/api/pair/claim -Body (@{code=$c;device='proof'} | ConvertTo-Json)
```

Erwartet (Ziel): `200` nach 121 s, solange das Secret innerhalb von 120 s verwendet wurde,
danach `403`. Ist-Stand: `auth.mjs:4` setzt 60 s, ein 121-s-Test muss daher `403` liefern.

Ist: offen

### Q5 - Kein manueller PIN noetig

Befehl: Handy mit frischem Zustand (App-Daten geloescht), nur QR scannen, nichts tippen.

Erwartet: Raster erscheint ohne Eingabe; Code-Feld bleibt unbenutzt. Ist-Stand erlaubt das
ueber die automatische Kopplung im privaten Netz, sofern sie im PC-Editor aktiv ist.

Ist: offen

### Q6 - Kopplung dauert unter 5 s

Befehl: Zeit vom Ausloesen des Scans bis zum sichtbaren Raster messen (`adb logcat` mit
Zeitstempeln, Stoppuhr als Gegenprobe).

Erwartet: unter 5 s inklusive Kamera-Oeffnen.

Ist: offen

### Q7 - Neustart und erneuter Scan

Befehl: App beenden, neu starten, erneut scannen (gleicher PC).

Erwartet: Kopplung ohne Code-Eingabe, Token bleibt in `localStorage.sp_token` erhalten,
`GET /api/layout` antwortet `200`.

Ist: offen

### Q8 - Falscher oder abgelaufener Code wird abgewiesen

Befehl: `POST /api/pair/claim` mit `000000` und mit einem abgelaufenen Code.

Erwartet: `403` mit `code invalid`; nach mehreren Fehlversuchen `429` (`locked`).

Ist: offen

### Q9 - Kein Secret in Logs, DOM oder QR-Anzeige

Befehl:

```powershell
adb logcat -d | Select-String -Pattern 'secret|novora://pair'
Select-String -Path prototype\web\pc.js -Pattern 'secret'
```

Erwartet: kein `secret`-Wert in Logs oder im weitergegebenen URL-Text
(`MainActivity.java:545-559` bereinigt die URL); der PC zeigt nur `ip`, `port` und `code`.

Ist: offen

## Pruefprotokoll

| Pruefung | Datum | Geraet/Umgebung | Ergebnis | Beleg |
|---|---|---|---|---|
| Q1 | | | offen | |
| Q2 | | | offen | |
| Q3 | | | offen | |
| Q4 | | | offen | |
| Q5 | | | offen | |
| Q6 | | | offen | |
| Q7 | | | offen | |
| Q8 | | | offen | |
| Q9 | | | offen | |
