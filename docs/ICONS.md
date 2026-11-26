# Icons & Logos — Regeln und Stand

Stand: **2026-11-24**. Gilt für Software (`prototype/`), Installer, APK, Website und Mockups.

Kurzfassung: **Piktogramme = eigener Strich-Satz (70 Glyphen). Markenlogos werden nicht mehr
gebündelt.** Fremde Markenlogos kommen, wenn überhaupt, erst zur Laufzeit lokal aus den auf dem
Gerät installierten EXE-Dateien (`novora-icons.exe` + `prototype\lib\appicons.mjs`). Alles andere
ist eigene Zeichnung. Nachzeichnen und Umfärben von Marken bleibt verboten.

## 1. Eigener Glyph-Satz (aktiv)

- **70 eigene Strich-Glyphen**, Quelle `design\icons\novora-icons\` (70 SVGs, 76 Dateien inkl.
  `index.json`, `preview.html`, `README.md`).
- Generator: `design\icons\build-iconset.mjs` (deterministisch) → `prototype\web\iconset.js`
  mit `window.NOVORA_ICONS`. Nur die SVG-Quelle bearbeiten, nie die generierte Datei.
- Form: 24×24 Raster, 2 px Strich, SVG-Gruppe `<g fill="none" stroke="currentColor" …>`.
- Farbe ausschließlich über `stroke: currentColor` → kommt aus dem Theme (Akzent-/Tastenfarbe),
  nie aus einer Marke.
- Key-Muster: `nv-<key>` (`nv-music`, `nv-voice-chat`, `nv-folder`), Kategorien medien,
  kommunikation, system, dateien. Nicht genutzte Keys sind Reserve, kein Fehler.
- Website-Katalog: `website\icons.html` (Suche, Kategorien) mit Kopie
  `website\icons\iconset.js`.
- Historie: `icons.js` (Tabler), `brands.js` (Simple Icons), `brandset.js` (Marken-Pfad-Map) und
  `assets\brands\` sind entfernt; FA-4.7 war nur Zwischenstand und ist keine Quelle mehr.

## 2. App- und Markenlogos (kein Bündel mehr)

### 2.1 Regel

- **Im Release liegt keine fremde Markenlogo-Datei.** Kein `brandset.js`, kein `assets\brands\`,
  kein CDN-Hotlink, kein Icon-Paket.
- Wird ein Programm/eine Website konkret gezeigt (Mixer-Zeile, Bibliothek), wird das Logo **lokal
  auf dem Gerät des Nutzers erzeugt**: aus der installierten `.exe` bzw. dem UWP-Paket.
- Was sich nicht lokal ermitteln lässt, wird **nicht nachgebaut**: es greift die eigene
  Fallback-Kette (2.3). Fehlende Marke = als fehlend melden, nicht ersetzen.

### 2.2 Lokale EXE-Extraktion

| Baustein | Pfad | Aufgabe |
|---|---|---|
| Helfer (Win32, C++) | `desktop\icons\novora-icons.cpp` | liest Icons aus EXE/UWP, `--list` installierter Apps, `--foreground` |
| Helfer (gebaut) | `dist\tools\novora-icons.exe` | wird mitgeliefert, Aufruf mit Argument-Array, kein Shell, kein Netz |
| Node-Wrapper | `prototype\lib\appicons.mjs` | `listInstalled()`, `foreground()`, `extractExe(path)`, `extractForeground(size)` |
| Cache | `%APPDATA%\Novora\icons` | extrahierte PNGs (256 px, SHA-256-basiert), Aufräumen per `cleanup()` |

- Aufrufe sind auf lokale Dateisystem-Pfade beschränkt, mit Timeouts; **kein Upload, kein Netz**.
- Die extrahierten PNGs bleiben auf dem Rechner des Nutzers und werden **nicht weiterverteilt**
  (nicht in Installer, ZIP, APK, Website, Screenshots).
- Rechte an den extrahierten Marken liegen bei den jeweiligen Inhabern; die Anzeige ist rein
  nominativ (Kennzeichnung des verknüpften Programms auf dem Gerät des Nutzers).

### 2.3 Fallback-Kette der Darstellung

1. lokal extrahiertes Programm-Icon (falls vorhanden),
2. eigenes App-Logo aus `prototype\web\applogos.js` (`window.NOVORA_APPLOGOS`),
3. eigenes Piktogramm aus `iconset.js` (`nv-*`),
4. neutrales Fenster-Piktogramm (`nv-app`).

`app.js`/`pc.js` lesen `window.NOVORA_BRANDS` nur mit Guard (`window.NOVORA_BRANDS || {}`);
ohne `brandset.js` ist die Map leer, es greift automatisch Stufe 2–4. Kein Fehler, kein Crash.

### 2.4 Darstellung

- Marken-/Programm-Icons nur als Bild (`<img … object-fit: contain>`), nie als Inline-SVG.
- Kein `fill: currentColor`, kein Umfärben, keine Strich-Normalisierung, keine Verzerrung.
- Eigene Glyphen dagegen immer als SVG mit `stroke: currentColor`.

### 2.5 Offener Punkt

- `prototype\web\pc.html` lädt in Zeile 647 noch `<script src="/brandset.js"></script>`. Die Datei
  existiert nicht mehr (404, wirkungslos). Script-Tag bei der nächsten Änderung an `pc.html`
  entfernen; zusätzlich nennen `pc.js` (Zeilen 105, 167, 1315, 1375) `brandset.js` noch in
  Kommentaren/Hinweistexten.

## 3. App-Kacheln (eigene PNG)

- **18 eigene PNG-Motive** in `prototype\web\logos\` für generische Aktionen (Musik, Video,
  Sprach-Chat, Browser, Spiele, Stream, Code, Bild, Dateien, Mail, …).
- `prototype\web\applogos.js` mappt **33 Icon-Keys** auf diese 18 Dateien.
- Diese Motive sind keine Marken und dürfen nicht mit Hersteller-Logos verwechselt werden.

## 4. Aliase und Übergangs-Mapping

Marken-Aliase (`youtube-play`, `chrome`, `git`) gab es nur in `brandset.js`; mit der Datei sind
sie entfallen. Eine Zuordnung Marken-Key → Piktogramm-Key bleibt sinnvoll, wenn bewusst **kein**
Programm-Icon gezeigt wird (generische Aktion statt konkretes Programm):

| alt (Brand-Key) | Piktogramm-Key |
|---|---|
| `spotify`, `music` | `music` |
| `discord`, `teams`, `voice` | `voice-chat` |
| `chrome`, `edge`, `firefox`, `browser` | `browser` |
| `steam`, `epicgames`, `battlenet`, `game` | `games` |
| `obs`, `streamlabs`, `stream` | `stream` |
| `youtube`, `netflix`, `video` | `video` |
| `twitch` | `stream` |
| `vscode`, `code`, `terminal` | `code` / `terminal` |
| `blender`, `figma`, `photoshop`, `image` | `image` |
| `zoom`, `video-call` | `video-call` |
| `mail`, `outlook`, `thunderbird` | `mail` |
| `explorer`, `folder`, `files` | `folder` / `files` |
| `settings`, `gear`, `tool` | `settings` / `tool` |
| alles Unbekannte | `app` (neutrales Fenster-Piktogramm) |

Text-Regel: Markennamen dürfen als **Text** stehen, wo reale Programme gemeint sind
(Mixer-Zeile „Spotify"), aber nicht als Werbeversprechen und nicht als Dateiname eines eigenen
Assets.

## 5. Wo was liegt

| Bereich | Pfad |
|---|---|
| Glyphen (Quelle) | `design\icons\novora-icons\*.svg` + `index.json` (70 SVGs, 76 Dateien) |
| Glyphen (Generator) | `design\icons\build-iconset.mjs` |
| Glyphen (Software) | `prototype\web\iconset.js` (`window.NOVORA_ICONS`, 70 Keys) |
| Glyphen (Website) | `website\icons\iconset.js` (Kopie) + `website\icons.html` (Katalog) |
| Programm-Icons (Helfer) | `desktop\icons\novora-icons.cpp` → `dist\tools\novora-icons.exe` |
| Programm-Icons (Node) | `prototype\lib\appicons.mjs` (+ Cache `%APPDATA%\Novora\icons`) |
| Programm-Icons (Darstellung) | `<img class="brandmark">` / `.tile-applogo` in `app.js` / `pc.js` |
| App-Kacheln | `prototype\web\logos\` (18 PNG) + `prototype\web\applogos.js` (33 Keys) |
| Marken-Dateien | **keine im Repo/Release** (`assets\brands\` und `brandset.js` gelöscht 2026-11-24) |

## 6. Stand 2026-11-24

| Bereich | Status |
|---|---|
| Symbol-Icons | eigener Strich-Satz, 70 Glyphen in `iconset.js`, `stroke: currentColor` |
| Font Awesome | vollständig entfernt, keine FA-Dateien im Repo |
| Gebündelte Markenlogos | **entfernt**: `brandset.js` + `assets\brands\` (33 SVG + 11 Wortmarken) gelöscht |
| Programm-Icons | lokal aus EXE/UWP extrahiert (`novora-icons.exe`, `appicons.mjs`), Cache nur lokal |
| Darstellung Marken | `<img>`, kein Umfärben, kein Inline-SVG; ohne lokales Logo greift der eigene Satz |
| App-Kacheln | 18 eigene PNG-Motive + `applogos.js` (33 Keys) |
| Website | `icons.html` + `icons\iconset.js` (Kopie der 70 Glyphen) |
| Rechte | keine Fremdlogos im Paket; extrahierte Icons nur lokal, keine Weiterverteilung |

## 7. Prüfliste vor Release

- [ ] `iconset.js` hat 70 `nv-*`-Keys und stammt aus `build-iconset.mjs`.
- [ ] `prototype\web\assets\brands\` existiert nicht und `brandset.js` fehlt.
- [ ] `app.html` lädt kein `brandset.js` (grep `brandset` in `prototype\web` = 0 außer Doku).
- [ ] Kein Fremdlogo in Installer-Payload, ZIP, APK oder Website (keine Marken-SVGs/PNGs gebündelt).
- [ ] `novora-icons.exe` und `appicons.mjs` schreiben nur nach `%APPDATA%\Novora\icons`, kein Netz.
- [ ] Marken werden nirgends umgefärbt oder nachgezeichnet.
- [ ] Keine `si-*`-/`tb-*`-Keys mehr in Code oder `data.json`.
- [ ] `applogos.js` verweist nur auf vorhandene PNG in `prototype\web\logos\`.
- [ ] `pc.html`-Script-Tag `/brandset.js` entfernt (siehe 2.5).

Prüfzeile: Stand 2026-11-24, Zahlen aus Repo gegengelesen (`iconset.js` 70 Keys, 18 PNG in
`logos\`, `assets\brands\` gelöscht, `brandset.js` gelöscht); UTF-8, 0× U+FFFD, 0× CP1252-Mojibake.
