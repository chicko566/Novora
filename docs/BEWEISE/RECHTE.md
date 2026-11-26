# Beweis: keine Fremd-Marken im Release, Icons nur lokal extrahiert

Ziel: belegen, dass im ausgelieferten Paket (ZIP, Setup, APK, Website-Screenshots) keine
fremden Markenlogos enthalten sind und dass Programm-Icons ausschliesslich lokal aus
installierten EXE-Dateien extrahiert und nie hochgeladen werden.

Regeln fuer dieses Dokument:

- Status ist je Pruefung eine von `offen`, `PASS`, `FAIL`.
- Ein `PASS` ist nur zulaessig, wenn der Befehl ausgefuehrt und die Ausgabe hier eingetragen wurde.
- Es werden keine Ergebnisse vorweggenommen. Zum Start sind alle Pruefungen `offen`.
- Alle Befehle laufen ab Repo-Wurzel `D:\Projekte\StreamDeck` in PowerShell.
- Keine Secrets, keine Schluessel, keine Zugangsdaten in dieses Dokument schreiben.

## Vorbefund (gelesen am 2026-11-24, nicht als Pruefung ausgefuehrt)

Diese Beobachtungen sind Quelltext-Lesungen und ersetzen keinen Prueflauf. Sie zeigen, wo
die Pruefungen voraussichtlich anschlagen.

| Beobachtung | Beleg |
|---|---|
| `prototype\web\assets\brands` existiert im Arbeitsstand nicht | `Test-Path` lieferte False |
| `prototype\web\brandset.js` existiert im Arbeitsstand nicht | Dateiliste `prototype\web` |
| `installer\payload\app\web\brandset.js` existiert dagegen noch (1890 Bytes, verweist auf `/assets/brands/*.svg`) - **zu entfernen**, Cleanup laeuft parallel | `installer\payload\app\web\brandset.js` |
| `installer\payload\app\web\assets\brands` existiert ebenfalls noch - **zu entfernen**, Cleanup laeuft parallel | `Test-Path installer\payload\app\web\assets\brands` lieferte True (2026-11-24) |
| `app.html` laedt kein `brandset.js` | `prototype\web\app.html` |
| `app.js` und `pc.js` lesen `NOVORA_BRANDS` nur mit Guard `|| {}` | `prototype\web\app.js:814`, `prototype\web\pc.js:169` |
| `THIRD-PARTY.md` behauptet, `brandset.js` und `assets/brands/` seien geloescht | `THIRD-PARTY.md`, Abschnitt "Programm- und Markenlogos" |
| `THIRD-PARTY.md` enthaelt Mojibake-Zeichen (ersetzte Umlaute) | Sichtpruefung der Datei |

Konsequenz: R1/R2/R4 sind erst PASS, wenn auch `installer\payload` bereinigt ist. Bis dahin
bleiben sie `offen`, auch wenn `prototype` sauber ist.

Stand 2026-11-24 (nachgeprueft): `prototype\web\assets\brands` = False,
`prototype\web\brandset.js` = False (sauber). `installer\payload\app\web\brandset.js` = True,
`installer\payload\app\web\assets\brands` = True (noch nicht entfernt). Zu loeschen sind genau
diese beiden Pfade im Payload, danach R2/R4 erneut ausfuehren. `THIRD-PARTY.md` behauptet
bereits die Loeschung; bis der Payload bereinigt ist, ist das Dokument dem Paket voraus.

## Icon-Extraktion aus EXE (Ist-Stand)

Programm-Icons werden ausschliesslich lokal aus installierten EXE-Dateien gelesen. Es gibt
keinen Upload und keinen externen Bilddienst.

| Punkt | Beleg |
|---|---|
| Helfer-Binary: `dist\tools\novora-icons.exe` (197120 Bytes), Quellen `desktop\icons\novora-icons.cpp` | `dist\tools\novora-icons.exe` |
| Node-Wrapper: `prototype\lib\appicons.mjs`, Aufruf per `spawn` mit Argumentarray (keine Shell) | `appicons.mjs:8`, `:20`, `:44` |
| Cache und Ausgabeort: `%APPDATA%\Novora\icons` | `appicons.mjs:5`, `:47` |
| EXE-Pfad bevorzugt aus `NOVORA_ICONS_EXE`, sonst `dist\tools\novora-icons.exe` | `appicons.mjs:44` |
| Kein Netzwerkpfad im Icon-Code: R10 prueft auf WinHttp/WinInet/fetch/upload/FormData | siehe R10 |

Damit ist die These "Icons nur lokal, kein Upload" im Code nachvollziehbar; der Beleg als
Prueflauf (R9, R10, R13, R14) steht noch aus.

## Pruefungen

### R1 - Markenordner fehlt im Web-Root

Befehl:

```powershell
Test-Path prototype\web\assets\brands
Get-ChildItem prototype\web\assets\brands -Recurse -ErrorAction SilentlyContinue
```

Erwartet: `False` und keine Ausgabe.

Ist: offen

### R2 - `brandset.js` in keiner Quelle und keinem Payload

Befehl:

```powershell
Get-ChildItem D:\Projekte\StreamDeck -Recurse -File -Filter brandset.js -ErrorAction SilentlyContinue | Select-Object FullName,Length
```

Erwartet: keine Ausgabe.

Ist: offen (Vorbefund 2026-11-24: Treffer in `installer\payload\app\web\brandset.js`, Datei ist
**zu entfernen**; Cleanup laeuft parallel)

### R3 - `NOVORA_BRANDS` nur mit Guard, kein Loader im HTML

Befehl:

```powershell
Select-String -Path prototype\web\*.js -Pattern 'NOVORA_BRANDS'
Select-String -Path prototype\web\*.html -Pattern 'brandset'
```

Erwartet: jede Fundstelle in JS steht in einer Zeile mit `|| {}` (Guard); die HTML-Suche
liefert keine Ausgabe (kein `<script src=".../brandset.js">`).

Ist: offen

### R4 - Installer-Payload ohne Markendateien

Befehl:

```powershell
Get-ChildItem installer\payload -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'brand|wordmark|logo' -or $_.FullName -match 'assets\\brands' } |
  Select-Object FullName,Length
```

Erwartet: keine Ausgabe. Ausnahme nur eigene Novora-Logos (`applogos.js`, `logos\nv-*`),
die ausdruecklich eigene Zeichnungen sind und hier begruendet aufgefuehrt werden.

Ist: offen (Vorbefund 2026-11-24: `installer\payload\app\web\assets\brands` liefert `True`, also
**zu entfernen**; Cleanup laeuft parallel)

### R5 - ZIP enthaelt keine Markenpfade

Befehl:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead('release\0.3.3\windows\novora-0.3.3-win64.zip')
$z.Entries | Where-Object { $_.FullName -match 'brand|assets/brands|wordmark' } | Select-Object FullName
$z.Dispose()
```

Erwartet: keine Ausgabe.

Ist: offen

### R6 - APK enthaelt keine Marken-Assets

Befehl:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$a=[IO.Compression.ZipFile]::OpenRead('release\0.3.3\android\novora-0.1.7.apk')
$a.Entries | Where-Object { $_.FullName -match 'brand|wordmark|logo' } | Select-Object FullName
$a.Dispose()
```

Erwartet: nur eigene Novora-Ressourcen (`res/mipmap-*/ic_launcher*`, `assets/novora-*`),
keine Fremdmarken-Dateien.

Ist: offen

### R7 - Setup-Datei installiert ohne Markenlogos

Befehl (Installation in ein Temp-Verzeichnis, danach scannen):

```powershell
$dst="$env:TEMP\novora-proof"
Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
Start-Process -FilePath 'installer\out\NovoraSetup-0.3.3.exe' -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=$dst" -Wait
Get-ChildItem $dst -Recurse -File | Where-Object { $_.Name -match 'brand|wordmark|logo' -or $_.FullName -match 'assets\\brands' } | Select-Object FullName,Length
```

Erwartet: keine Ausgabe ausser eigenen Novora-Logos. Zusaetzlich Sichtpruefung der
installierten `app\web`-Dateiliste gegen R2.

Ist: offen

### R8 - ZIP und Setup enthalten die Zeichenkette `brandset` nicht

Befehl (binaere Suche; ZIP vorher entpacken, Setup siehe R7):

```powershell
node -e "const fs=require('fs');const f=process.argv[1];const b=fs.readFileSync(f);console.log(f, b.includes(Buffer.from('brandset'))?'TREFFER':'keine Treffer')" installer\out\NovoraSetup-0.3.3.exe
```

Erwartet: `keine Treffer` fuer Setup und fuer alle Dateien im entpackten ZIP.

Ist: offen

### R9 - Icon-Helfer schreibt nur nach `%APPDATA%\Novora\icons`

Befehl:

```powershell
Select-String -Path desktop\icons\novora-icons.cpp,prototype\lib\appicons.mjs -Pattern 'APPDATA|Novora\\icons|SHGetKnownFolderPath'
& dist\tools\novora-icons.exe --exe C:\Windows\System32\notepad.exe --out "$env:TEMP\nv-icon-proof.png" --size 256
Get-Item "$env:TEMP\nv-icon-proof.png" | Select-Object FullName,Length
Get-ChildItem "$env:APPDATA\Novora\icons" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name,Length,LastWriteTime
```

Erwartet: Codepfad zeigt auf `%APPDATA%\Novora\icons`; der Aufruf endet mit Exitcode 0,
erzeugt ein PNG 256x256 und keinen Schreibvorgang ausserhalb von `--out` und dem
Icon-Cache.

Ist: offen

### R10 - Kein Netzwerkzugriff im Icon-Pfad

Befehl:

```powershell
Select-String -Path desktop\icons\novora-icons.cpp,prototype\lib\appicons.mjs -Pattern 'WinHttp|winhttp|WinInet|URLDownload|fetch\(|https?://|upload|FormData'
```

Erwartet: keine Treffer in ausfuehrbarem Code. Treffer in Kommentaren sind einzeln zu
benennen und als Kommentar zu belegen. Zusatzpruefung (empfohlen): `novora-icons.exe` und
`appicons.mjs` mit gezogenem Netzwerkkabel bzw. in einer Firewall-Regel ohne Ausgang
ausfuehren; Ergebnis muss identisch sein.

Ist: offen

### R11 - Quellen und Lizenzen dokumentiert

Befehl:

```powershell
Get-Content THIRD-PARTY.md -Encoding UTF8 -TotalCount 80
Select-String -Path THIRD-PARTY.md -Pattern 'jsQR|ZXing|Apache-2.0|eigene Zeichnungen|nominativ'
```

Erwartet: je Fremdkomponente Lizenz und Herkunft; Markenlogos als "keine Buendelung"
dokumentiert; keine erfundenen Lizenzangaben; Datei ohne Ersatzzeichen (U+FFFD).

Ist: offen (Vorbefund: Mojibake in der Datei, daher voraussichtlich FAIL bei der
Umlaut-Pruefung)

### R12 - Screenshots und Website ohne Fremdlogos

Befehl (Kandidaten auflisten):

```powershell
Get-ChildItem website,release,docs -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp -ErrorAction SilentlyContinue | Select-Object FullName,Length
```

Danach jedes Bild oeffnen und gegen die Liste der erlaubten eigenen Novora-Logos pruefen.
Erwartet: keine Fremdmarken (Spotify, Discord, YouTube, Steam, Twitch, GitHub, Chrome,
Firefox, Windows, Apple, Android, Slack, Reddit, WhatsApp, Instagram, TikTok, Netflix usw.);
eigene Novora-Zeichen erlaubt.

Ist: offen

## Abschlusskriterien

- R1 bis R8 sind PASS: weder Quellbaum noch Payload, ZIP, Setup oder APK enthalten
  Marken-Bilddateien oder den Loader `brandset.js`.
- R9 und R10 sind PASS: Extraktion nur lokal, Cache nur unter `%APPDATA%\Novora\icons`,
  kein Netzwerkpfad im Helfer oder Wrapper.
- R11 ist PASS: Lizenzen und Herkunft vollstaendig, Text korrekt kodiert.
- R12 ist PASS: alle veroeffentlichten Bilder ohne Fremdlogos.
- Widersprueche zwischen `THIRD-PARTY.md` und tatsaechlichem Paket sind vor Abschluss
  behoben (Dokument oder Paket, nie beides unabhaengig).

## Pruefprotokoll

| Pruefung | Datum | Ausgefuehrt von | Ergebnis | Beleg (Ausgabe/Datei) |
|---|---|---|---|---|
| R1 | | | offen | |
| R2 | | | offen | |
| R3 | | | offen | |
| R4 | | | offen | |
| R5 | | | offen | |
| R6 | | | offen | |
| R7 | | | offen | |
| R8 | | | offen | |
| R9 | | | offen | |
| R10 | | | offen | |
| R11 | | | offen | |
| R12 | | | offen | |
