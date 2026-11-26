# Novora Icon Helper (`novora-icons`)

Windows-Helfer für Novora, der App-Icons aus installierten EXE-Dateien als PNG
extrahiert, installierte Apps auflistet und das aktive Fenster meldet. Dazu die
Node-Anbindung `prototype/lib/appicons.mjs`.

Kein Netzwerk, kein Upload, keine Schreibvorgänge außer der angeforderten
`--out`-Datei (Node schreibt zusätzlich den lokalen Icon-Cache).

## Bauen

```powershell
powershell -ExecutionPolicy Bypass -File desktop\icons\build.ps1
```

Ergebnis: `dist\tools\novora-icons.exe` (Kompiler wie `desktop\native`:
LLVM-MinGW `x86_64-w64-mingw32-clang++`, Linklibs ole32/oleaut32/uuid/shell32/
shlwapi/windowscodecs/gdiplus/gdi32/user32/advapi32). Das Skript prüft den
MZ-Header und gibt die Dateigröße aus.

## Kommandos

```powershell
# aktives Fenster: Pfad, Titel, Prozessname
dist\tools\novora-icons.exe --foreground

# Icon einer EXE als PNG (Standardgröße 256, erlaubt 16..1024)
dist\tools\novora-icons.exe --exe C:\Windows\System32\notepad.exe --out %TEMP%\notepad.png --size 256

# installierte Apps (Startmenü, App Paths, shell:AppsFolder)
dist\tools\novora-icons.exe --list

# UWP-Paketlogo über Paketfamilie (best effort)
dist\tools\novora-icons.exe --uwp Microsoft.WindowsNotepad_8wekyb3d8bbwe --out %TEMP%\np.png
```

Alle Kommandos außer `--help` antworten mit JSON auf stdout. Fehler sind
`{"ok":false,"error":"code","message":"..."}` mit Exitcode 1.

Iconquellen in dieser Reihenfolge: `SHCreateItemFromParsingName` +
`IShellItemImageFactory::GetImage` (SIIGBF_ICONONLY|SIIGBF_BIGGERSIZEOK),
danach `ExtractIconExW` und `SHGetFileInfoW`. PNG-Ausgabe über WIC, Skalierung
auf die Zielgröße mit Fant (verkleinern) bzw. Cubic (vergrößern).

## Node-Anbindung

```js
import { extractExe, extractForeground, foreground, listInstalled, iconPath, cleanup } from './prototype/lib/appicons.mjs';

const apps = await listInstalled();          // { ok, apps: [{ name, path, source }] }
const fg = await foreground();               // { ok, path, title, process, pid }
const icon = await extractExe('C:\\Windows\\System32\\notepad.exe', 128);
// -> { ok, id, pngPath, sha256, width, height, size, cached }
const fgIcon = await extractForeground(256);
iconPath(icon.id);                           // PNG-Pfad im Cache oder null
cleanup(500);                                // alte Cache-Dateien löschen
```

Der Helfer wird als Argumentarray per `spawn` gestartet (keine Shell), jeder
Aufruf hat ein Timeout, pro Aufruf wird genau ein Icon extrahiert.

## Cache

`%APPDATA%\Novora\icons\<sha256(exePfad+mtime+groesse)>.png` plus
`<id>.json` mit `exePath, size, sha256, width, height, mtimeMs, createdAt`.
`cleanup(500)` behält die 500 zuletzt genutzten Icons und räumt Temp-Reste weg.

## Grenzen

- UWP-Apps werden in `--list` über `shell:AppsFolder` geführt; ihr `path` ist
  dann `shell:AppsFolder\<familie>!<AppId>` statt eines EXE-Pfads. Die
  Icon-Extraktion funktioniert über diesen Shell-Namen, `--uwp` nutzt zusätzlich
  `AppxManifest.xml` (Logo-Angaben) — beides ist best effort.
- Fehlt eine EXE, ein Icon oder ein Schreibrecht, kommt JSON mit
  `ok:false`; es wird nichts erfunden und keine Buchstabenkachel erzeugt (das
  ist Sache der UI).
- Symbole fremder Programme werden nur lokal gecacht und angezeigt. Sie
  gehören nicht ins Installationspaket, auf den Server oder in ein Release
  (Marken-/Urheberrecht).

## Debug

Diagnose auf stderr gibt es nur mit gesetzter Umgebungsvariable
`NOVORA_ICONS_DEBUG=1`. Ohne sie schreibt der Helfer nichts nach stderr.
