# Novora – HTTP-API (Prototyp v0.3.1)

Der Prototyp-Server (`prototype/server.mjs`) liefert die Handy-Oberfläche, den
PC-Editor und eine kleine JSON-API. Diese Datei beschreibt den aktuellen
Stand der API – sie ist der Vertrag zwischen Server und Clients (Web heute,
native App später).

- Basis: `http://<PC-IP>:47830` (Standardport, per `NOVORA_PORT` änderbar)
- Alle API-Pfade beginnen mit `/api/`
- JSON rein, JSON raus; `content-type: application/json; charset=utf-8`
- Keine Cookies, keine Sessions – Auth nur über Token-Header

## Authentifizierung

Gekoppelte Geräte schicken ihr Token bei jedem App-Aufruf mit:

```
x-token: <64 Hex-Zeichen>
```

`EventSource` im Browser kann keine Header setzen, deshalb akzeptiert der
Server zusätzlich `?token=<token>` in der URL **nur** als Fallback für
`/api/events`. Für alles andere ist der Header der vorgesehene Weg.

Gespeichert wird serverseitig nur der SHA-256-Hash des Tokens (`db.devices[].hash`),
das Klartext-Token existiert ausschließlich auf dem Gerät.

### Welche Endpunkte brauchen was

| Bereich | Pfade | Zugang |
| --- | --- | --- |
| Öffentlich | `/api/info`, statische Dateien | keine Auth |
| Pairing | `/api/pair/request`, `/api/pair/claim` | Code-Ablauf, `request` nur lokal |
| App-API | `/api/layout`, `/api/press`, `/api/grid`, `/api/mixer`, `/api/ping`, `/api/events` | gültiges Token |
| PC-Admin | `/api/admin/*` | nur von `127.0.0.1` / `::1`, kein Token nötig |

## Fehlercodes

| Code | Bedeutung | Typische Ursache |
| --- | --- | --- |
| `200` | OK | – |
| `204` | Preflight | `OPTIONS` |
| `400` | Ungültige Anfrage | `revoke` ohne gültige `id` |
| `401` | Nicht autorisiert | Token fehlt, falsch oder widerrufen |
| `403` | Verboten | Pairing-Code ungültig/verbraucht, Admin von fremder IP, `request` von fremder IP |
| `404` | Nicht gefunden | unbekannter API-Pfad, unbekannte Seite bei `/api/grid` |
| `405` | Methode nicht erlaubt | z. B. `DELETE /api/layout` |
| `413` | Body zu groß | JSON-Body über 256 KiB |
| `429` | Rate-Limit | über 30 API-Anfragen pro Sekunde und IP, oder gesperrte Pairing-IP |
| `500` | Serverfehler | unerwarteter Fehler, Details nur im Server-Log |

Fehlerantworten sind immer `{"ok": false, "error": "<grund>"}`.
Rate-Limit und Pairing-Sperre liefern zusätzlich `retry` (Sekunden).

## Pairing-Ablauf

1. **PC-Editor** (`/pc`, nur lokal) fordert einen Code an:
   `POST /api/pair/request` → `{"code":"123456","expires":60}`
   Der Code ist 60 Sekunden gültig, es gibt immer nur einen aktiven Code je Wert.
2. **Handy** schickt Code + Gerätename an `POST /api/pair/claim`.
   Der Server prüft Ablauf und Einmaligkeit, legt das Gerät an und antwortet
   mit Token und Geräte-ID.
3. Das Handy speichert das Token (heute `localStorage`) und nutzt es als
   `x-token` für alle weiteren Aufrufe.
4. Der PC sieht das Gerät in der Liste und kann es widerrufen
   (`POST /api/admin/revoke`); danach antwortet die API für dieses Token mit `401`.

Ein Code kann **einmal** eingelöst werden. Fünf Fehlversuche pro IP innerhalb
kurzer Zeit sperren das Pairing für 60 Sekunden (`429` mit `retry`).

## Endpunkte

### Öffentlich

#### `GET /api/info`

Kein Token. Wird auch zum Warten auf Serverstart genutzt.

```json
{
  "name": "Pc",
  "version": "0.3.1",
  "port": 47830,
  "host": "DESKTOP-ABC",
  "discoveryPort": 47831
}
```

#### `GET /`, `GET /app`, `GET /pc`

Statische Oberflächen aus `prototype/web/`:

| Pfad | Datei | Zweck |
| --- | --- | --- |
| `/` und `/app` | `app.html` | Handy-Oberfläche |
| `/pc` | `pc.html` | PC-Editor (nur sinnvoll von localhost) |
| `/<datei>` | z. B. `app.js`, `style.css`, `manifest.json` | Assets, `cache-control: no-store` |

Pfade werden normalisiert; Ausbrüche aus `web/` werden mit `400` abgewiesen.

### Pairing

#### `POST /api/pair/request`

Nur von `127.0.0.1`/`::1` – oder von einem bereits gekoppelten Gerät (Token).

```json
{ "code": "123456", "expires": 60 }
```

#### `POST /api/pair/claim`

Body:

```json
{ "code": "123456", "device": "Pixel 8" }
```

Erfolg (`200`):

```json
{
  "ok": true,
  "token": "9f2c…64 hex…",
  "device": { "id": "uuid", "name": "Pixel 8" }
}
```

Fehler: `403` bei ungültigem/verbrauchtem Code, `429` bei aktiver Sperre,
`413` bei zu großem Body.

#### `POST /api/pair/auto`

Automatisches Koppeln im privaten Netz, ohne Code. Abschaltbar über `settings.autoPair` (PC-Editor → „Automatisch koppeln“). Nur für private IPv4/IPv6-Bereiche, max. 12 Versuche pro Minute und IP.

```json
{ "device": "Android-Handy", "hwid": "dauerhafte-geraete-id" }
```

Erfolg (`200`):

```json
{ "ok": true, "auto": true, "token": "…64 hex…", "device": { "id": "uuid", "name": "Android-Handy" } }
```

Gleiche `hwid` = gleiches Gerät: Token wird erneuert, kein doppelter Eintrag.
Fehler: `403` (Auto-Koppeln aus oder kein privates Netz), `429` (zu viele Versuche).

### App-API (Token erforderlich)

#### `GET /api/layout`

Kompletter Zustand für die Handy-Ansicht:

```json
{
  "profile": "Streaming",
  "pages": [{ "id": "home", "name": "Home", "cols": 5, "rows": 4, "tiles": [] }],
  "state": { "mic": false, "volume": 62, "recording": false },
  "settings": { "palette": "graphite", "lang": "de" },
  "name": "Pc"
}
```

#### `POST /api/press`

Führt die Aktion einer Kachel aus.

```json
{ "page": "home", "key": 0 }
```

Antwort `200` – auch wenn die Aktion selbst scheitert:

```json
{ "ok": true, "ms": 0.42 }
{ "ok": false, "error": "invalid target", "ms": 0.11 }
```

Unbekannte Seite oder Kachel: `{"ok": false, "error": "unknown page"}` bzw.
`"unknown tile"` mit Status `200` (bewusst kein 404: der Client soll den
Zustand aktualisieren, nicht in einen Fehlerpfad laufen).

Unterstützte Aktionstypen: `hotkey`, `open`, `media`, `volume`, `mic`,
`record`, `page`. Nur diese erreichen den PowerShell-Worker;
alles andere wird abgelehnt, bevor ein Prozess startet.

#### `POST /api/grid`

Raster einer Seite setzen. `cols`/`rows` werden auf `3..8` geklemmt.

```json
{ "page": "home", "cols": 6, "rows": 5 }
```

→ `{"ok": true, "page": { … }}`; unbekannte Seite → `404`.

#### `GET /api/mixer`

```json
{ "apps": [{ "id": "steam", "name": "Steam", "vol": 100, "muted": false, "pid": 14608 }], "master": 62, "live": true }
```

`live: true` bedeutet: Werte kommen aus echten Windows-Audio-Sessions (Prozessname als `id`).
Ohne Audio-Modul oder mit `NOVORA_AUDIO=off` kommt die gespeicherte Demo-Liste (`live: false`).
Der erste Abruf nach dem Start antwortet sofort mit Fallback, die echten Werte folgen per SSE (`mixer`).

#### `POST /api/mixer`

```json
{ "id": "steam", "vol": 33, "muted": true }
```

Bei aktiven Audio-Sessions wird die Lautstärke/das Mute direkt auf die Windows-Session angewendet
(`applied: true`). `vol` wird auf `0..100` geklemmt; unbekannte Demo-App ohne Audio-Session →
`{"ok": true, "applied": false}`. Antwort enthält die aktuelle Liste.

#### `GET /api/ping`

```json
{ "ts": 1795439098209, "server": 12345.67 }
```

`ts` = Wanduhr (ms), `server` = `performance.now()` des Servers.

#### `GET /api/events` (Server-Sent Events)

`content-type: text/event-stream`. Verbindung bleibt offen; alle 20 s ein
Kommentar-Heartbeat (`: ping`). Beim Verbinden:

```
event: hello
data: {"name":"Pc"}
```

Danach je nach Änderung:

| Event | Nutzlast |
| --- | --- |
| `state` | `{"mic":true}` oder `{"volume":64}` oder `{"recording":false}` |
| `layout` | `{"pages":[…]}` |
| `mixer` | `{"apps":[…]}` |
| `devices` | Liste der Geräte ohne Hash |
| `page` | `{"id":"music"}` |

Im Browser: `new EventSource('/api/events?token=' + token)`.

### PC-Admin (nur localhost)

Alle Admin-Pfade antworten von fremden IPs mit `403 {"error":"localhost only"}`.
Kein Token nötig, weil der Zugriff schon auf den Rechner beschränkt ist.

| Methode + Pfad | Zweck |
| --- | --- |
| `GET /api/admin/overview` | Name, Version, Ports, Interfaces, Geräte, SSE-Clients |
| `GET /api/admin/net` | `{interfaces:[{name,ip,mask,mac}], port, discoveryPort}` |
| `GET /api/admin/stats` | `{p50,p95,p99,count}` der API-Bearbeitungszeit |
| `GET /api/admin/layout` | `{pages, mixer, state, settings}` |
| `POST /api/admin/save` | Layout/Mixer/Settings speichern (validiert + geklemmt) |
| `POST /api/admin/revoke` | `{id}` – Gerät widerrufen, SSE-Verbindung wird geschlossen |
| `POST /api/admin/test` | `{action}` – Aktion testen (Standard: `{"type":"volume","dir":"up"}`) |

`/api/admin/save` akzeptiert `pages[]` (max. 64, Tiles max. 256, `cols`/`rows`
3..8), `mixer[]` (max. 64) und `settings` (flach gemerged). Unbekannte
Skalar-Felder an Seite/Kachel (z. B. `tile.color`) bleiben erhalten, damit
neuere UI-Funktionen einen Save überleben.

`/api/admin/stats` misst die **Server-Bearbeitungszeit** der letzten 1000
API-Anfragen (ohne SSE), nicht die Client-Roundtrip-Zeit. Für echte Latenz
misst der Client `GET /api/ping` selbst.

## Beispiele

### PowerShell

```powershell
# Info
Invoke-RestMethod http://127.0.0.1:47830/api/info

# Code erzeugen (lokal)
$pair = Invoke-RestMethod -Method Post http://127.0.0.1:47830/api/pair/request -Body '{}' -ContentType 'application/json'
$pair.code

# Code einlösen
$claim = Invoke-RestMethod -Method Post http://127.0.0.1:47830/api/pair/claim `
  -Body (@{ code = $pair.code; device = 'PowerShell-Test' } | ConvertTo-Json) `
  -ContentType 'application/json'
$token = $claim.token

# Layout lesen
Invoke-RestMethod http://127.0.0.1:47830/api/layout -Headers @{ 'x-token' = $token }

# Mikrofon-Taste drücken
Invoke-RestMethod -Method Post http://127.0.0.1:47830/api/press `
  -Headers @{ 'x-token' = $token } `
  -Body (@{ page = 'home'; key = 0 } | ConvertTo-Json) `
  -ContentType 'application/json'

# Mixer ändern
Invoke-RestMethod -Method Post http://127.0.0.1:47830/api/mixer `
  -Headers @{ 'x-token' = $token } `
  -Body (@{ id = 'spotify'; vol = 40; muted = $false } | ConvertTo-Json) `
  -ContentType 'application/json'

# Server-Latenz
Invoke-RestMethod http://127.0.0.1:47830/api/admin/stats
```

### curl

```bash
TOKEN=...   # aus dem Pairing
curl -s http://127.0.0.1:47830/api/info
curl -s -X POST http://127.0.0.1:47830/api/pair/request
curl -s -X POST http://127.0.0.1:47830/api/pair/claim \
  -H 'content-type: application/json' \
  -d '{"code":"123456","device":"curl"}'
curl -s http://127.0.0.1:47830/api/layout -H "x-token: $TOKEN"
curl -s -X POST http://127.0.0.1:47830/api/press \
  -H "x-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"page":"home","key":0}'
curl -N "http://127.0.0.1:47830/api/events?token=$TOKEN"
```

## Sicherheitsregeln

- **Pairing-Code**: 6 Ziffern, 60 s gültig, einmalig, Erzeugung nur lokal.
- **Fehlversuche**: 5 pro IP → 60 s Sperre (`429`, `retry` in Sekunden).
- **Token**: 32 Byte Zufall, Übertragung nur über das lokale Netz,
  Speicherung als SHA-256, Vergleich mit `timingSafeEqual`.
- **Rate-Limit**: 30 API-Anfragen pro Sekunde und IP (Fenster 1 s) → `429`.
- **Admin**: ausschließlich `127.0.0.1`/`::1`, geprüft an der Socket-Adresse
  (nicht an Headern – `X-Forwarded-For` wird ignoriert).
- **Body-Limit**: 256 KiB; Prototype-Pollution-Schutz (`__proto__`,
  `constructor`, `prototype` werden entfernt).
- **Aktionen**: Whitelist (`hotkey`, `open`, `media`, `volume`, `mic`,
  `record`, `page`); `open`-Ziele nur gegen ein enges Zeichen-Whitelist,
  Skripte gehen base64-kodiert an den Worker, Timeout 4 s.
- **Kein TLS**: der Prototyp ist für ein vertrauenswürdiges Heim-/LAN-Netz
  gedacht. Für fremde Netze ist das nicht ausreichend.

## UDP-Discovery (nicht HTTP)

Zusätzlich lauscht der Server auf UDP `47831` (per `NOVORA_DISCOVERY` änderbar).

- Anfrage: `{"t":"discover"}` an Port 47831 (Broadcast oder unicast)
- Antwort: `{"t":"novora","v":"0.3.1","name":"Pc","port":47830,"ip":"192.168.1.20","host":"DESKTOP-ABC"}`
- Zusätzlich Broadcast alle 3 s an alle Interfaces.

Browser können kein UDP – die Handy-Web-App nutzt deshalb den Host, der die
Seite ausgeliefert hat. Die Geräteliste mit mehreren PCs kommt mit der
nativen App.

## Smoke-Test

`prototype/test/smoke.mjs` prüft diese API automatisch, ohne den Live-Server
anzufassen (eigene Ports 47850/47851, eigene Datendatei im Temp-Verzeichnis):

```powershell
cd D:\Projekte\StreamDeck
node prototype/test/smoke.mjs
```

Exit-Code `0` = grün, `1` = Fehlschlag. Geprüft werden Info-Form, Pairing,
Layout, Mikrofon-Toggle, Raster-Klemmung, Mixer, Ping, Admin-Endpunkte,
`401`/`403`/`404` und die Hash-Speicherung des Tokens.
