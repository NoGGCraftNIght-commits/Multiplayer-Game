# Grand Tor Auto

3D-Mehrspieler-Spiel für den Browser: eine offene Strandstadt, 42 Figuren, Autos mit Fahrphysik und Schaden,
vier Schusswaffen mit Mündungsfeuer und Leuchtspur, Passanten, Verkehr, Fahndung bis 6 Sterne mit Streifenwagen,
Wachen und Hubschrauber, Lackierereien, Autoradio mit eigenen Sendern. Die Mechaniken orientieren sich an den
Stadt-Actionspielen der 2000er; Autos, Musik, Karte und Klänge sind eigene Arbeit aus Code. Bis zu 16 Spieler pro Raum. Läuft auf PC, Chromebook (Maus, Trackpad oder Touch), Tablet und Handy.

Alles ist eigene Arbeit oder frei lizenziert; es werden keine geschützten Namen, Marken oder Inhalte verwendet.

- `client/` – das Spiel (reine Webseite, kein Build-Schritt), geeignet für GitHub Pages
- `server/` – Mehrspieler-Server (Node.js + Socket.IO), liefert das Spiel zusätzlich selbst aus

## 1. Lokal starten

1. [Node.js](https://nodejs.org) ab Version 20 installieren.
2. Im Terminal:

   ```bash
   cd server
   npm install
   npm start
   ```

3. Im Browser `http://localhost:3000` öffnen, Namen eingeben, **Spielen**.
4. Mitspieler im selben Netz öffnen `http://<IP-des-Rechners>:3000` und geben den Raumcode ein
   (oder nutzen den Einladungslink oben im Spiel).

Ohne Server läuft das Spiel nicht: Er verwaltet Räume, Passanten, Verkehr, Energie, Munition und Fahndung.

## 2. Online stellen

**Ohne eigenen Server (Standard auf GitHub Pages):** Wer „Spielen“ ohne Raumcode drückt, erstellt einen Raum; sein
Browser rechnet dann das Spiel (`client/js/game-server.js`), die anderen verbinden sich per Raumcode direkt mit ihm
(WebRTC, Vermittlung über den freien PeerJS-Dienst; blockt ein Schulnetz direkte Verbindungen, läuft es über einen
öffentlichen TURN-Relay). Das Spiel des Gastgebers rechnet ein Web Worker, es läuft also auch im Hintergrund-Tab weiter.
Verlässt der Gastgeber das Spiel, übernimmt automatisch der Mitspieler mit der kleinsten Nummer den Raum (Ort, Waffen
und Geld bleiben, Autos und Passanten beginnen neu).

### Server

Am schnellsten: auf render.com **New → Blueprint** und dieses Repository wählen (Datei `render.yaml`).
Danach ist das Spiel unter der Render-Adresse direkt spielbar. Damit auch die GitHub-Pages-Seite ohne Eingabe
verbindet, die Render-Adresse in `client/js/config.js` als `SERVER_URL` eintragen.

Jeder Anbieter mit Node.js und WebSockets geht (z. B. Render, Railway, Fly.io, eigener Server).

1. Das **ganze** Repository bereitstellen (der Server lädt `client/js/shared.js`).
2. Build-Befehl: `cd server && npm ci` · Start-Befehl: `node server/server.js`
3. Umgebungsvariablen: `PORT` (setzt der Anbieter meist selbst), `CORS_ORIGIN` = Adresse der Webseite,
   z. B. `https://dein-name.github.io` (Standard `*` erlaubt alle).
4. Test: `https://dein-server/health` antwortet mit `ok`. Unter `https://dein-server/` ist das Spiel schon spielbar.

### Webseite auf GitHub Pages

1. In `client/js/config.js` die Server-Adresse eintragen:
   `export const SERVER_URL = 'https://dein-server.example.com';`
2. Auf GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Auf den Hauptzweig pushen. Der Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `client/`.
4. Das Spiel liegt dann unter `https://dein-name.github.io/<repository>/`.

Im Menü gibt es nur noch den Raumcode (leer = neuer Raum). „Server“ zeigt alle offenen Räume mit dem Namen
ihres Erstellers; ein Klick tritt bei. Zum Testen geht weiter `?server=https://dein-server.example.com` an der Adresse.

## 3. Steuerung

Das Spiel erkennt selbst, womit du spielst: Beim Start und beim Umklappen eines Chromebooks zählt der Tablet-Modus,
danach das zuletzt benutzte Gerät (Finger auf dem Bildschirm → Touch-Tasten, Taste oder Maus → Tastatursteuerung).

| Aktion | PC / Chromebook | Tablet / Handy |
|---|---|---|
| Laufen, Fahren | W A S D | Stick links |
| Umschauen | Maus oder Trackpad, auch Pfeiltasten | rechts wischen |
| Sprinten | Umschalt | Stick ganz durchdrücken |
| Springen / Handbremse | Leertaste | ⤒ |
| Schießen | Linksklick, V oder Enter | ✛ (gedrückt halten, dabei wischen) |
| Zielen | Rechtsklick halten oder C (an/aus) | ◎ |
| Waffe wechseln (nur eigene) | 1–4, Q, Mausrad | ⟳ antippen |
| Waffenrad | Tab halten, mit Maus zeigen, loslassen | ⟳ lange drücken, Finger ziehen |
| Nachladen · im Auto: Radiosender | R | automatisch |
| Ein-/Aussteigen | F | 🚗 |
| Hupe (im Streifenwagen: Sirene) · Auto aufrichten | H · T | 📯 |
| Passanten grüßen · Daumen runter | E · N | 👋 |
| Waffenladen: Menü öffnen, kaufen | am Tresen E, dann 1–3 | 👋, dann antippen |
| Punkteliste | L halten | ≡ |
| Pause | Esc oder P | II |

Trackpad-Tipp: Mit Pfeiltasten umschauen und mit V schießen, dann muss man nicht gleichzeitig wischen und klicken.

## 4. Spielregeln in Kürze

- **Energie und Weste:** 100 Energie. Eine Schutzweste (blauer Ring) fängt bis zu 100 Schaden zuerst ab, ein Herz
  (roter Ring, in Parks und am Krankenhaus) füllt die Energie auf. Bei 0 bist du erledigt: Neustart nach 4 Sekunden
  vor dem Krankenhaus, dabei sind Weste und alle Waffen außer der Pistole weg und es kostet 100 $.
- **Autos:** Jeder Aufprall kostet das Auto Energie, je schneller, desto mehr. Blech verformt sich, Türen fallen ab,
  ab halber Energie raucht der Motor. Bei 0 brennt es vorn und fliegt nach 4,5 Sekunden in die Luft – wer noch drin sitzt
  oder daneben steht, ist raus. Wracks werden nach 25 Sekunden ersetzt.
- **Fahndung (0–6 Sterne):** Auf Passanten schießen, Leute anfahren, fahrende Autos kapern, Streifenwagen klauen,
  Autos sprengen und Polizisten treffen bringt Sterne. Streifenwagen kommen mit Sirene und Blaulicht über die Straßen,
  halten neben dir und lassen Polizisten aussteigen; sitzt du im Auto, rammen sie. Bei 1–2 Sternen wollen die
  Polizisten dich festnehmen (anfassen bzw. aus dem stehenden Auto ziehen), ab 3 Sternen schießen sie und ein
  Hubschrauber kommt, aus dem sich weitere abseilen. Festnahme: Neustart vor der Polizeiwache, Waffen weg, 100 $ Strafe.
  Blinken die Sterne, sieht dich gerade niemand: Bleib einige Sekunden außer Sicht, dann ist die Fahndung vorbei.
- **Passanten:** Zwei Pistolentreffer (eine Schrotladung) und sie fallen um, bleiben 20 Sekunden mit Blutlache liegen
  und tauchen dann woanders wieder auf. Mit über 30 km/h angefahren fliegen sie durch die Luft und rutschen weg,
  langsamer fallen sie nur hin und stehen wieder auf. Explosionen schleudern alle in der Nähe weg.
- **Abtauchen:** Ein weißer Stern (Gehweg-Ecken) senkt die Fahndung um einen Stern. Durch eines der drei
  „LACK & SPRAY“-Portale fahren (rosa Punkte auf der Karte) kostet 100 $: Fahndung weg, Auto repariert, neue Farbe.
- **Radio:** Im Auto läuft ein Sender; R wechselt zwischen „Neon 88 FM“, „Kassette 101“ und aus.

- **Waffen:** Am Anfang hast du nur die Pistole. Maschinenpistole, Pump-Schrotflinte und Sturmgewehr liegen an
  Fundorten in der Stadt (gelbe Punkte auf der Karte: Gassen, Parks, Strand, unter Brücken im Flussbett; nach
  45 Sekunden liegt dort wieder eine) oder du kaufst sie in einem der drei Waffenläden (orange Punkte).
- **Geld:** Start 300 $. Jeder K.o. eines Mitspielers bringt 150 $, ein Sprung über den Fluss an einer gelb-schwarzen
  Rampe 100 $ (höchstens alle 15 Sekunden).
- **Läden:** Viele Häuser haben unten einen offenen Laden: Supermarkt, Imbiss, Bar, Modeladen, Waffenladen,
  Hochhäuser und Hotels eine Lobby.
- **Fluss:** Ein Betonkanal quert die Stadt. Brücken führen darüber, das Flussbett ist befahrbar, an zwei Straßen
  fehlt die Brücke – dort springt man mit ca. 95 km/h hinüber.

## 5. Schummelschutz

Der Server entscheidet alles, was das Spiel beeinflusst. Der Browser liefert nur Eingaben und zeigt an.

| Auf dem Server | Im Browser |
|---|---|
| Energie, Schaden, K.o., Respawn, Punkte | Kamera, Animation, Ton, Effekte |
| Munition, Nachladezeit, Feuerrate, welche Waffen man besitzt | Munitionsanzeige (Vorhersage, wird korrigiert) |
| Geld, Fundorte (Abstand, Wartezeit), Kauf nur am Tresen eines Waffenladens | Menü, Anzeige |
| Treffer: nur mit echtem Schuss, passender Richtung und freier Sicht | Flugbahn der Projektile |
| Position: Tempo-Limit zu Fuß und im Auto, nie in Gebäuden | Bewegung und Fahrphysik (werden geprüft und notfalls zurückgesetzt) |
| Autoschaden, Feuer, Explosion | verformtes Blech, Rauch, Flammen |
| Fahndungssterne, Stadtwache, Hubschrauber, Passanten, Verkehr | Darstellung |

## 6. Grafik

Im Startmenü unter „Shader“ (auch im Pausenmenü) als Karten mit Balken für Tempo und Optik:

| Stufe | Für | Was sie macht |
|---|---|---|
| Chromebook Turbo | sehr schwache Chromebooks | einfache Lambert-Shader, halbe Auflösung, 30 Bilder/s, Physik 30 Hz, wenige Passanten, keine Berge |
| Chromebook | Chromebooks mit schwacher CPU | wie Turbo, etwas schärfer und weitere Sicht |
| Niedrig | Handy, Tablet, alte Laptops | PBR-Shader, keine Schatten, kurze Sicht |
| Mittel | normale Laptops | Schatten, Glanz, Spiegelungen |
| Hoch | starke Rechner | scharfe Schatten, Umgebungsverdeckung |
| Kino | sehr starke Rechner | wie Hoch plus Farbfilter, Vignette, weite Sicht |

Auf einem Chromebook ist „Chromebook“ voreingestellt und als „Empfohlen“ markiert. Ein Wechsel zwischen den
Chromebook-Stufen und den anderen lädt das Spiel kurz neu (die Shader entstehen beim Start). Daneben bleibt der
Stil wählbar (Low-Poly oder semi-realistisch).

## 7. Tests

```bash
cd server
npm test
```

Startet den Server auf einem Testport und spielt echte Clients durch: Beitritt, Schummelschutz, Munition,
Autoschaden, Explosion, Fahndung, Verkehr.

## 8. Vereinfachungen

- Der Server prüft Bewegungen auf Plausibilität, rechnet aber keine eigene Fahrphysik. Aufprallschaden liest er aus
  dem gemeldeten Fahrverlauf.
- Streifenwagen fahren auf dem Server ohne Physik (wie der Verkehr) und können durch andere Autos gleiten.
  Der Hubschrauber ist nicht angreifbar. Schüsse beschädigen keine Autos.
- Die Pfeiler der Lackiererei-Portale haben keine Kollision. Krankenhaus und Polizeiwache sind Schilder am Gehweg,
  keine eigenen Gebäude.
- Touch-Geräte können den Radiosender nicht wechseln (jedes Auto hat seinen Sender).
- Ein Raum lebt nur im Arbeitsspeicher des Servers; nach einem Neustart sind Räume und Punkte weg.
- Es gibt keine Missionen, Motorräder, Boote oder Gangs.
- Die Leistung wurde nur mit Software-Grafik gemessen, nicht auf echten Chromebooks.

## 9. Quellen und Lizenzen

| Was | Quelle | Lizenz |
|---|---|---|
| Figuren (42 Erwachsene, 3 Wachen) und Bewegungsaufnahmen | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), Stand `0943055`, umgewandelt in GLB | MIT (`client/assets/LICENSE-Rocketbox-MIT.txt`) |
| Autos (alle Typen) | eigene Modelle aus Code (`client/js/carmodels.js`) | – |
| Satellitenschüsseln, Aggregate, Zielscheiben, Essen, Blumen, Frachtschiff | Kenney und Quaternius (über dasselbe npm-Paket) | CC0 1.0 |
| Bäume, Büsche, Steine, Kisten | Kenney ([Nature Kit](https://kenney.nl/assets/nature-kit)) und [Quaternius](https://quaternius.com) | CC0 1.0 |
| Geräusche | Kenney: Impact Sounds, Interface Sounds, RPG Audio, Sci-fi Sounds, Digital Audio | CC0 1.0 |
| Schriften „Baloo 2“ und „Oswald“ | Google Fonts | SIL Open Font License 1.1 |
| three.js, cannon-es, Socket.IO | über CDN bzw. npm | MIT |

Die Kenney- und Quaternius-Dateien stammen als verkleinerte Kopien aus dem npm-Paket
`@netforge/asset-library-files` 0.2.0 (CC0-Text: `client/assets/CC0-1.0.txt`).
Gebäude, Straßen, Strand, Hubschrauber, Himmel und alle Effekte erzeugt das Spiel selbst.
