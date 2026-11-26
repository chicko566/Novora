# Updates & Lizenz – Plan

Stand: 2026-11-23. Ziel: Novora aktualisieren, ohne APK/ZIP manuell neu zu verteilen – und optional eine Lizenzprüfung.

## 1. Was schon automatisch ist

Die Handy-App ist ein WebView-Client und lädt die Oberfläche vom PC (`/app`).
**UI-Änderungen brauchen kein neues APK** – PC-Server aktualisieren, App neu öffnen reicht.

Ein neues APK ist nur nötig bei Änderungen an:
- `MainActivity` (Discovery, Berechtigungen, Vollbild)
- App-Icon, App-Name, minSdk/targetSdk
- nativen Funktionen (später)

## 2. Update-Server (NGINX/Webspace)

Statische Dateien reichen, kein Backend nötig:

```
/updates/latest.json
/downloads/novora-windows-x64.zip
/downloads/novora-linux-x64.tar.gz
/downloads/novora.apk
```

NGINX-Beispiel:

```nginx
location = /updates/latest.json {
    root /var/www/novora;
    add_header Cache-Control "no-store";
    types { application/json json; }
}
location /downloads/ {
    root /var/www/novora;
    add_header Cache-Control "public, max-age=300";
}
```

### Manifest `latest.json`

```json
{
  "product": "Novora",
  "channel": "stable",
  "generated": "2026-11-23T18:00:00Z",
  "pc": {
    "version": "0.2.0",
    "url": "https://example.de/downloads/novora-windows-x64.zip",
    "sha256": "82347a11c575f069d735c7884e8895c62eece4f3fe25ca63e7e3f6b17fc52128",
    "size": 32833346
  },
  "android": {
    "version": "0.1.0",
    "versionCode": 1,
    "url": "https://example.de/downloads/novora.apk",
    "sha256": "d382dcb2e36e9e4247025ef7268208b4b0140f1e31df454bc7e09636974f3b6c",
    "size": 62254
  }
}
```

**Signatur (Pflicht vor Auto-Update):** Manifest zusätzlich als `latest.json.sig` (Ed25519) veröffentlichen. Der Client prüft Signatur + SHA-256, sonst kein Update.

## 3. PC-Update

Empfohlen: **Update vor dem Start**, nicht während der Server läuft.

Ablauf `Novora.exe`:
1. `latest.json` laden (5 s Timeout, still bei Offline).
2. `version` mit lokaler Version vergleichen.
3. ZIP in `%TEMP%\novora-update` laden, SHA-256 prüfen, Signatur prüfen.
4. Entpacken nach `Novora.new`, alte `app/` nach `app.old` umbenennen, `app.new` → `app`, Server starten.
5. Bei Fehler: `app.old` zurück, Start mit alter Version.
6. Log: `app\novora.log`.

Button im Editor: **„Nach Updates suchen“** (manuell), Status „aktuell / Update verfügbar“.

## 4. Android-Update

- APK muss mit **demselben Keystore** signiert sein, `versionCode` höher.
- App lädt Manifest beim Start (bzw. Button in Einstellungen), vergleicht `versionCode`.
- Bei Update: Dialog „Version X verfügbar“ → Download-URL im Browser öffnen oder APK per `FileProvider` + `ACTION_VIEW` übergeben. Android zeigt die Installationsbestätigung – **still installieren geht bei Sideload nicht**.
- Signatur des Downloads prüfen; bei falschem Zertifikat bricht Android die Installation ab.
- Für Play-Store-Builds stattdessen **Play In-App Updates** (sofort/ flexibel) nutzen.

## 5. Lizenz – Optionen

| Variante | Server nötig | Aufwand | Empfehlung |
|---|---|---|---|
| Keine Lizenz (kostenlos/Donation) | nein | 0 | für Testphase |
| **Offline-Lizenzdatei** (signiertes JSON, Geräte-ID) | nein | 1–2 Tage | **Start** |
| Online-Aktivierung (Lizenzschlüssel, GeräteLimit) | ja (API+DB) | 3–5 Tage | später |
| Play Store (Google prüft Kauf) | Play | 1 Tag | nur Store-Version |

**Offline-Lizenz:** Server erzeugt `license.json` mit `{product, edition, deviceId, issued, expires}` + Ed25519-Signatur. App/PC prüfen nur die Signatur – kein Internet, kein Account. Widerruf ist nicht möglich (nur bei Online-Lizenz).

**Online:** NGINX + kleiner Dienst (Node/PHP) mit Tabelle `licenses`, `devices`; Endpoint `POST /api/activate`. Nur wenn Gerätebindung/Abos wirklich gebraucht werden.

## 6. Sicherheit

- Nur HTTPS für Manifest/Downloads.
- SHA-256 + Signatur verpflichtend für Auto-Updates.
- Keine Updates von fremden Hosts (URL fest im Code).
- Rollback-Ordner nach erfolgreichem Start löschen (nicht ewig aufheben).
- Keine Lizenzdaten im Klartext an Dritte; keine Hardware-Fingerprints ohne Hinweis.

## 7. Aufwand

| Teil | Zeit |
|---|---|
| Manifest + Website-Upload-Skript | 0,5 AT |
| PC-Update (prüfen, laden, tauschen, Rollback) | 1–2 AT |
| Android-Update-Dialog + FileProvider | 1 AT |
| Offline-Lizenz | 1–2 AT |
| Online-Aktivierung | 3–5 AT |

## 8. Nächste Schritte

1. Domain/Webspace festlegen (NGINX vorhanden?).
2. `updates/latest.json` + Upload-Skript bauen.
3. Signatur-Schlüssel erzeugen (Ed25519), Pubkey in PC/App einbetten.
4. PC-Updater im Launcher ergänzen.
5. Android-Update-Dialog ergänzen.
6. Lizenz erst danach – Offline-Variante reicht für Verkauf ohne Konto.

---

## 9. Umsetzungsstand (2026-11-23)

| Teil | Datei | Status |
|---|---|---|
| Manifest + Signatur + Publish | `tools/publish.mjs` | fertig, getestet |
| PC-Updater mit Rollback | `prototype/updater.mjs` | fertig, getestet |
| Update-Tests | `prototype/test/update.mjs` | 10/10 grün (Port 47841) |
| Launcher ruft Updater vor Serverstart | `desktop/native/main.cpp` | fertig, neu gebaut |
| Android: Prüfen, Laden, Installieren | `android/src/de/novora/app/UpdateChecker.java` | fertig, APK 0.1.3 |
| Android-Versionierung | `android/build-apk.ps1` liest Manifest | fertig |
| Android: QR-Scanner für die Kopplung | Kamera/Scan-Intent in der App | **APK 0.1.5 / versionCode 6** (Stand der Doku; im Manifest noch 0.1.4/5 eingetragen – Neubau offen) |

### Produktions-Keys (Stand 2026-11-24)

Ablage: `tools\keys\` (gitignored, `tools/keys/` + `*.pem` in `.gitignore`).

```powershell
node tools\publish.mjs --gen-keys tools\keys
```

- `tools\keys\ed25519.pem` (PKCS8, privat, 119 B) – **nie** ausgeben, nie committen, offline sichern (Passwort-Manager/USB). **Private Key verloren = keine Updates mehr möglich**: bestehende Installationen kennen nur den bereits ausgelieferten Pubkey, ein neuer Key käme nie durch die Signaturprüfung.
- `tools\keys\ed25519.pub.pem` (SPKI, 113 B) wird als `update.pub` neben `Novora.exe` ausgeliefert (`installer\payload\`, `dist\windows\Novora\`); `installer\build.ps1` kopiert sie bei jedem Build und bricht mit klarer Meldung ab, wenn sie fehlt.
- Ohne `update.pub` startet der Launcher den Updater **nicht** – es gibt keine unsignierten Updates.
- Signatur des veröffentlichten Manifests erfolgt, sobald die Domain feststeht (bis dahin bleibt `website/updates/latest.json` unsigniert).

### Release veröffentlichen

```powershell
node tools\publish.mjs --version 0.3.1 --pc-zip dist\downloads\novora-windows-x64.zip --apk website\downloads\novora.apk --out website\updates --key tools\keys\ed25519.pem --base-url https://updates.example.com/novora --notes "Kurztext"
```

Erzeugt `latest.json` + `latest.json.sig` (Bytes exakt signiert, atomar geschrieben) und kopiert die Pakete nach `updates\downloads\`. `--channel beta` schreibt `beta.json`. Downgrade wird abgelehnt (Exit 1).

### PC-Seite

1. `update.url` neben `Novora.exe` (eine Zeile Manifest-URL) oder Default-Konstante im Launcher.
2. `update.pub` daneben legen.
3. Launcher ruft `app\updater.mjs` mit 10 s Timeout, dann Serverstart – auch bei Fehler/Offline.
4. Exit-Codes: `0` aktuell/aktualisiert, `2` Update verfügbar aber nicht eingespielt (offline, Signatur/SHA falsch, `--dry-run`), `1` harter Fehler. Installation bleibt in jedem Fall intakt (`app.old`-Rollback).
5. Log: `debug\update.log`.

### Android-Seite

- **APK-Stand: 0.1.5 / versionCode 6** – neu darin ist der QR-Scanner: die App öffnet die Kamera, liest den Koppel-QR des PCs (`novora://pair?ip=…&code=…`) und trägt IP/Code automatisch in die Verbindungskarte ein. Kamera-Berechtigung wird beim ersten Scan erfragt, ohne Scan bleibt die manuelle Eingabe.
- `strings.xml` → `update_manifest_url` auf die echte HTTPS-URL setzen.
- Prüfung still beim Start; Dialog „Später“/„Installieren“, `minSupported.android` erzwingt.
- Download nach `cache/updates/` mit **Fortschrittsdialog** (`ProgressDialog`, `STYLE_HORIZONTAL`): determinate, wenn die Größe bekannt ist (`size` aus dem Manifest oder `Content-Length`), sonst indeterminate; Anzeige „x % · KB/KB“, gedrosselt auf ~64 KB bzw. 150 ms, nicht abbrechbar und in Erfolgs- wie Fehlerpfad geschlossen. SHA-256 + Größe geprüft, Installation über eigenen minimalen `FileProvider` (`de.novora.app.fileprovider`, read-only, nur `cache/updates`).
- Grenze: **keine Ed25519-Prüfung des Manifests** in der App (kein androidx/Conscrypt auf minSdk 26) – es gelten HTTPS-Pflicht, SHA-256 und die Signaturprüfung des Android-Installers selbst.

### Offen

- `update.url` neben `Novora.exe` anlegen, sobald die Domain feststeht (eine Zeile Manifest-URL) – aktuell bewusst nicht vorhanden, `example.com` bleibt in Doku/Beispielen.
- Signatur des veröffentlichten Manifests (`website/updates/latest.json`) nachziehen, sobald Domain steht; bis dahin bleibt das Web-Manifest **unsigniert** und PC-Auto-Update bleibt aus, App-Downloads funktionieren.
- Produktions-Key-Custody: privaten Key offline verwahren/Backup, nie im Repo (`tools\keys\` ist gitignored).
- `tools/publish.mjs --no-copy` bricht bei fehlendem `<out>\downloads\<zip>` ab (Copy-in wird übersprungen, SHA-256 liest ins Leere) – Workaround: Paket vorher dorthin kopieren.
- Fortschrittsdialog im Android-Download: erledigt (`ProgressDialog`, determinate bei bekannter Größe); offen bleibt der Lifecycle-Hook, falls die Activity mitten im Download zerstört wird (Dialog wird dann nur per `isShowing`-Guard geschlossen).
