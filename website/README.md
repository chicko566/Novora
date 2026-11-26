# Novora – Website

Statische Seite (kein Build, kein Framework). Dunkles Design passend zur App, ohne fremde Markenlogos.

## Starten (lokal)

```powershell
cd D:\Projekte\StreamDeck\website
python -m http.server 8090
```

Dann http://127.0.0.1:8090 öffnen.

## Veröffentlichen

- **GitHub Pages**: Ordner `website/` in ein Repo, Pages auf den Ordner zeigen lassen.
- **Netlify/Vercel/Cloudflare Pages**: Ordner hochladen, keine Build-Einstellungen.
- **Eigener Webspace**: per SFTP hochladen (Zugang siehe Memory `reference_webserver_sftp`).

## Inhalte pflegen

- **APK**: `downloads/novora.apk` ersetzen und im Abschnitt „Jetzt herunterladen“ **Version, Größe und SHA-256** aktualisieren:
  ```powershell
  Get-FileHash downloads\novora.apk -Algorithm SHA256
  ```
- **Screenshots**: nur ohne fremde Logos. Der Geräte-Mock ist reines CSS und braucht keine Bilder.
- **Rechtstexte**: `impressum.html`, `datenschutz.html`, `agb.html`, `lizenz.html` sind Platzhalter — vor Veröffentlichung mit echten Daten füllen (siehe `docs/VERKAUF.md` und Abschnitt „Lizenzseiten“).
- **Name**: aktuell „Novora“; vor Verkauf Markenrecherche (DPMA/EUIPO Kl. 9/42) und Domain.

## Lizenzseiten

- **`lizenz.html`** beschreibt das Lizenzmodell: ein Schlüssel pro PC, sieben Tage gültiges Token mit automatischer Verlängerung, Aktivierung nur mit Internet, stiller Statuscheck alle sechs Stunden, gesperrter Zustand ohne gültige Lizenz. Dazu Gerätewechsel, lizenzunabhängige Updates, Drittanbieter-Komponenten und Markenhinweis.
- **`agb.html`**, **`datenschutz.html`** und **`impressum.html`** müssen inhaltlich dazu passen: Lizenzlaufzeit, ein Gerät pro Schlüssel, keine Weitergabe (AGB) sowie Installations-ID, Gerätename, Plattform, letzter Kontakt und gehashte IP am Lizenzserver (Datenschutz).
- **Offene Platzhalter** sind mit `class="placeholder"` und `[vor Veröffentlichung eintragen]` markiert: Anbieterdaten, Copyright-Inhaber, Löschfristen, Hosting-Anbieter, Kontakt-E-Mail, Widerrufsbelehrung, Gerichtsstand. Keine erfundenen Firmen-, Adress- oder Steuerangaben einsetzen.
- **Lizenzserver** läuft unter `https://test.diviesx.de` (Admin-Bereich `/admin`, API `/api/license/*`). Nach dem Umzug auf die Produktionsdomain die Adresse in `datenschutz.html` und `lizenz.html` ersetzen; solange die Testadresse gilt, ist die Seite als Platzhalter gekennzeichnet.
- **Prüfung nach Änderungen**: Links `index.html` / `impressum.html` / `datenschutz.html` / `agb.html` / `lizenz.html` müssen auf allen Rechtsseiten funktionieren, keine Emojis, keine fremden Logos oder CDNs einbinden. Die Haftungs- und Widerrufstexte vor Verkauf juristisch prüfen lassen.

## Struktur

```
website/
├── index.html          Startseite (neues Design, zentrierte Navbar)
├── site.css            Design der Startseite
├── style.css           Design der Rechtsseiten (alt)
├── icons.html          Icon-Katalog (70 eigene Zeichnungen)
├── icons/              eigene SVGs + iconset.js (Kopie aus design/icons/novora-icons)
├── assets/             Logo + Wortmarke (PNG), logos/ (18 App-Logos, PNG)
├── downloads/          Setup, ZIP, APK
├── updates/latest.json Update-Manifest (unsigniert bis Produktionsschlüssel)
├── impressum.html
├── datenschutz.html
├── agb.html
└── lizenz.html
```

## Icons

Der Katalog `icons.html` zeigt die **70 Symbol-Piktogramme** des eigenen Strich-Satzes
(`design/icons/novora-icons/`, 24×24, 2 px Strich). Die Website liest die Kopie
`icons/iconset.js` (`window.NOVORA_ICONS`); nach Änderungen:

```powershell
node design/icons/build-iconset.mjs
copy design\icons\novora-icons\iconset.js website\icons\iconset.js
node --check website\icons\iconset.js
```

`icons.html` rendert jedes Icon als `<svg viewBox="0 0 24 24">` mit dem Feld `d.svg`, Farbe über
`currentColor`. Keine Fremd-Icon-Packs (Font Awesome, Simple Icons, Tabler) im Katalog.

## Marken-Logos

Die Software zeigt in den Bibliothek-Tabs **Software** und **Webseiten** echte Hersteller-Logos
(31 Originaldateien, `prototype/web/assets/brands/`, Pfad-Map `prototype/web/brandset.js`).
Die Website selbst liefert keine Fremdlogos aus: `website/downloads/` enthält nur Setup,
ZIP und APK. Markenlogos werden lokal aus installierten EXE-Dateien extrahiert; Quellen
und Rechte: `docs/ICONS.md`, `THIRD-PARTY.md`.
`THIRD-PARTY.md`, Regeln: `docs/ICONS.md`.

## Logos

Die App-/Programm-Logos (18 Motive: Musik, Video, Sprach-Chat, Browser, Spiele, Stream, Code, Bild, Dateien, Mail, Kalender, Video-Call, Mikrofon, Werkzeug, System, Kamera, Mixer, Shop) sind ebenfalls eigene Zeichnungen – vollflächige Farbkacheln als PNG in 128/256/512 px plus `preview.png`.

- Quelle: `design/logos/novora-apps/`
- Website-Kopie: `assets/logos/<key>.png` (jeweils die 256-px-Fassung; zum Neu-Kopieren die 512er nehmen und umbenennen)
- Erzeugen/Neuzeichnen mit dem PIL-Skript in `design/logos/novora-apps/` (Python + Pillow), danach Kopie nach `website/assets/logos/` und Katalog `icons.html` prüfen.

## Wichtig vor öffentlich

- Debug-APK ist ein Test-Build (Hinweis steht auf der Seite).
- Keine fremden Markenlogos in Marketing oder Screenshots.
- Keine Funktionen bewerben, die noch nicht existieren (z. B. Spotify-Suche).

## Windows-Pakete

Aktuelle Stände: **PC 0.4.0** (Setup/ZIP), **Android 0.1.7** (versionCode 8). Quelle ist `release\0.4.0\`,
Prüfsummen dort in `SHA256SUMS`. Linux ist im 0.4.0-Release **nicht enthalten** (kein Paket, kein Download).

| Datei in `downloads/` | Quelle | Größe | SHA-256 |
|---|---|---|---|
| `NovoraSetup-0.4.0.exe` | `release\0.4.0\windows\NovoraSetup-0.4.0.exe` | 24209210 B (23,1 MB) | `503dc0c90b680a1c65441aea9a6a948a163a3902528f3c873e7376555cf52ddb` |
| `novora-windows-x64.zip` | `release\0.4.0\windows\novora-0.4.0-win64.zip` | 33834040 B (32,3 MB) | `e0e63539bd62c5390f650c5c5df357b04f3baa79a5350510042b387e96b08c37` |
| `novora.apk` | `release\0.4.0\android\novora-0.1.7.apk` | 299889 B (293 KB) | `f40d4abb5fef7cef144dd6f34e2cda623a8681f892ce43002ddea2f9173cc04c` |

Inhalt des Windows-Pakets:

| Datei | Inhalt |
|---|---|
| `downloads/novora-windows-x64.zip` | `Novora.exe` (Starter) + `runtime\node.exe` + `app\` |

Bauen: `release\<version>/` ist die einzige Quelle der Pakete; `dist/build/` enthält nur Launcher/Icon.
Windows-Starter: `dist/build/launcher.c` (clang/llvm-mingw) + `launcher.rc` (Icon).
