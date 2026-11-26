# Novora Icon-Satz

Eigene Zeichnungen für das Novora-Steuerpult. Kein fremdes Icon-Paket, keine Markenlogos.

**Lizenz:** Eigene Zeichnungen, alle Rechte beim Projekt.

## Regeln (verbindlich)

1. Keine offiziellen Logos oder Symbole von Apps/Plattformen (kein Clyde, keine Schallwellen-Marke, kein bunter Ring, kein Play-Button-Logo, keine Streaming-Klingen).
2. Nichts nachzeichnen, umfärben oder verzerren, was am Original erkennbar wäre.
3. Keine Markennamen in Datei-, Key- oder Icon-Namen (`voice-chat.svg`, nicht `discord.svg`).
4. Keine fremden Icon-Pakete kopieren – jede Linie selbst zeichnen.
5. Keine typischen Erkennungsmerkmale (grüner Kreis mit drei Bögen, dreifarbiger Ring, Geist-Form, Controller mit Gesicht).
6. Neutrale Piktogramme: 24×24 `viewBox`, Strichstärke 2, runde Linienenden/-ecken, `stroke="currentColor"`, `fill="none"`. Farbe kommt per CSS.

## Aufbau

```
design/icons/
  build-iconset.mjs        Generator -> prototype/web/iconset.js
  novora-icons/
    <key>.svg              ein Icon pro Datei (Dateiname == Key)
    index.json             {count, icons:[{key,label_de,label_en,category,tags[]}]}
    preview.html           dunkle Vorschau (Dateien per <img> + Inline aus iconset.js)
    README.md
prototype/web/iconset.js   generiert: window.NOVORA_ICONS = {key:{label,cat,svg}}
```

**Bestand:** 70 Icons in 4 Kategorien – `medien` (18), `kommunikation` (7), `system` (17), `dateien` (28).

Die Werte in `iconset.js` enthalten den **inneren** SVG-Inhalt (in ein `<g>` gefasst, ohne `<svg>`-Rahmen),
damit die UI den Rahmen selbst setzt:

```html
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"></svg>
<script>el.innerHTML = NOVORA_ICONS.mic.svg;</script>
```

## Icon ergänzen

1. `<key>.svg` in `novora-icons/` anlegen – vollständiger Rahmen:
   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">…</svg>`
   Nur `path`, `circle`, `rect`, `line`, `polyline`, `polygon`. Kein `<style>`, kein `<image>`, keine externen Referenzen, keine Farbcodes.
2. Eintrag in `index.json` ergänzen (`key`, `label_de`, `label_en`, `category`, `tags`).
3. `node design/icons/build-iconset.mjs` ausführen.
4. `preview.html` über einen lokalen HTTP-Server öffnen (z. B. `python -m http.server 47843`) und prüfen.

Der Generator ist deterministisch (Keys alphabetisch sortiert, keine Zeitstempel in der Ausgabe).

## Prüfung

- gleiche Strichstärke und optisch gleiche Größe über alle Icons
- keine Markenfarben, keine `fill`-Werte außer `none`
- keine Duplikate (gleicher Pfad-Inhalt unter zwei Keys)
- Dateiname == Key, Keys eindeutig, keine Markennamen
- `node --check prototype/web/iconset.js`
