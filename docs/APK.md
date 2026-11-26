# APK bauen und installieren

Stand: **2026-11-24**. Die App ist eine schlanke WebView-Hülle: sie sucht den PC per UDP,
öffnet danach die vom PC ausgelieferte Oberfläche (`http://<PC-IP>:47830/app`). Damit bleibt
die UI immer aktuell, ohne neues APK.

## Fertige APK

| Wert | Stand 2026-11-24 |
|---|---|
| Datei | `D:\Projekte\StreamDeck\android\Novora-debug.apk` |
| Größe | 295.793 B |
| Paket | `de.novora.app` |
| Version | versionName `0.1.6` / versionCode `7` |
| SDK | compileSdk 34, minSdk 26, targetSdk 34 |
| Signatur | Debug-Key, Zertifikat SHA-256 `be80a96d2bebe2aaa0efb3c6b9e0362b291959a3279dd84c3504033e923db228` |

Kopien: `D:\Projekte\StreamDeck\Novora.apk`, `website\downloads\novora.apk`.

## Installieren

1. PC: `prototype\start.bat` starten (Server auf 47830, Discovery UDP 47831).
2. Windows-Firewall beim ersten Start für **private Netze** erlauben (oder `android\firewall.ps1` als Admin).
3. APK aufs Handy bringen (USB, Cloud, Messenger) und antippen.
4. „Installation aus unbekannten Quellen“ für die Datei-App/den Browser erlauben.
5. App öffnen: sie sucht PCs im WLAN und zeigt eine Liste. PC wählen → **automatisch gekoppelt**, Tasten erscheinen.
6. Kein PC gefunden? „IP manuell“ und z. B. `192.168.0.12` eingeben. Lange auf die App drücken = neu suchen.
7. Verlangt der PC einen Code, ist „Automatisch koppeln“ im PC-Editor aus – dann Code dort erzeugen und eingeben.
8. Per ADB (USB-Debugging an): `D:\Tools\android\platform-tools\adb.exe install -r android\Novora-debug.apk`.

Voraussetzungen: Android 8+ (minSdk 26), gleiches WLAN, PC läuft.

## QR-Kopplung (System-Kamera + ZXing)

- Kopplungs-QR wird über die **System-Kamera** gescannt, Dekodierung mit **ZXing Core 3.5.3**
  (`android\libs\core-3.5.3.jar`, Apache-2.0). Kein eigener Kamera-Preview-Code.
- `AndroidManifest.xml` führt `<uses-permission android:name="android.permission.CAMERA" />`;
  ohne Berechtigung/Foto-App meldet die App `scan_no_camera` (`MainActivity.java`, QR-Abschnitt
  „Native QR-Erkennung“).
- Das ZXing-Jar muss beim Bauen mit verarbeitet werden, sonst bricht `d8`/der Aufruf mit
  „class not found“ ab; `build-apk.ps1` prüft die Datei und nennt die Download-URL.

## Selbst bauen

Werkzeuge (liegen lokal, kein Android Studio/Gradle nötig). Basis-Pfad `D:\Tools\android`,
per `$env:ANDROID_SDK` überschreibbar (`android\build-apk.ps1`, Zeile 5):

| Werkzeug | Pfad |
|---|---|
| JDK 17 | `D:\Tools\android\jdk\jdk-17.0.21.1+2` |
| Build-Tools 34 | `D:\Tools\android\buildtools\android-14` |
| android.jar (API 34) | `D:\Tools\android\platform\android-34\android.jar` |
| ZXing Core 3.5.3 | `android\libs\core-3.5.3.jar` (im Repo) |

```powershell
powershell -ExecutionPolicy Bypass -File D:\Projekte\StreamDeck\android\build-apk.ps1
```

Ablauf im Skript: `aapt2 compile/link` → `javac` → `d8` (App-Klassen + ZXing-Jar) →
`classes.dex` in APK → `zipalign` → `apksigner` (Debug-Key `android\debug.keystore`).
`versionCode` und `versionName` werden aus `android\AndroidManifest.xml` gelesen – dort
erhöhen, nicht im Skript.

Nach Änderungen an `MainActivity.java`, `UpdateChecker.java` oder Icons neu bauen. Icons liegen
als PNG in `android\res\mipmap-*`, erzeugt aus `design\logo\novora\novora-512.png`.

Signatur gegenprüfen (JAVA_HOME setzen):

```powershell
$env:JAVA_HOME='D:\Tools\android\jdk\jdk-17.0.21.1+2'
D:\Tools\android\buildtools\android-14\apksigner.bat verify --print-certs android\Novora-debug.apk
```

## Update-Dialog

- Beim Start prüft die App still `update_manifest_url` (strings.xml, HTTPS-Pflicht); der
  `CHECK_RUNNING`-Guard (`AtomicBoolean`, `UpdateChecker.java`) verhindert Doppelaufrufe und
  parallele Downloads.
- Neuer `versionCode` → Dialog mit Version, Notes, „Später“/„Installieren“;
  `minSupported.android` erzwingt das Update.
- Download nach `cache/updates/` mit **ProgressDialog**: determinate Balken
  (`STYLE_HORIZONTAL`, `setIndeterminate(false)`) bei bekannter Größe, indeterminate
  (`setIndeterminate(true)`) wenn die Größe fehlt.
- SHA-256 + Größe werden geprüft, Installation per `ACTION_VIEW` über den eingebauten
  read-only `FileProvider` (`de.novora.app.fileprovider`).
- WebView-Requests tragen den User-Agent-Zusatz `NovoraApp/<versionName>`
  (`MainActivity.java:114`).
- Grenze: Manifest wird nicht Ed25519-verifiziert (kein Conscrypt/androidx auf minSdk 26);
  Schutz = HTTPS + SHA-256 + Signaturprüfung des Installers. Details: `docs\UPDATES.md`.

## Debug-Signatur

- Debug-Signatur: zum Testen/Weitergeben ok, nicht für Stores. Keystore:
  `android\debug.keystore`, Zertifikat-SHA-256 siehe Tabelle oben.
- WebView-Hülle braucht den PC; die native Rust/Slint-App (siehe PLAN.md) wäre eigenständiger,
  ist aber ohne Rust-Toolchain nicht gebaut.
- Discovery per Broadcast scheitert in Gäste-WLANs mit AP-Isolation → IP manuell.

## Play Store (später)

- **targetSdk 35 (Android 15) ist Pflicht** für neue Apps/Updates im Play Store (seit 31.08.2025).
  Das aktuelle APK nutzt 34 – für Sideload egal, für Play muss auf 35 erhöht und gegen
  Platform 35 gebaut werden.
- Play verlangt **AAB**, nicht APK; eigener Upload-Key statt Debug-Keystore.
- TWA (Trusted Web Activity) scheidet aus: verlangt HTTPS + Digital Asset Links; unser PC
  liefert HTTP im LAN.
- WebView-Hülle ist für diesen Fall richtig: klein, kein HTTPS-Zwang, UI bleibt serverseitig
  aktuell. Capacitor würde nur Größe und Build-Aufwand erhöhen.

Prüfzeile: Stand 2026-11-24, Werte gegen `android\AndroidManifest.xml` (versionCode 7 /
versionName 0.1.6), `android\Novora-debug.apk` (295.793 B) und `android\build-apk.ps1`
(ANDROID_SDK-Fallback, ZXing-Jar) gegengelesen; UTF-8, 0× U+FFFD, 0× CP1252-Mojibake.
