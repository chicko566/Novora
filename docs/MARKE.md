# Markenrecherche „Novora“ – Stand 2026-11-24

Auftrag aus `TODO.md`: Registerrecherche DPMA/EUIPO, Nizza-Klassen 9/42/45.
**Kein registeramtlicher Auszug, keine Amtsauskunft.** Alles unten ist eine eigene technische Abfrage vom 2026-11-24 mit Statuscodes; was nicht abrufbar war, steht als solches da.

## 1. Methode und Erreichbarkeit

Alle Abfragen am 2026-11-24, ohne Login, ohne Captcha-Umgehung, ohne kostenpflichtige Dienste.

| Quelle | Request | Ergebnis |
|---|---|---|
| DPMAregister Formular | `GET https://register.dpma.de/DPMAregister/marke/experte?marke=novora` | **200**, 807.315 Byte Formularseite (Tapestry, JS-Hinweis) |
| DPMAregister Suche, exakte Wortmarke | `POST …/marke/experte.kopf.form`, Feld `eingabefeld=(MARKE novora)`, mit `t:formdata`-Token + Session-Cookies | **200**, 34.421 Byte, Meldung: „Die Datenbankabfrage lieferte keine Treffer.“ → **0 Treffer** |
| DPMAregister Kontrollsuche | `eingabefeld=(MARKE bmw)` | **200**, 34.421 Byte, ebenfalls „Die Datenbankabfrage lieferte keine Treffer.“ |
| DPMAregister Wildcards | `(MARKE novora*)`, `(MARKE *novora*)`, `(MARKE $novora)` | **200**, 807.660 Byte, Rücksprung aufs Formular mit „Ungültigkeit festgestellt“ → nicht ausgewertet |
| TMview (Host) | `https://tmview.tmdn.org/tmview/api/search/results?criteria=novora` | **DNS ENOTFOUND**, Host nicht auflösbar |
| TMview (Alias) | `https://www.tmdn.org/tmview/api/search/results?criteria=novora` | **200**, 245 Byte, Body „Request Rejected“ (Support-ID) → Bot-Schutz, **nicht abrufbar** |
| EUIPO eSearch | `https://euipo.europa.eu/eSearch/` | **ECONNRESET** (Socket-Abbruch) → **nicht abrufbar** |
| WIPO Global Brand DB | `https://branddb.wipo.int/branddb/en/` | **200**, 1.708 Byte, Altcha-Captcha-Seite → ohne Captcha-Lösung **nicht abfragbar** (nicht umgangen) |
| Freitext-Websuche | DuckDuckGo (`tools.ddg`) | erste Abfrage 200 mit Treffern; danach Bot-Sperre („No results were found … bot detection“) |
| Freitext-Websuche Fallback | `html.duckduckgo.com/html/?q=…` | **202**, Bot-Check-Seite, keine Treffer |
| Freitext-Websuche Fallback | `bing.com/search?q=…` | 200, aber themenfremde Treffer (Bot-Mitigation) → nicht auswertbar |
| Freitext-Websuche Fallback | `websearch`-Tool | „No search results found“ für alle Kandidaten |

**Wichtige Einschränkung zur DPMA-Abfrage:** Der Klassenfilter 9/42/45 wurde **nicht** gesetzt (Feld `KL` nur über das Formular-Select, nicht per Freitext erreichbar). Zusätzlich lieferte die Kontrollsuche `(MARKE bmw)` – eine mit Sicherheit eingetragene Marke – ebenfalls „keine Treffer“. Das negative Ergebnis für „novora“ ist damit **kein Beweis der Nichtexistenz**, sondern nur der Nachweis, dass die Abfrage technisch eine Ergebnis-/Nichtergebnis-Seite (34.421 Byte) reproduzierbar ausliefert.

## 2. Treffer aus der Freitext-Websuche (Stand 2026-11-23, unverändert übernommen)

| Treffer | Feld | Relevanz Kl. 9/42 |
|---|---|---|
| NOVORA (novora.at) | Kfz-Import Österreich | gering (Kl. 35/39) |
| Novora Solutions (novorasolutions.com) | Custom Software / AI | **hoch** |
| Novora Group (novoragroup.com) | Event-Tech-Software + AI | **hoch** |
| NOVORA IP (novoraip.com) | Markenanmeldung / IP-Dienstleistung | **hoch** (Kl. 45, Namensnähe) |
| novora.live | KI-Baukasten | hoch |
| novora.co | Plattform | mittel |
| novora.ae | Chemie | gering |

Quelle: DuckDuckGo-Freitextsuche, dokumentiert in der Vorversion dieser Datei. Diese Treffer sind **Web-Präsenzen, keine Registereinträge**.

## 3. Namens-Alternativen (erfunden, 2 Silben, kein „-ora“)

Web-Prüfung je Kandidat: `"<Name>" software` bzw. `"<Name>" software company` per DuckDuckGo.
Domain-Prüfung: reine Sichtprüfung per HTTP-Abruf von `<name>.de` / `<name>.com` (kein WHOIS, keine Registrierung).

| Kandidat | Web-Treffer Software | .de / .com sichtbar belegt | Empfehlung |
|---|---|---|---|
| **Norvex** | **ja** – norvex.in („AI Infrastructure“), norvexagency.com, norvexlabs.com, norvexsystems.tech | .de 200 „Domain steht zum Verkauf“; .com 200 franz. Hebetechnik (norvex.com) | **nein** – mehrfach im Software-/KI-Umfeld belegt |
| **Zintra** | **ja** – zintra.ca (ZINTRA Technologies, „software innovation division“), zintra.net, zintraconsulting.com | .de 403; .com 200 „Diese Website steht zum Verkauf“ | **nein** – starke Software-Kollision |
| **Kelvo** | unklar – Suche durch Bot-Sperre blockiert | .de DNS ENOTFOUND (kein Host); .com TLS-Zertifikatsfehler (Host antwortet) | **bedingt** – beste Domain-Lage, Software-Lage vor Entscheidung nachprüfen |
| **Vantil** | unklar – Suche blockiert | .de TLS-Handshake-Fehler; .com 200 Parkseite „DeMeulder.com“ | **bedingt** – Domain frei wirkend, Kollision unklar |
| **Pulsiv** | unklar – Suche blockiert; .com-Inhaber ist Leistungselektronik („Pulsiv – power conversion“), keine Software | .de ECONNREFUSED; .com 200, Firmenseite | **bedingt** – Kl.-9-Risiko (Hardware), nicht für Software |
| **Trevon** | unklar – Suche blockiert | .de 200 Sedo-Verkaufsseite; .com 200, 114 Byte (leer) | **bedingt** – Domainlage gut, aber US-Vorname → schwache Kennzeichnungskraft |
| **Solin** | unklar – Suche blockiert | .de ECONNREFUSED; .com führt zu LinkedIn-Profil einer Person | **schwach** – Personenname, geringe Unterscheidungskraft |
| **Quorix** | unklar – Suche blockiert | .de 200, aktive Firmenseite (quorix.de/en-gb); .com Zertifikat abgelaufen | **unklar** – .de bereits belegt |

Einschränkung: Für 6 von 8 Kandidaten liegen **keine** Websuchergebnisse vor, weil DuckDuckGo nach wenigen Abfragen gesperrt hat (Bot-Detection, 2026-11-24). Ein „unklar“ bedeutet daher **nicht** „frei“, sondern „nicht geprüft“.

## 4. Risiko

| Risiko | W | Wirkung |
|---|---|---|
| Ältere Marke Kl. 9/42 einer Novora-Firma | hoch | Abmahnung, Umbenennung nach Release |
| Verwechslung mit NOVORA IP (Markendienstleister) | mittel | Widerspruch, Reputationsschaden |
| Store-/Domain-Sperre (Play, GitHub, npm) | mittel | Vertrieb blockiert |
| Negativbefund DPMA falsch interpretiert | mittel | Scheinsicherheit, weil Kontrollsuche ebenfalls 0 Treffer lieferte |

## 5. Empfehlung

1. **„Novora“ bleibt Arbeitstitel.** Keine Store-Einreichung, keine Werbung, keine Wortmarkenanmeldung unter diesem Namen.
2. Release-Name erst nach **kostenpflichtiger Registerrecherche** (DPMA-Expertenrecherche mit Klassen 9/42/45, EUIPO eSearch, TMview) oder anwaltlicher Recherche festlegen.
3. Favoriten für die nächste Prüfrunde: **Kelvo**, **Trevon**, **Vantil** – geringste belegte Software-Kollision, Domainlage brauchbar. Vor Festlegung: Websuche je Kandidat wiederholen (Sperre war technisch bedingt) und Registerrecherche mit Klassenfilter.
4. Norvex und Zintra verwerfen (mehrfach im Softwareumfeld belegt).
5. Nach Namensentscheidung: Domain (.de/.com) und Store-Namen (Play, GitHub) sichern.

## 6. Grenzen

- **Keine amtliche Auskunft.** Alle DPMA-Daten sind selbst abgerufene Formularantworten ohne Klassenfilter; EUIPO, TMview und WIPO waren nicht abrufbar.
- Keine Nizza-Klassenprüfung, keine Ähnlichkeitsrecherche (Schreibvarianten, Klang, Bildmarken), keine Anwaltsprüfung.
- Die Kontrollsuche `(MARKE bmw)` lieferte ebenfalls 0 Treffer → die DPMA-Abfrage ist in dieser Form **nicht belastbar** für Negativbefunde.
- Web- und Domain-Sichtprüfungen sind Momentaufnahmen (2026-11-24); Suchmaschinen sperrten nach wenigen Abfragen (DDG Bot-Detection, Bing unbrauchbar).
- Für eine belastbare Entscheidung ist eine kostenpflichtige Recherche (DPMA/EUIPO oder Markenanwalt) erforderlich.
