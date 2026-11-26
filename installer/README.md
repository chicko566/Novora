# Novora Installer

Windows-Setup-EXE (Inno Setup 6) fuer Novora. Installiert die native WebView2-Huelle,
eine gebundelte Node-Runtime und die Web-App in den Benutzerordner. Kein Browser,
kein ZIP, keine Admin-Rechte.

## Bauen

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Projekte\StreamDeck\installer\build.ps1
```

Ergebnis: `installer\out\NovoraSetup-0.3.0.exe` (ca. 22 MB).
Version steht an zwei Stellen: `$Version` in `build.ps1` und `#define MyAppVersion`
in `Novora.iss` (Default `0.3.0`, wird per `/DMyAppVersion=` ueberschrieben).

Voraussetzungen: Inno Setup 6 (`ISCC.exe`), `desktop\out\Novora.exe` +
`WebView2Loader.dll`, Node (`node.exe`, wird als `runtime\node.exe` mitgeliefert).

`build.ps1` legt `installer\payload\` neu an:

```
payload\Novora.exe
payload\WebView2Loader.dll
payload\runtime\node.exe
payload\app\          (prototype\ ohne docs, test, data.json, README, Startskripte)
```

## Installieren

Doppelklick auf `NovoraSetup-0.3.0.exe`, oder still:

```powershell
.\NovoraSetup-0.3.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="$env:LOCALAPPDATA\Novora"
```

Standardziel: `%LOCALAPPDATA%\Novora` (pro Benutzer, keine Admin-Rechte).
Verknuepfungen: Startmenue `Novora` (Ordner mit Programm- und Deinstallations-Link)
sowie optional Desktop (Task `desktopicon`, im Setup vorausgewaehlt).

## Deinstallieren

Windows-Einstellungen -> Apps -> Novora, oder:

```powershell
& "$env:LOCALAPPDATA\Novora\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

Der Deinstaller entfernt Programm, Runtime, App-Dateien und Verknuepfungen.
Einstellungen/Layout bleiben erhalten (siehe Daten).

## Daten

Novora speichert Layout, Seiten und Geraete in:

```
%LOCALAPPDATA%\Novora\app\data.json
```

Das ergibt sich aus dem App-Aufbau: `lib\store.mjs` legt `data.json` neben
`app\server.mjs` ab (der Ordner ueber `lib\`), also im Programmordner unter `app\`.
Beim ersten Start entsteht die Datei aus den Standardwerten. Eine Datei
`%LOCALAPPDATA%\Novora\data.json` (ohne `app\`) wird von der App nicht gelesen.

Abweichender Speicherort moeglich: Umgebungsvariable `NOVORA_DATA` auf einen
vollen Dateipfad setzen, z. B. `NOVORA_DATA=%USERPROFILE%\Novora-data.json`.

Vor einem Update sichern: `app\data.json` kopieren. Der Installer ueberschreibt
sie nicht.

## WebView2

Novora zeigt sein Fenster mit Microsoft Edge WebView2. Das Setup prueft beim Start
Registry (`HKLM`/`HKCU`, `Microsoft\EdgeUpdate\Clients\{F3017226-...}`) und
zusaetzlich den Runtime-Ordner `Microsoft\EdgeWebView\Application`. Fehlt die
Runtime, erscheint eine Warnung mit Hinweis auf die Evergreen-Runtime; die
Installation laeuft trotzdem weiter (Deinstallation bleibt moeglich). Es wird
nichts heruntergeladen.

Evergreen Standalone Runtime (einmalig, kostenlos):
<https://developer.microsoft.com/microsoft-edge/webview2/>

## Testinstallation (still, ohne echtes System)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Projekte\StreamDeck\installer\test-install.ps1
```

Installiert nach `%TEMP%\novora-install-test`, prueft Dateien, Startmenue-Link,
Uninstall-Eintrag und Version, deinstalliert wieder und raeumt auf. Die App wird
nicht gestartet. Eine bereits vorhandene echte Installation bleibt unberuehrt:
Startmenue-Link und Uninstall-Registry-Eintrag werden gesichert und
wiederhergestellt.
