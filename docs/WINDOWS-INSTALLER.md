# Windows-Software bauen und installierbar machen

Stand: 2026-11-23 · Projekt Novora (`D:\Projekte\StreamDeck`)

Belegstatus: **[V]** = in dieser Sitzung verifiziert (Build/Test/Tool vorhanden), **[D]** = aus dokumentierten Quellen abgeleitet, **[K]** = eigene Konstruktion/Empfehlung.

---

## 1. Was „installierbar“ auf Windows bedeutet

Eine EXE allein ist noch keine Installation. Installierbar heißt: Setup-Programm legt Dateien an einen festen Ort, erzeugt Verknüpfungen (Startmenü/Desktop), schreibt einen Deinstallations-Eintrag und entfernt alles wieder sauber.

| Form | Werkzeug | Stärke | Grenze | Für Novora |
|---|---|---|---|---|
| **EXE-Setup (Inno Setup)** | Skript + ISCC | einfach, per-user ohne Admin, kleine Setup-Datei, Uninstaller automatisch | kein MSI (keine GPO-Verteilung/`msiexec /x`-Reparatur) | **gewählt [V]** |
| EXE-Setup (NSIS) | Skript | sehr klein, sehr flexibel | eigene Skriptsprache, mehr Handarbeit | Alternative |
| MSI (WiX) | XML-Toolchain | Enterprise-Verteilung, Reparatur, Rollback | Lernkurve, Dienste/Komponenten-Modell | später optional |
| MSIX | Packaging-Tool | saubere Updates/Deinstallation, Store-fähig | Dienste/Treiber/ältere Win32-Annahmen passen nicht immer | später optional |
| Portable ZIP | keine | keine Installation nötig | keine Verknüpfung/Deinstallation, Nutzer muss Ordner finden | nur als Zusatz |

**[D]** Quelle: Vergleich MSI/MSIX/ClickOnce/xcopy (comcomponent.com), WiX vs. Inno (advancedinstaller.com), Installer-Vergleich 2026 (rankite.com).

**[K]** Für Novora: EXE-Setup per Inno Setup, pro Benutzer nach `%LOCALAPPDATA%\Novora`, keine Adminrechte, keine Dienste, keine Registry außer dem Uninstall-Eintrag.

---

## 2. Aufbau der Novora-App (was installiert wird)

```
%LOCALAPPDATA%\Novora\
  Novora.exe                 native Win32-Hülle, eigenes Fenster (WebView2)
  WebView2Loader.dll         lädt die Edge-WebView2-Runtime
  runtime\node.exe           mitgelieferte Node-Runtime
  app\server.mjs             lokaler Server (Port 47830)
  app\lib\  app\web\  app\audio\  app\worker.ps1
  app\data.json              entsteht beim ersten Start (Layout, Geräte, Einstellungen)
```

Beim Start prüft `Novora.exe`, ob Port 47830 antwortet; wenn nicht, startet es `runtime\node.exe app\server.mjs` versteckt und wartet, dann öffnet es das Fenster auf `http://127.0.0.1:47830/pc`. Kein Browser-Tab, keine URL-Eingabe, kein separater Server-Start durch den Nutzer. **[V]**

Warum Node mitliefern: Der PC braucht keine Node-Installation; Updates der Oberfläche kommen über `app\web\` ohne neues Setup.

---

## 3. Build-Kette (Schritt für Schritt)

1. **Native Hülle bauen** — `desktop\native\build.ps1`, llvm-mingw/clang++, WebView2-Header aus dem NuGet-Paket; Ergebnis `desktop\out\Novora.exe` + `WebView2Loader.dll`. **[V]**
2. **Payload zusammenstellen** — Node (`C:\Program Files\nodejs\node.exe`), `prototype\` ohne `docs/test/data.json/start*`.
3. **Setup kompilieren** — `ISCC.exe installer\Novora.iss` → `installer\out\NovoraSetup-<version>.exe`. **[V]**
4. **Still testen** — `installer\test-install.ps1`: Installation in `%TEMP%\novora-install-test`, Dateien/Verknüpfung/Uninstall-Eintrag prüfen, danach deinstallieren. Kein Start der App (kein Fokusklau). **[V]**
5. **Verteilen** — Setup-Datei + SHA-256 auf die Website/Download-Seite; Update-Manifest mit Version und Hash.

Werkzeuge auf diesem PC:
- Inno Setup 6.7.3: `C:\Users\torbe\AppData\Local\Programs\Inno Setup 6\ISCC.exe` **[V]**
- Node 22: `C:\Program Files\nodejs\node.exe` **[V]**
- dotnet SDK 8.0.428 (falls später MSI/MSIX): `C:\Program Files\dotnet\dotnet.exe` **[V]**

---

## 4. Signierung und SmartScreen (wichtig für „einfach installieren“)

Ohne Signatur zeigt Windows SmartScreen beim ersten Start „Windows hat Ihren PC geschützt“ und der Nutzer muss „Trotzdem ausführen“ wählen. Das ist kein Fehler des Setups, sondern Reputationslogik. **[D]** (Microsoft Learn: SmartScreen-Reputation, Code-Signatur-Optionen)

| Variante | Kosten | SmartScreen beim ersten Download |
|---|---|---|
| Microsoft Store (MSIX, Store signiert) | 0 € | keine Warnung |
| Azure Artifact Signing (früher Trusted Signing) | ~9,99 USD/Monat | Warnung, bis Reputation aufgebaut ist; identische Herausgeber-Identität über Releases hilft |
| OV-Zertifikat (DigiCert/Sectigo/…) | ~150–300 USD/Jahr | Warnung, Reputation wächst |
| EV-Zertifikat | ab ~349–400+ USD/Jahr | seit 2024 **kein** Sofort-Bonus mehr, gleiches Verhalten wie OV |
| Selbstsigniert | 0 € | blockiert für fremde Nutzer |
| Keine Signatur | 0 € | starke Warnung, Firmen können blockieren |

**[D]** Wichtig: EV umgeht SmartScreen seit 2024 nicht mehr. Wer nur wegen SmartScreen EV kauft, zahlt ohne Gegenwert. Azure Artifact Signing ist für Einzelentwickler derzeit auf USA/Kanada begrenzt, Organisationen auch EU/UK.

**[K]** Für Novora jetzt: unsigniert ausliefern (Testphase, eigener Rechner), Download mit SHA-256. Vor öffentlichem Release: Azure Artifact Signing oder OV-Zertifikat, Setup und EXE mit `signtool` signieren, gleiche Herausgeber-Identität über Versionen behalten.

---

## 5. Updates

- Setup enthält Version (`AppVersion`), Daten in `%LOCALAPPDATA%\Novora\app\data.json` bleiben bei Update/Deinstallation erhalten (Pfad per `NOVORA_DATA` überschreibbar).
- `CloseApplications=yes` beendet eine laufende Instanz vor dem Überschreiben. **[V]**
- Oberflächen-Updates brauchen kein Setup: `app\web\` austauschen.
- Server-/Hüllen-Updates: neues Setup über das alte installieren (gleiche `AppId`).
- Automatischer Update-Check: Manifest mit `version`, `sha256`, Download-URL; später optional Ed25519-Signatur (Plan liegt in `docs/PLAN-UPDATE-SERVER.md`).

---

## 6. Release-Checkliste

- [ ] Version in `installer\build.ps1` und `installer\Novora.iss` gleich
- [ ] `node --check` für Server/Web-Dateien
- [ ] Native Hülle neu gebaut (`desktop\out\Novora.exe`)
- [ ] Setup gebaut, Größe plausibel (10–40 MB)
- [ ] Stiller Testlauf grün, danach deinstalliert
- [ ] SHA-256 notiert und auf der Website hinterlegt
- [ ] Auf sauberem Testkonto installiert und gestartet (WebView2 vorhanden)
- [ ] Deinstallation entfernt Ordner + Verknüpfungen (Daten bleiben optional)
- [ ] Signatur (sobald Zertifikat vorhanden)

---

## 7. Quellen

- Microsoft Learn: SmartScreen-Reputation für Windows-App-Entwickler
- Microsoft Learn: Code-Signaturoptionen für Windows-App-Entwickler
- comcomponent.com: Windows-App-Verteilung wählen (MSI/MSIX/ClickOnce/xcopy)
- advancedinstaller.com: WiX Toolset vs. Inno Setup
- rankite.com: Best Installer Software 2026
- Inno Setup Dokumentation (Setup-Skript, `PrivilegesRequired=lowest`, `[Code]`)
