# Beweise: Versionen

Stand: 2026-11-24. Je Plattform genau eine aktuelle Version, alles Ältere wird entfernt.

## Aktueller Stand

| Plattform | Version | Datei | Größe (B) | SHA-256 |
| --- | --- | --- | --- | --- |
| Windows Setup | 0.4.0 | NovoraSetup-0.4.0.exe | 24.209.210 | 503dc0c90b680a1c65441aea9a6a948a163a3902528f3c873e7376555cf52ddb |
| Windows ZIP | 0.4.0 | novora-0.4.0-win64.zip | 33.834.040 | e0e63539bd62c5390f650c5c5df357b04f3baa79a5350510042b387e96b08c37 |
| Android APK | 0.1.7 / 8 | novora-0.1.7.apk | 299.889 | f40d4abb5fef7cef144dd6f34e2cda623a8681f892ce43002ddea2f9173cc04c |

PC-Build: 0.4.0, Buildnummer 400. APK: versionName 0.1.7, versionCode 8.

Quelle: `release\0.4.0\` mit `SHA256SUMS` und `version.json`.
Website-Kopien in `website\downloads\` sind byte-identisch.

## Prüfung

```
Get-FileHash -Algorithm SHA256 <datei>
```
oder
```
certutil -hashfile <datei> SHA256
```

Erwartet: Wert stimmt zeichengenau mit der Tabelle überein, Größe in Bytes ebenfalls.

## Zu entfernende Altstände

| Datei / Version | Ort | Grund |
| --- | --- | --- |
| Novora.apk | Projektroot | alte APK ohne Versionsbezug |
| 0.1.4 / 0.1.6 (APK) | Release-/Build-Ordner | überholt durch 0.1.7 |
| 0.3.0 / 0.3.1 / 0.3.2 / 0.3.3 (Setup/ZIP) | Release-/Build-Ordner | überholt durch 0.4.0 |
| Linux-Tarball | Website-Downloads | im 0.4.0-Release nicht enthalten |

Regel: nach dem Aufräumen existiert pro Plattform genau ein Artefakt. Neue Releases
laufen ausschließlich über `tools\release.mjs`, damit Versionen, Manifest und Hashes
nicht auseinanderlaufen.

## Offene Belege

- Die drei Hashes oben sind der geprüfte Stand.
- `release\0.3.3` wurde entfernt; `release\0.4.0` ist der einzige Release-Ordner.
- Nach dem Aufräumen: Verzeichnislisting als Beleg ablegen.
