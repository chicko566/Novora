# Novora – Prototyp (läuft sofort)

Kleiner, echter Prototyp ohne Installation von Rust/Android: Node-Server auf dem PC, Handy-Oberfläche als Web-App im WLAN.

## Starten

```powershell
cd D:\Projekte\StreamDeck\prototype
node server.mjs
```

Oder per Doppelklick: `start.bat` (Fenster) bzw. `start-hidden.vbs` (ohne Fenster, für Autostart).

- PC-Editor: http://127.0.0.1:47830/pc
- Handy: die im Konsolenfenster angezeigte Adresse `http://<PC-IP>:47830/app` im Handy-Browser öffnen (gleiches WLAN).
- Voraussetzung: Node 18+ (getestet mit Node 22), Windows (Aktionen laufen über PowerShell).

Optionale Umgebungsvariablen:

| Variable | Standard | Zweck |
| --- | --- | --- |
| `NOVORA_PORT` | `47830` | HTTP-Port |
| `NOVORA_DISCOVERY` | `47831` | UDP-Discovery-Port |
| `NOVORA_DATA` | `prototype/data.json` | Datendatei (Layout, Geräte, Zustand) |
| `NOVORA_AUDIO` | an | `off` schaltet die echten Windows-Audio-Sessions ab (Test/Demo) |

## Koppeln

1. Im PC-Editor „Neuen Code erzeugen“ (6 Ziffern, 60 Sekunden gültig, einmalig).
2. Am Handy „Verbinden“ → Code eingeben → Koppeln.
3. Danach erscheinen die Tasten. Token bleibt im Browser gespeichert; der PC sieht das Gerät in der Liste und kann es widerrufen.

## Was funktioniert

- Tasten mit Logos, ohne Beschriftung, quadratisch, Zustände (Mikro, Lautstärke-Ring, Aufnahme)
- Aktionen: Tastenkombination, App/URL öffnen, Medien, Lautstärke, Mikro-/Aufnahme-Zustand, Seitenwechsel
- Seiten, Mixer-Seite, Raster pro Seite (3–8), Design-Paletten, DE/EN
- PC-Editor: Logo aus der Bibliothek ins Raster ziehen, Aktions-Badge je Taste, Tastenkombination aufnehmen, Aktionen testen
- **Mixer live**: echte Windows-Audio-Sessions (Prozessname, Lautstärke, Mute) über Core Audio, direkt regelbar
- Pairing mit Code, Geräteliste, Widerruf, Token nur als SHA-256
- UDP-Discovery (für die spätere native App), Latenz-Anzeige, Server-Statistik p50/p95/p99
- PC-Editor nur von 127.0.0.1 erreichbar

## Smoke-Test

Prüft die API automatisch, ohne den laufenden Server anzufassen (startet einen eigenen auf Port 47850/47851 mit Temp-Datendatei):

```powershell
cd D:\Projekte\StreamDeck
node prototype/test/smoke.mjs
```

Exit-Code `0` = alles grün, `1` = Fehlschlag; pro Test eine Zeile mit `ok`/`FAIL` und Dauer.

Weitere Prüfungen:

```powershell
node test/discovery.mjs   # UDP-Probe, erwartet Antwort des laufenden Servers
node test/latency.mjs     # 500 Drücke, p50/p95/p99
```

Oder über npm: `npm run smoke`, `npm run discovery`, `npm run latency`, `npm start`.

## Latenz messen

```powershell
cd D:\Projekte\StreamDeck
node prototype/test/latency.mjs
```

Misst 500 Tastendrücke (Client-RTT inkl. HTTP), gibt p50/p95/p99 aus und entfernt das Testgerät danach.
Letzter Lauf lokal: p50 0,97 ms · p95 1,49 ms · p99 3,58 ms (Loopback; echtes WLAN addiert 1–10 ms).

## API

Vollständige Endpunkt-, Auth- und Fehlercode-Doku: [docs/API.md](docs/API.md).

## APK (Android)

Fertige App: `D:\Projekte\StreamDeck\Novora.apk` (auch `Desktop\Novora.apk`).
Sie sucht den PC per UDP-Broadcast im WLAN und öffnet danach `/app`. Installation: APK aufs Handy, „unbekannte Quellen“ erlauben, öffnen, PC aus der Liste wählen. Details: [docs/APK.md](../docs/APK.md).

## Grenzen des Prototyps

- Browser kann kein UDP: die Geräteliste zeigt den PC, der die Seite ausliefert. Mehrere PCs + Discovery kommen mit der nativen App.
- Kein APK: dafür Rust + Android SDK/NDK ([docs/APK.md](docs/APK.md)).
- Kein TLS/Verschlüsselung: für vertrauenswürdiges Heim-/LAN-Netz gedacht, nicht für fremde Netze.
- Der PC-Editor ist nur von localhost erreichbar; Layout-Änderungen vom Handy sind auf Raster und Mixer beschränkt.

## Nächste Schritte

1. Native App (Rust + Slint) mit echter Discovery-Liste und APK — Werkzeugkette fehlt noch, Anleitung in [docs/APK.md](docs/APK.md).
2. Latenz im echten WLAN messen (5 GHz, 2,4 GHz, Repeater) und in PLAN.md §19 eintragen.
3. TLS/PSK für fremde Netze, sobald nötig.
