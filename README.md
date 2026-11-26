# Novora

> **Lizenz:** Proprietär — nur persönliche, nicht-kommerzielle Nutzung.
> Quellcode öffentlich sichtbar, aber nicht zur Wiederverwendung freigegeben.
> Siehe [LICENSE](LICENSE).

Steuerpult für Handy/Tablet und PC über WLAN: Tasten, Hotkeys, Mixer, Profile. Kein Account, keine Cloud.

## PC installieren

1. Doppelklick auf **`installieren.cmd`** (oder `install.ps1` per PowerShell).
2. Fertig: Der Server läuft, Verknüpfungen liegen auf **Desktop**, im **Startmenü** und im **Autostart**.
3. PC-Editor: http://127.0.0.1:47830/pc

Installationsziel: `%LOCALAPPDATA%\Novora`. Keine Admin-Rechte nötig.

**Firewall** (einmalig, nur wenn das Handy den PC nicht findet, als Admin):
```powershell
powershell -ExecutionPolicy Bypass -File android\firewall.ps1
```

**Deinstallieren:** `uninstall.ps1` (Shortcuts + Server), mit `-RemoveData` auch der Programmordner.

## Handy-App

`Novora.apk` (Desktop oder `android\Novora-debug.apk`). Installieren, „unbekannte Quellen“ erlauben, App öffnen, PC aus der Liste wählen oder IP eintragen. Details: [docs/APK.md](docs/APK.md).

## Koppeln

Standard: **automatisch**. Handy öffnet die App, wählt den PC – fertig, kein Code nötig.
Der PC-Editor hat dafür den Schalter **„Automatisch koppeln“** (Standard an, nur private IP-Bereiche).

Mit Code (wenn Automatik aus):
1. PC-Editor → **„Neuen Code erzeugen“**.
2. Am Handy Code eingeben → **Koppeln**.

## Open-Source-Entwicklung (Secrets)

Diese Kopie enthält **keine Secrets**. Für den Betrieb müssen die folgenden
Umgebungsvariablen gesetzt werden (siehe `.env.example`):

- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` (Discord-App, serverseitig)
- `NOVORA_LICENSE_URL` (Lizenz-Server)
- `DB_*` (nur für den Lizenz-Server)

Secret-Dateien (`config.json`, `keys/`, `.env`, `discord.json`, `*.pem` außer
`license-pub.pem`) sind **nicht** Teil dieses Repos und dürfen nie committet werden.

## Entwicklung / Tests

```powershell
cd prototype
node server.mjs          # oder npm start
node test/smoke.mjs      # 18/18
node test/discovery.mjs  # UDP-Probe
node test/latency.mjs    # p50/p95/p99
```

## Aufbau

| Ordner | Inhalt |
|---|---|
| `prototype/` | Node-Server, Handy-UI, PC-Editor, Mixer, Tests |
| `android/` | APK-Quelle + `build-apk.ps1` (ohne Gradle) |
| `design/` | Mockup und PNG-Logos |
| `docs/` | API- und APK-Doku |
| `PLAN.md`, `BUILD-PLAN.md`, `TODO.md` | Planung und Stand |

## Icons & Logos

- **Symbol-Piktogramme**: eigener Strich-Satz, 71 Glyphen aus `design/icons/novora-icons/`
  → `prototype/web/iconset.js` (Generator `design/icons/build-iconset.mjs`), Farbe über `currentColor`.
- **Marken-Logos**: echte Hersteller-Logos als lokale Dateien in `prototype/web/assets/brands/`
  (32 Logos), Pfad-Map in `prototype/web/brandset.js`, Anzeige einheitlich als `<img class="brandmark">`.
  Quellen je Datei: `prototype/web/assets/brands/SOURCES.md`; Beschaffung: `tools/fetch-brand-logos.mjs`.
- Regeln, Stand und Prüflisten: [docs/ICONS.md](docs/ICONS.md).
- Lizenzen, Historie früherer Icon-Quellen (Font Awesome 4.7, Simple Icons, Tabler) und
  Markenrechts-Hinweis: [THIRD-PARTY.md](THIRD-PARTY.md).
