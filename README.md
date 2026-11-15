# Spritzstadt

3D-Mehrspieler-Spiel für den Browser: eine offene Strandstadt, 42 Figuren, Autos mit Fahrphysik und Schaden,
Spielzeug-Blaster (Wasser, Schaumpfeile, Konfetti, Farbe), Passanten, Verkehr, Fahndungssterne mit Stadtwache und
Hubschrauber. Bis zu 16 Spieler pro Raum. Läuft auf PC, Chromebook (Maus, Trackpad oder Touch), Tablet und Handy.

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

### Server

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

Ohne Eintrag in `config.js` geht es auch: Server-Adresse im Menü unter „Server & Grafik“ eintragen
oder `?server=https://dein-server.example.com` an die Adresse hängen.

## 3. Steuerung

Das Spiel erkennt selbst, womit du spielst: Beim Start und beim Umklappen eines Chromebooks zählt der Tablet-Modus,
danach das zuletzt benutzte Gerät (Finger auf dem Bildschirm → Touch-Tasten, Taste oder Maus → Tastatursteuerung).

| Aktion | PC / Chromebook | Tablet / Handy |
|---|---|---|
| Laufen, Fahren | W A S D | Stick links |
| Umschauen | Maus oder Trackpad, auch Pfeiltasten | rechts wischen |
| Sprinten | Umschalt | Stick ganz durchdrücken |
| Springen / Handbremse | Leertaste | ⤒ |
| Spritzen | Linksklick, V oder Enter | 💦 (gedrückt halten, dabei wischen) |
| Zielen | Rechtsklick halten oder C (an/aus) | ◎ |
| Blaster wechseln | 1–4, Q, Mausrad | ⟳ antippen |
| Waffenrad | Tab halten, mit Maus zeigen, loslassen | ⟳ lange drücken, Finger ziehen |
| Nachladen | R | automatisch |
| Ein-/Aussteigen | F | 🚗 |
| Hupe · Auto aufrichten | H · T | 📯 |
| Passanten grüßen · Daumen runter | E · N | 👋 |
| Punkteliste | L halten | ≡ |
| Pause | Esc oder P | II |

Trackpad-Tipp: Mit Pfeiltasten umschauen und mit V spritzen, dann muss man nicht gleichzeitig wischen und klicken.

## 4. Spielregeln in Kürze

- **Energie:** 100. Treffer kosten Energie, bei 0 bist du „durchgeweicht“ und kommst nach 4 Sekunden zurück.
- **Autos:** Jeder Aufprall kostet das Auto Energie, je schneller, desto mehr. Blech verformt sich, Türen fallen ab,
  ab halber Energie raucht der Motor. Bei 0 brennt es vorn und fliegt nach 4,5 Sekunden in die Luft – wer noch drin sitzt
  oder daneben steht, ist raus. Wracks werden nach 25 Sekunden ersetzt.
- **Fahndung (0–5 Sterne):** Passanten nass spritzen, Leute anfahren, fahrende Autos kapern, Autos sprengen und die
  Stadtwache treffen bringt Sterne. Die Stadtwache rückt an und spritzt zurück. Ab 3 Sternen kommt ein Hubschrauber,
  aus dem sich weitere Wachen abseilen. Blinken die Sterne, sieht dich gerade niemand: Bleib einige Sekunden
  außer Sicht, dann ist die Fahndung vorbei.

## 5. Schummelschutz

Der Server entscheidet alles, was das Spiel beeinflusst. Der Browser liefert nur Eingaben und zeigt an.

| Auf dem Server | Im Browser |
|---|---|
| Energie, Schaden, K.o., Respawn, Punkte | Kamera, Animation, Ton, Effekte |
| Munition, Nachladezeit, Feuerrate | Munitionsanzeige (Vorhersage, wird korrigiert) |
| Treffer: nur mit echtem Schuss, passender Richtung und freier Sicht | Flugbahn der Projektile |
| Position: Tempo-Limit zu Fuß und im Auto, nie in Gebäuden | Bewegung und Fahrphysik (werden geprüft und notfalls zurückgesetzt) |
| Autoschaden, Feuer, Explosion | verformtes Blech, Rauch, Flammen |
| Fahndungssterne, Stadtwache, Hubschrauber, Passanten, Verkehr | Darstellung |

## 6. Grafik

Im Menü unter „Server & Grafik“ und im Pausenmenü: Qualität (Niedrig/Mittel/Hoch) und Stil
(Low-Poly oder semi-realistisch). „Niedrig“ ist für Tablets und schwache Chromebooks gedacht: keine Schatten,
kürzere Sichtweite, weniger verschiedene Passanten-Figuren.

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
- Die Stadtwache kommt zu Fuß und per Hubschrauber, nicht im Streifenwagen. Der Hubschrauber ist nicht angreifbar.
- Blaster beschädigen keine Autos.
- Ein Raum lebt nur im Arbeitsspeicher des Servers; nach einem Neustart sind Räume und Punkte weg.
- Gebäude sind Kulisse (nicht betretbar). Es gibt keine Missionen.
- Die Leistung wurde nur mit Software-Grafik gemessen, nicht auf echten Chromebooks.

## 9. Quellen und Lizenzen

| Was | Quelle | Lizenz |
|---|---|---|
| Figuren (42 Erwachsene, 3 Wachen) und Bewegungsaufnahmen | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), Stand `0943055`, umgewandelt in GLB | MIT (`client/assets/LICENSE-Rocketbox-MIT.txt`) |
| Autos | Kenney, [Car Kit](https://kenney.nl/assets/car-kit) | CC0 1.0 |
| Bäume, Büsche, Steine, Kisten | Kenney ([Nature Kit](https://kenney.nl/assets/nature-kit)) und [Quaternius](https://quaternius.com) | CC0 1.0 |
| Geräusche | Kenney: Impact Sounds, Interface Sounds, RPG Audio, Sci-fi Sounds, Digital Audio | CC0 1.0 |
| Schriften „Baloo 2“ und „Oswald“ | Google Fonts | SIL Open Font License 1.1 |
| three.js, cannon-es, Socket.IO | über CDN bzw. npm | MIT |

Die Kenney- und Quaternius-Dateien stammen als verkleinerte Kopien aus dem npm-Paket
`@netforge/asset-library-files` 0.2.0 (CC0-Text: `client/assets/CC0-1.0.txt`).
Gebäude, Straßen, Strand, Hubschrauber, Himmel und alle Effekte erzeugt das Spiel selbst.
