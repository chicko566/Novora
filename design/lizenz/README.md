# Novora – Lizenz-Mockups

Zwei bedienbare HTML-Mockups für das geplante Lizenzsystem (Aktivierung am PC und
Admin-Bereich). Reine Oberflächen: **keine Serveranfragen, kein Speichern, keine externen
Ressourcen**. Schriften kommen vom System (Inter/Segoe UI), das Logo aus `../logo/novora/`,
Icons sind eigene Inline-SVGs. Keine Emojis, keine Fremdlogos, keine CDNs.

## Dateien

| Datei | Zweck |
|---|---|
| `aktivierung.html` | Aktivierungsfenster der PC-App: Key eingeben, Lizenzstatus, Freigabe |
| `admin.html` | Admin-Anmeldung und Dashboard: Keys, Aktivierungen, Audit-Log |

## Öffnen (lokaler HTTP-Server)

`file://` ist für die Prüfung gesperrt (Browser-Richtlinien, relative Assets), deshalb über
einen lokalen Server mit `design/` als Wurzel starten:

```
cd D:\Projekte\StreamDeck\design
python -m http.server 8099
```

Danach öffnen:

- `http://127.0.0.1:8099/lizenz/aktivierung.html`
- `http://127.0.0.1:8099/lizenz/admin.html`

Wichtig: Der Server muss in `design/` laufen, weil die Seiten `../logo/novora/…` laden.
Ein Server direkt in `design/lizenz/` würde die Wortmarke nicht finden.

## Zustände – `aktivierung.html`

Die Demo-Leiste unter der Karte schaltet die vier Zustände (`aria-pressed`):

1. **Ohne Lizenz** (Start): zentrierte Karte, Key-Feld im Format
   `NVR-XXXXX-XXXXX-XXXXX-XXXXX`, Button „Aktivieren“, Hinweis „PC muss online sein“.
   - Eingabe wird automatisch gruppiert und groß geschrieben.
   - Leer/Formatfehler → Fehlertext mit `role="alert"` und `aria-invalid`.
   - Gültiges Format → Ladezustand (ca. 1,15 s), dann Statuskarte.
   - Demo-Regel: Endung `EXPIR` → abgelaufen, `REVOK` → widerrufen, alles andere → gültig.
2. **Lizenz gültig**: Key maskiert (`NVR-4TQ8M-…-HZ6NC`), Ablaufdatum, Gerät, Sitze,
   letzte Prüfung; „Key ändern“ und „Gerät freigeben“ (zweistufig: zweiter Klick bestätigt).
3. **Abgelaufen**: Warnbanner, Metadaten, „Erneut prüfen“ meldet weiterhin abgelaufen.
4. **Offline**: Banner „Keine Verbindung zum Lizenzserver“, „Erneut prüfen“ stellt die
   Verbindung im Mock wieder her und wechselt auf „gültig“.

Tastatur: `Enter` im Key-Feld aktiviert, alle Bedienelemente sind fokussierbar, die
Zustandswechsel setzen den Fokus auf die neue Überschrift.

## Zustände – `admin.html`

**Login:** E-Mail (Format geprüft), Passwort (mind. 4 Zeichen), TOTP optional (6 Ziffern).
Mock akzeptiert jede gültige Kombination, danach erscheint das Dashboard.

**Dashboard:**

- Zähler: Keys gesamt, aktiv (inkl. ablaufend), ablaufend in 14 Tagen, gesperrt/abgelaufen.
  Stichtag ist fest der 24.11.2026, damit die Beispieldaten stabil bleiben.
- Tabs `Keys`, `Aktivierungen`, `Audit-Log` mit `role="tablist"`; Pfeiltasten, `Home`, `End`.
- Keys: Suche (Key/Kunde/Notiz), Statusfilter, Tabelle mit Status-Pills. Aktionen
  „Verlängern“ (+12 Monate) und „Sperren“/„Freigeben“, jeweils mit Audit-Eintrag und Toast.
- „Key anlegen“ öffnet einen `<dialog>` (Plan, Laufzeit, Sitze 1–10, Kunde/Notiz). Der Key
  wird lokal erzeugt (Crockford-Base32), Tabelle und Zähler aktualisieren sich.
- Aktivierungen: Geräte pro Lizenz, „Gerät zurücksetzen“ gibt einen Sitz frei.
- Audit-Log: neueste Einträge oben, farbige Markierung nach Art.

Alle Änderungen leben nur im Speicher; Neuladen setzt die Beispieldaten zurück.

## Offene Design-Entscheidungen

- Aktivierung als eigener Dialog über der gesperrten App oder als Vollbild-Gate?
- Key-Anzeige: vollständig, maskiert (aktuell) oder nur Endung?
- Abgelaufen/Offline: bleibt die App mit Banner bedienbar oder vollständig gesperrt?
- Admin: TOTP verpflichtend? Rollen (Support nur lesen vs. Vollzugriff)?
- Sperren sofort oder mit Bestätigungsdialog; Verlängern aktuell fix +12 Monate.
- Audit-Log: CSV-Export, Filter und Aufbewahrungsdauer fehlen im Mock.
