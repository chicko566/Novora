# Verkauf & Veröffentlichung – Checkliste

Stand: 2026-11-23. Gilt, sobald Novora (oder der neue Name) öffentlich beworben/verkauft wird.

## 1. Marke und Name

- [ ] Finalen Namen festlegen; „Novora“ ist belegt (Novora Group, novora.live, novora.co)
- [ ] DPMA- und EUIPO-Recherche Klasse 9 (Software) und 42 (SaaS)
- [ ] Domain(s) sichern (.de/.com/.app/.io)
- [ ] Keine fremden Marken- oder Produktnamen im eigenen Namen verwenden
- [ ] Vergleiche nur als „funktioniert mit …“, ohne fremde Logos in Werbung/Screenshots

## 2. Rechtstexte

- [ ] Impressum (§5 DDG): Name, Anschrift, E-Mail, ggf. USt.-ID
- [ ] AGB/EULA: Nutzungsrecht, eine Lizenz pro Nutzer, keine Weiterverbreitung, Haftungsbegrenzung, Support-Umfang
- [ ] Datenschutzerklärung (DSGVO): keine Telemetrie, lokale Daten, Server im LAN, Zahlungsanbieter
- [ ] Widerrufsbelehrung; bei digitalem Download Zustimmung zum sofortigen Beginn + Kenntnis des Verlusts des Widerrufsrechts
- [ ] Lizenzhinweise Dritter (Node.js MIT, Simple Icons CC0, Schrift OFL) in `THIRD-PARTY.md`

## 3. Steuern und Vertrieb

- [ ] Gewerbe oder Kleinunternehmerregelung klären
- [ ] Rechnungen, USt./Reverse-Charge
- [ ] Zahlungsanbieter als Reseller (Paddle, Lemon Squeezy, Gumroad) → übernimmt Umsatzsteuer
- [ ] Oder Google Play (Developer-Konto 25 $, 15–30 % Gebühr, AAB)
- [ ] Preis, Update-Politik, Support-Kanal festlegen

## 4. Technische Release-Pflichten

- [ ] Release-Keystore (nicht im Repo), `targetSdk 35`, AAB für Play
- [ ] Signierte APK versionieren, SHA-256 veröffentlichen
- [ ] **Auto-Koppeln standardmäßig AUS**, Code-Pairing als Standard
- [ ] Kein Port-Forwarding ins Internet; nur privates LAN
- [ ] Keine persönlichen Daten im Paket (`data.json`, `debug.keystore`, lokale Pfade)
- [ ] Update-Mechanismus und Sicherheitskontakt (`SECURITY.md`)

## 5. Produkthaftung / Risiko

- [ ] Haftung für ausgelöste Aktionen (Hotkeys, Systembefehle) in EULA begrenzen
- [ ] Gefährliche Aktionen (Neustart, Shutdown) nur mit Bestätigung
- [ ] Klarstellen: keine Garantie auf fremde APIs (Spotify kann Zugang sperren)
- [ ] Keine medizinischen/beruflichen Garantien

## 6. Marketing

- [ ] Screenshots ohne fremde Logos
- [ ] Feature-Liste nur mit tatsächlich vorhandenen Funktionen
- [ ] „Spotify-Suche“ erst bewerben, wenn implementiert und legal zugänglich
- [ ] Sicherheitsversprechen belegen: LAN only, Code-Pairing, keine Cloud
