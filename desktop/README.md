# Novora – native Windows-Shell

Eigenes Win32-Fenster (1280×800, Titel „Novora"), das die lokale Oberfläche
`http://127.0.0.1:47830/pc` per WebView2 anzeigt. Kein Browser-Tab, kein
Electron – eine kleine EXE.

## Bauen

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\native\build.ps1
```

Das Skript

1. entpackt `desktop\webview2.nupkg` nach `desktop\sdk\` (nur beim ersten Mal, `tar -xf`),
2. kompiliert `desktop\native\main.cpp` mit
   `D:\Tools\LLVM-MinGW\llvm-mingw-20261020-ucrt-x86_64\bin\x86_64-w64-mingw32-clang++.exe`
   (Fallback: `clang++` aus dem PATH),
3. linkt `-lole32 -loleaut32 -luuid -luser32 -lgdi32 -lshell32` (+ `-lws2_32` für den Port-Test),
4. kopiert `WebView2Loader.dll` neben die EXE und prüft den PE-Header (`MZ`).

Ergebnis: `desktop\out\Novora.exe` (~150 KB) + `desktop\out\WebView2Loader.dll`.

## Ordnerlayout (Verteilung)

```
Novora\
  Novora.exe            ← native Shell
  WebView2Loader.dll    ← WebView2-Loader (x64), MUSS neben der EXE liegen
  runtime\node.exe      ← Node-Laufzeit, startet den Server bei Bedarf
  app\                  ← server.mjs, web\, lib\, audio\, data.json
  userdata\             ← wird beim ersten Start von WebView2 angelegt
  novora-start.log      ← Startprotokoll (Port-Status, Serverstart)
```

`runtime\` und `app\` müssen im selben Ordner wie die EXE bleiben.

## Verhalten

- Beim Start prüft die EXE per TCP-Connect, ob `127.0.0.1:47830` offen ist.
- Ist der Port zu, wird `runtime\node.exe app\server.mjs` versteckt
  (`CREATE_NO_WINDOW`, Arbeitsverzeichnis = `app\`) gestartet; danach wartet
  die Shell bis zu 10 s auf den Port.
- Danach lädt sie `WebView2Loader.dll` dynamisch (`LoadLibraryW` +
  `GetProcAddress("CreateCoreWebView2EnvironmentWithOptions")`) und erzeugt
  Environment/Controller über rohe COM-Handler (kein WRL, kein MSVC-Header-Zwang).
- Der Controller folgt der Fenstergröße (`WM_SIZE`), DevTools sind deaktiviert,
  User-Data-Ordner ist `<EXE-Ordner>\userdata`.
- Das Fenster wird erst geöffnet, nachdem die Seite erreichbar ist; schließt
  man es, wird nur die Shell beendet, der Serverprozess läuft weiter.

Headless-Prüfung ohne Fenster:

```powershell
desktop\out\Novora.exe --selftest
# schreibt out\selftest.log:
#   loader_dll_loaded=1
#   CreateCoreWebView2EnvironmentWithOptions=1
#   server_47830_reachable=0|1
# Exit 0 = Loader + Export gefunden
```

## Voraussetzungen

- **WebView2-Runtime** (Evergreen). Auf Windows 10/11 mit Microsoft Edge bereits
  vorhanden; sonst „WebView2 Runtime“ von Microsoft installieren.
- x64-Windows.

## MinGW-Kompatibilität

`WebView2.h` aus dem NuGet-Paket kompiliert unverändert mit llvm-mingw
(ucrt, clang++ 20). Das Paket bringt MinGW-taugliche `MIDL_INTERFACE`-Includes
mit; die IIDs sind im Header als `__declspec(selectany)` inline definiert,
daher ist keine zusätzliche Import-Bibliothek für die Interfaces nötig.
Nur `WebView2Loader.dll` wird zur Laufzeit gebraucht.

## Start / Beenden

- Start: `Novora.exe` doppelklicken (oder Verknüpfung auf `desktop\out\Novora.exe`).
- Beenden: Fenster schließen. Hängt ein alter Server, Port 47830 prüfen und den
  `node.exe`-Prozess ggf. beenden.
