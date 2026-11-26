# Drittanbieter-Komponenten und Lizenzen

Stand: 2026-11-24. Gilt für Software (`prototype/`), Installer, APK, Website und Mockups.

## Laufzeit / Software

| Komponente | Verwendung | Lizenz | Hinweis |
|---|---|---|---|
| Node.js 22 | Server + UI-Auslieferung (gebündelt in `runtime/`) | MIT | Copyright Node.js Foundation |
| WebView2 | Fenster-Rendering der PC-Software | Microsoft-Lizenz (Runtime, weiterverteilbar) | wird vom System bereitgestellt, nicht mitgeliefert |
| QR-Encoder | `prototype/web/qr.js` | eigene Implementierung | keine Fremdbibliothek |
| jsQR 1.4.0 | QR-Scanner im Handy-Web (`prototype/web/vendor/jsqr.js`) | Apache-2.0 | lokal mitgeliefert, unverändert |
| ZXing core 3.5.3 | QR-Dekodierung der APK-Kamera (`android/libs/core-3.5.3.jar`) | Apache-2.0 | nur in der APK |

## Symbole / Piktogramme (aktiv)

| Datei | Inhalt | Rechte |
|---|---|---|
| `design/icons/novora-icons/*.svg` | **aktiver** eigener Strich-Satz, 71 Piktogramme (24×24, 2 px Strich) | eigene Zeichnungen |
| `design/icons/novora-icons/index.json` | Kategorien/Labels der 71 Glyphen | eigene Arbeit |
| `design/icons/build-iconset.mjs` | Generator: `novora-icons/*.svg` → `prototype/web/iconset.js` (`window.NOVORA_ICONS`) | eigene Arbeit |
| `prototype/web/iconset.js` | generierte Symbol-Bibliothek der Software (71 Keys, `nv-*`) | eigene Zeichnungen |

Die Symbole sind **keine** Fremd-Icons: kein Font Awesome, kein Tabler, kein Simple Icons im
ausgelieferten Paket. `svg.ic` wird per `stroke: currentColor` gefärbt, Farbe kommt aus dem Theme.

## Programm- und Markenlogos

| Punkt | Stand |
|---|---|
| Bündelung | **keine.** `prototype/web/brandset.js` und `prototype/web/assets/brands/` (33 SVGs + 11 Wortmarken) wurden am 2026-11-24 gelöscht; `app.html` lädt kein `brandset.js` mehr |
| app.html | ohne `brandset.js`; `app.js`/`pc.js` lesen `window.NOVORA_BRANDS` nur mit Guard (`|| {}`) und fallen auf eigene Logos/Piktogramme zurück |
| Quelle zur Laufzeit | lokale Extraktion aus installierten Programmen: `desktop/icons/novora-icons.cpp` → `dist/tools/novora-icons.exe`, Wrapper `prototype/lib/appicons.mjs` |
| Cache | `%APPDATA%\Novora\icons` (PNG, 256 px) — bleibt auf dem Rechner des Nutzers |
| Netz | weder Helfer noch Wrapper laden oder senden etwas; keine CDN-Hotlinks, keine Icon-Pakete |
| Rechte | extrahierte Marken sind Eigentum der jeweiligen Inhaber. Anzeige nur **nominativ** auf dem Gerät des Nutzers; **keine Weiterverteilung**, kein Weiterverkauf, kein Icon-Paket, keine Werbung/Screenshots ohne Erlaubnis des Inhabers |
| Ersatz | nicht lokal ermittelbare Marke = fehlend melden, **nicht** nachzeichnen und nicht nachbauen; es greift das eigene Piktogramm/App-Logo |

## Rechtliche Einordnung: Markenlogos aus installierter Software

**Was wir NICHT tun (wäre rechtlich problematisch):**
- Keine Markenlogo-Dateien werden mitgeliefert (kein `brandset.js`, kein `assets/brands/`, kein Icon-Paket).
- Keine CDN-Hotlinks zu Markenlogos (kein `cdn.simpleicons.org`, kein Font Awesome CDN).
- Keine Nachzeichnungen oder Nachbauten von Markenlogos.
- Keine Werbung oder Screenshots mit Markenlogos ohne Erlaubnis des Inhabers.

**Was wir tun (rechtlich zulässig — nominativer Gebrauch / deskriptiver Gebrauch):**
- Die Software liest das **bereits auf dem Rechner des Nutzers installierte** Programm-Icon aus der lokalen `.exe`/UWP-Paket (via `IShellItemImageFactory` / `ExtractIconExW`).
- Das extrahierte Icon wird **nur lokal auf dem Gerät des Nutzers** angezeigt (nominative use: "dieses Programm steuern").
- Es wird **nichts** weitervertrieben, gespeichert (außer lokaler Cache `%APPDATA%\Novora\icons`), hochgeladen oder in Werbung verwendet.
- Die Marken bleiben Eigentum der jeweiligen Inhaber; Novora beansprucht keine Rechte daran.

**Warum das rechtlich zulässig ist:**
- Nominativer Gebrauch (deskriptiver Gebrauch) erlaubt die Verwendung eines Markenzeichens, um das markierte Produkt zu bezeichnen/zu identifizieren.
- Novora verwendet das Logo ausschließlich zur Identifikation des gesteuerten Programms auf dem Gerät des Nutzers.
- Es erfolgt keine Verwechslungsgefahr (Novora stellt sich nicht als die Marke dar) und keine Rufausnutzung.
- Die Extraktion erfolgt nur aus Software, die der Nutzer selbst installiert hat (keine Distribution von Markenmaterial).

**Haftungsausschluss:**
Novora ist nicht verantwortlich für die Markenrechte der extrahierten Icons. Der Nutzer ist dafür verantwortlich, dass er die entsprechende Software rechtmäßig installiert hat. Novora speichert, überträgt oder verbreitet keine Markenlogos.

## Historie: frühere Symbol- und Markenquellen (nicht mehr aktiv, nicht mehr im Release)

Diese Einträge bleiben nur zur Nachvollziehbarkeit. Keine Datei daraus wird ausgeliefert.

| Komponente (Historie) | War | Lizenz | Status |
|---|---|---|---|
| Font Awesome 4.7.0 (Icons) | Symbol-Icons, 71 Glyphen in `iconset.js` (Runde 6, 2026-11-23) | Icons SIL OFL 1.1, Code MIT (Copyright Dave Gandy) | **ersetzt** durch eigenen Strich-Satz am 2026-11-23/24 |
| Font Awesome 4.7.0 (Markenpfade) | 19 Markenpfade inline in `brandset.js` | Font SIL OFL 1.1; Markenrechte bei den Inhabern | **entfernt** (erst durch Hersteller-Dateien ersetzt, 2026-11-24 ganz gelöscht) |
| Hersteller-Markenlogos (gebündelt) | 32 SVG/PNG in `prototype/web/assets/brands/` + Pfad-Map `brandset.js` (35 Slugs inkl. 3 Aliase), Quellen in `SOURCES.md` | Marken der jeweiligen Inhaber, nur nominative Anzeige | **gelöscht 2026-11-24**, keine Bündelung mehr |
| Simple Icons (CDN) | Laufzeit-Abruf `cdn.simpleicons.org/<slug>` | Icon-Daten CC0 | **entfernt**, keine Hotlinks mehr im Code |
| Simple Icons (`brands.js`) | 97 Markenpfade | CC0 | Datei gelöscht |
| Tabler Icons (`icons.js`, `website/icons.js`) | 259 Symbole | MIT | Dateien gelöscht |

## Eigene Gestaltung

| Datei | Inhalt | Rechte |
|---|---|---|
| `design/logos/novora-apps/*.png` | 18 eigene App-Logos (PIL-generiert, generische Piktogramme) → `assets/logos/`, `prototype/web/applogos.js` | eigene Zeichnungen |
| `design/logo/novora/*` | Novora-Wortmarke und N-Monogramm | eigene Zeichnungen |

## Prüfliste

- [ ] `iconset.js` stammt aus `design/icons/build-iconset.mjs` (71 Keys), keine FA-/Tabler-Pfade mehr
- [ ] `prototype/web/brandset.js` fehlt und `prototype/web/assets/brands/` existiert nicht
- [ ] `installer/build.ps1` schließt `assets` und `brandset.js` aus dem Payload aus
- [ ] Keine Fremdlogos, Marken-SVGs oder Icon-Pakete in Installer/ZIP/APK/Website
- [ ] `novora-icons.exe` / `appicons.mjs` schreiben ausschließlich nach `%APPDATA%\Novora\icons`
- [ ] Extrahiert Icons werden nicht weiterverteilt (kein Upload, keine Weitergabe im Paket)
- [ ] Node.js-, WebView2-, jsQR- und ZXing-Hinweis vorhanden
- [ ] Diese Tabelle bei jeder neuen Fremdkomponente ergänzen (Version + Lizenz)
