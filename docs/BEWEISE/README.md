# Beweise

## Zweck

Dieser Ordner sammelt nachprüfbare Belege für Behauptungen über Novora: Release-Artefakte,
Lizenzserver, Versionen. Regel: keine Behauptung ohne Beleg. Was hier nicht belegt ist,
gilt als offen und wird nicht als erledigt dargestellt.

## Struktur

- `LIZENZ.md`: Checkliste für das Lizenzsystem (Health, Aktivierung, Heartbeat,
  Deaktivierung, Sperre, Token-Signatur, DB-Zeilen, Admin-Login).
- `VERSIONEN.md`: Release-Artefakte mit Größe und SHA-256, dazu Altstände, die entfernt
  werden müssen.
- Weitere Dateien: Rohbelege (Logauszüge, JSON-Antworten, Screenshots), benannt nach
  Thema und Datum.

## Erzeugung

Hashes:
```
certutil -hashfile <datei> SHA256
```
oder
```
Get-FileHash -Algorithm SHA256 <datei>
```

HTTP-Belege:
```
curl -sS -m 8 -i https://test.diviesx.de/api/license/health
```
Antwort mit Statuszeile und Body als Textdatei ablegen, nicht nur den Status notieren.

Datenbank:
```
SELECT id, prefix, last4, status, created_at FROM licenses ORDER BY id DESC LIMIT 5;
```
Nur maskierte Werte, niemals volle Keys, Peppervarianten oder Zugangsdaten.

Screenshots: Admin-Seiten und Client-Banner als PNG, Dateiname mit Datum.

Logs: relevante Zeilen aus Server- und Client-Log kopieren, Zeitstempel behalten.

## Regeln

- Keine Secrets in Belegen: keine Passwörter, keine privaten Schlüssel, keine
  vollständigen Keys, keine Verbindungsstrings mit Zugangsdaten.
- Jeder Beleg nennt Datum, Quelle (Route, Datei, Befehl) und Ergebnis.
- Fehlende Belege bleiben als offen markiert, auch wenn der Code fertig aussieht.
- Alte Belege nicht löschen, sondern durch neuere ergänzen.
