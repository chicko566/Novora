# Changelog — Novora

## 2026-11-26

### Added
- `volume-up` Icon (71. Glyph) in Icon-Satz (design/prototype/website) + SVG + index.json.
- QR-Code-Generierung (NovoraQR in prototype/web/qr.js) für Pairing-URL im PC-Editor.
- Pairing-Code-Schutz: Session-Token (HMAC-signiert, 7 Tage gültig) in localStorage.
- `.env.example` (root + license-server) mit Platzhaltern für Secrets.
- Proprietäre LICENSE-Datei (nur persönliche, nicht-kommerzielle Nutzung).
- Open-Source-Kopie in `D:\Projekte\Novora` (ohne Secrets).

### Changed
- `nv-volume-up` ist jetzt eine einfache Taste (kein Ring/Kreis mehr, wie Volume-Down).
- Discord Live-Sync aus Endnutzer-Build entfernt (Frontend + Backend). Dev behält die Funktion.
- README.md: Handy-Nutzung über Browser statt APK; Marken-Logos nicht mitgeliefert (EXE-Extraktion).
- THIRD-PARTY.md: Icon-Anzahl 70 → 71; Marken-Logos-Herkunft dokumentiert.
- `discord-rpc.mjs`: saveCfg/loadCfg robust, connect()-Methode, authorize() idempotent, Env-Fallback für Creds.
- `server.mjs`: neue Route `/api/admin/discord/connect-stored`.
- Marken-Logos: kein brandset.js, kein assets/brands/, kein CDN-Hotlink im Release.

### Removed
- `android/` Ordner (APK) aus Endnutzer-Build.
- `website/downloads/novora.apk`.
- `design/icons/novora-icons/brandset.js` (generiert, nicht mitgeliefert).
- Discord Live-Sync UI aus `pc.html` (Endnutzer-Build).

### Security
- Keine Secrets im Repo (gitignored: config.json, keys/, .env, discord.json, *.pem außer license-pub.pem).
- DISCORD_CLIENT_SECRET und DB-Creds nur via process.env (Env, nicht im Repo).
- Proprietäre Lizenz: keine Wiederverwendung/Weitergabe/kommerzielle Nutzung.