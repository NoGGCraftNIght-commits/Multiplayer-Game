# Grand Tor Auto – Plan: Spielgefühl wie die 80er-Stadt-Klassiker

Vorbild sind die **Mechaniken** von GTA Vice City (Fahndung, Polizei-Jagd, Lackiererei, Pickups, Radio).
Name, Karte, Autos, Musik, Logo und HUD-Look des Vorbilds werden **nicht** übernommen: alles ist eigen.

## Unterschiede zum Vorbild → Änderung
| Vorbild | Bisher hier | Änderung |
|---|---|---|
| Echte Waffen mit Mündungsfeuer, Leuchtspur, Einschusslöchern, lautem Knall | Spielzeug-Effekte (Wasser, Konfetti, Farbe), ein Ton für alle | Phase A |
| Eckige 80er-Autos in vielen Lackfarben, Chrom, Lichter | Kenney-Spielzeugautos, alle gleich bunt | Phase B: eigene Modelle aus Code |
| Polizei kommt im Streifenwagen mit Sirene, Wachen springen raus, rammen | nur Wachen zu Fuß + Hubschrauber | Phase C |
| 6 Sterne | 5 Sterne | Phase C |
| Festnahme durch Anfassen/Rausziehen, danach Polizeiwache, Waffen weg | nur K.o. durch Wache | Phase C |
| Lackiererei: Fahndung weg, Auto heil, neue Farbe, kostet Geld | fehlt | Phase C |
| Bestechungs-Stern, Herz, Schutzweste als Pickup | nur Waffen-Pickups | Phase D |
| Panzerung 0–100 | fehlt | Phase D |
| Tod: Krankenhaus, Waffen weg, Gebühr | Respawn irgendwo, alles bleibt | Phase D |
| Radio im Auto, mehrere Sender | Motorgeräusch | Phase E: eigene Sender, Musik aus Code |

## Phasen (je Phase: Test, Commit, Push)
- ☑ **A Waffen**: echte Formen ohne orange Spitze, Mündungsfeuer + Licht, Leuchtspur, Funken/Staub, Einschusslöcher, Treffer-Wolke; Schuss-, Leer- und Nachladeton je Waffe, mit Entfernung dumpfer
- ☑ **B Autos**: eigene 80er-Modelle (Limousine, Keil-Sportwagen, Kombi, Geländewagen, Bus, Laster, Rennwagen), Lack je Auto, Chrom, Glas, Felgen; Taxi-Schild, Blaulicht-Balken; Blech-Verformung und Türen bleiben
- ☑ **C Polizei**: Streifenwagen fahren über Straßen zum Gesuchten, Sirene + Blaulicht, Wachen steigen aus; 6 Sterne; Festnahme bei Kontakt; 3 Lackierereien (Durchfahrt)
- ☑ **D Pickups & Leben**: Herz, Weste, Bestechungs-Stern; Panzerung; Krankenhaus/Wache als Neustart mit Verlust; HUD mit Weste und 6 Sternen
- ☑ **E Radio**: 2 eigene Sender (Synthpop, Electro) + Aus, Taste `R` im Auto, Sendername oben

## Bewusst weggelassen (zu groß für jetzt)
Motorräder, Boote, Flugzeuge, Gangs, Story-Missionen, Amokläufe, Nahkampf, Wetter, Immobilien, Ertrinken, Taxi-/Rettungs-Nebenjobs, versteckte Päckchen.

---

# Spritzstadt – Plan

Reihenfolge = Abarbeitung. Nach jeder Phase: Test, Commit, Push auf `claude/confident-cori-jj4oph`.
Status: ☐ offen · ◐ in Arbeit · ☑ fertig

## Phase 0 – Abschluss alter Plan
- ☑ README (Deutsch, Schritt für Schritt, Quellen + Lizenzen)
- ☑ GitHub-Pages-Workflow (`client/` ausliefern)
- ☑ `_dev/` löschen

## Phase 1 – Alle 42 Figuren
- ☑ Alle Rocketbox-Erwachsenen (F01–F17, M01–M21, Business, Sport) in gleicher Qualität wie die bisherigen 12 umwandeln
- ☑ Figuren erst laden, wenn sie gebraucht werden (Start bleibt schnell: nur Figur 1 + Animationen vorab)
- ☑ Menü: Zähler „7 / 42“, Auswahl bleibt gespeichert
- ☑ Passanten nutzen alle 42 (Qualität „Niedrig“: nur 14 verschiedene, schont Chromebook-Speicher)

## Phase 2 – Blaster sehen echter aus
- ☑ Dunkles Metall/Kunststoff statt Bonbonfarben, orange Mündung (bleibt als Spielzeug erkennbar)
- ☐ Andere Proportionen/Größen je Blaster (nicht gemacht: Formen der Modelle unverändert)

## Phase 3 – Chromebook: Trackpad + Touch, automatisch
- ☑ Tablet-Modus wird erkannt (`pointer: coarse` + zuletzt benutztes Gerät), Umschalten im laufenden Spiel
- ☑ Trackpad: Pfeiltasten = Umschauen, `V`/`Enter` = Spritzen, `C` = Zielen an/aus (Klick + Wischen gleichzeitig ist auf Trackpads unbequem)
- ☑ Zwei-Finger-Scrollen wechselt die Waffe nur noch einmal pro Geste

## Phase 4 – Server entscheidet (Schummelschutz)
Client darf nur noch: Eingaben, Kamera, Effekte, Animation, Ton.
- ☑ Munition + Nachladen laufen auf dem Server; Schuss ohne Munition wird verworfen
- ☑ Treffer zählen nur, wenn es dazu einen echten Schuss gab (Ursprung nahe am Spieler, Ziel nahe an der Schusslinie, keine Wand dazwischen)
- ☑ Position: Tempo-Limit (Token-Bucket), keine Position in Gebäuden; Verstoß → Server setzt zurück (`fix`)
- ☑ Fahrzeuge: Tempo-Limit je Typ, Rückstellung (`vfix`)
- ☑ Energie, K.o., Respawn, Punkte: bleiben auf dem Server
- ☑ `npm test` deckt alles ab

## Phase 5 – Autoschaden wie im Vorbild
- ☑ Server misst Aufprall aus dem Bewegungsverlauf (plötzlicher Tempoverlust), rechnet Schaden je Zone: vorn, hinten, links, rechts
- ☑ Gerammtes Auto bekommt ebenfalls Schaden
- ☑ Sichtbar: Blech verformt sich je Zone, Türen fallen ab, Rauch (hell → dunkel), Motor wird schwächer
- ☑ Energie 0: rote Flamme vorn, nach ~4,5 s Explosion (Auto springt hoch, Feuerball, Wrack schwarz)
- ☑ Explosion trifft Fahrer, Leute und Autos in der Nähe (Kettenreaktion möglich); Wrack wird nach 25 s ersetzt

## Phase 6 – Fahndungssterne, Stadtwache, Hubschrauber
- ☑ 0–5 Sterne pro Spieler, serverseitig. Punkte für: Passanten nass spritzen, Leute anfahren, fahrendes Auto klauen, Wache treffen, Auto sprengen
- ☑ Stadtwache (Rocketbox-Polizeifiguren) erscheint außer Sicht, läuft über das Straßennetz, spritzt mit Wasser zurück (Schaden würfelt der Server)
- ☑ Ab 3 Sternen: Hubschrauber fliegt an, bleibt über dem Spieler, Wachen seilen sich ab; nachts Suchscheinwerfer
- ☑ Sterne verfallen, wenn keine Wache in der Nähe ist; K.o. durch Wache = „Erwischt!“, Sterne weg
- ☑ HUD: Sternanzeige, blinkt beim Abtauchen

## Phase 7 – Schluss
- ☑ Browser-Test mit 2 Clients (Playwright), README, Quellen/Lizenzen
- ☐ Test auf echtem Chromebook/Tablet (hier nicht möglich)

## Bewusst weggelassen
- Server-Physik für Autos (Server prüft Plausibilität, simuliert nicht selbst)
- Streifenwagen-Verfolgung mit Fahr-KI, Hubschrauber abschießen
- Einzelspieler ohne Server
- Schaden an Autos durch Blaster (Spielzeug)

---

# Stand (15.11.2026)

Alles unten ist auf `claude/confident-cori-jj4oph` gepusht. Kein Pull Request.

## Fertig und getestet
| Was | Test |
|---|---|
| Alle 42 Figuren + 3 Wachen, Laden bei Bedarf | Browser-Test: Spieler B wählt Figur 15/42, A sieht sie |
| Blaster dunkel mit oranger Mündung | Bild geprüft |
| Trackpad: Pfeiltasten, V, C; Tablet-Erkennung | Browser-Test: Pfeiltaste dreht Kamera, V feuert |
| Server führt Munition, Feuerrate, Treffer, Position | `npm test` + Browser-Test (Munition Client 28 = Server 28, kein falsches Zurücksetzen) |
| Autoschaden je Zone, Türen, Rauch, Feuer, Explosion, Wrack | `npm test` + Browser-Test (Schaden bei beiden Spielern gleich) + Bilder |
| Fahndung 0–5 Sterne, Stadtwache, Hubschrauber, Abseilen | `npm test` + Bilder (Tag, Nacht mit Suchscheinwerfer) |
| README, GitHub-Pages-Workflow | Workflow gepusht, noch nie gelaufen |

## Nicht geprüft
- Echte Geräte: Chromebook, Tablet, Handy. Leistung nur mit Software-Grafik gemessen.
- Umklappen in den Tablet-Modus im laufenden Spiel (lässt sich hier nicht nachstellen).
- Touch-Bedienung mit neuer Sternanzeige (Test lief beim Speichern noch).
- Hubschrauber-Modell bei Tag aus der Nähe.
- GitHub Pages: muss einmal von Hand eingeschaltet werden (Settings → Pages → Source: GitHub Actions).

## Offen / Ideen
- Blaster: nur Farbe geändert, Formen wie vorher.
- Streifenwagen-Verfolgung, Hubschrauber abschießen: nicht gebaut.
- Rauch wirkt bei Tag etwas dünn.
- Wachen können in Häuserlücken hängen bleiben (dann verjähren die Sterne – wirkt wie Verstecken).

## So geht es weiter
1. Server-Adresse in `client/js/config.js` eintragen, Server bei einem Anbieter starten (README Abschnitt 2).
2. Pages einschalten.
3. Auf echtem Chromebook testen: Qualität „Niedrig“, Trackpad, Touch.

## Wo liegt was
| Datei | Inhalt |
|---|---|
| `server/server.js` | Räume, Schummelschutz, Autoschaden, Fahndung, Wachen, Hubschrauber, Passanten, Verkehr |
| `server/test.js` | Selbsttest (`npm test`) |
| `client/js/main.js` | Spielschleife, Netz, HUD, Wachen/Hubschrauber anzeigen |
| `client/js/vehicles.js` | Fahrphysik, Schadensoptik, Rauch/Feuer/Explosion |
| `client/js/character.js` | Figuren, Animation, Blaster |
| `client/js/input.js` | Tastatur, Maus/Trackpad, Touch, Tablet-Erkennung |
| `client/js/heli.js` | Hubschrauber-Modell |
| `client/js/shared.js` | Stadt, Konstanten, Figurenliste (von Client und Server genutzt) |

---

# Auftrag 15.11.2026: Stil des großen Vorbilds (GTA V) – Stand

Regel: nur Aufbau und Stimmung nachgebaut. Keine Original-Schrift, Logos, Icons, Modelle oder Texturen.

## Phase 8 – HUD ✔
- ☑ Minikarte unten links (260 × 170, dunkel, Spieler im unteren Drittel), Mitspieler am Rand festgehalten
- ☑ Balken unter der Karte: grün = Energie (rot blinkend unter 25 %), blau = Zustand des Autos beim Fahren
- ☑ Oben rechts: Uhr, Waffen-Silhouette (aus den Modellteilen gezeichnet), Munition „Magazin | Größe“, Sterne (weiß gefüllt / Umriss)
- ☑ Waffenname nur kurz beim Wechsel, Fahrzeugname groß unten rechts beim Einsteigen, km/h klein
- ☑ Waffenrad: Tab halten + Maus (Touch: ⟳ lange drücken + Finger ziehen); Punkteliste auf L
- ☑ Meldungen oben links als dunkle Kästen; K.o.: Band mittig, Bild grau
- ☑ Schrift Oswald (OFL); Touch: Karte oben links 200 × 130, nichts verdeckt die Tasten

## Phase 9 – Gebäude ✔ (Teil)
- ☑ Scheiben glatt und spiegelnd (Rauheits-/Metallkarte aus der Fassaden-Leinwand), Umgebung = Himmelsverlauf
- ☑ Doppelte Texturauflösung ab „Mittel“, Schmutzschlieren, Sockel-Schmutz an Läden
- ☑ Büro-/Glastürme mit Rücksprung im oberen Drittel
- ☑ Asphalt mit Flicken und Ölflecken, Ampeln an allen Kreuzungen (1 Draw Call, Lampen im Neon-Mesh)
- ☑ Wärmere Sonne, früherer Dunst; Standardstil war schon „real“
- ☐ Offen: neue Gebäudetypen (Backstein, Parkhaus, Strandhotel) – brauchen Änderung an `buildCity` in `shared.js` (Server rechnet Kollision mit)
- ☐ Offen: Wassertanks/Kies auf Dächern, Innenraum-Andeutung hinter Fenstern

## Phase 10 – Autos ✔ (Material)
- ☑ Ein gemeinsames `MeshPhysicalMaterial` für alle Kenney-Autos: Lack mit Klarlack, getönte Scheiben (Atlasfeld 0,6/0,7), Zierteile, matte Reifen, Chromfelgen
- ☑ Weiche Bodenschatten unter allen Autos (InstancedMesh, 1 Draw Call)
- ☐ Offen: realistischere Modelle (CC0) – nur mit neuer Modell-Pipeline; `CAR_SIZE` unverändert (Physik/Server)

## Phase 11 – Blaster ✔
- ☑ Eigene Modelle aus Grundkörpern: Wasserpistole, Schaum-MP, Konfetti-Flinte, Farbgewehr (3 Draw Calls je Blaster), orange Mündung bleibt
- ☑ Mündungsnebel/Konfetti statt Feuer; Kenney-Blaster-Dateien entfernt

## Phase 12 – Abschluss ✔
- ☑ `npm test`, `e2e.cjs` low + medium, `touch.cjs`, Bilder Tag/Nacht
- ☑ README: Steuerung (Waffenrad, L), Lizenzen (Oswald, Blaster-Zeile entfernt)

# Auftrag 15.11.2026 (2): Fluss, Berge, Parks, Läden, Waffen, Shader – Stand

## Fertig
- ☑ Fluss: Betonkanal in Blockreihe 5 (`RIVER` in shared.js), 6 Brücken, 2 Sprungrampen (Bogen aus 3 Stücken, Sprung ab ~95 km/h, Prämie 100 $), Flussbett befahrbar, im Kanal mehr Zugkraft
- ☑ Berge im Norden/Westen hinter dem Meer (Höhenraster je Stufe, eigener Dunst), Frachtschiffe
- ☑ Parks: Wegekreuz, Brunnen oder Teich, Bänke, Hecken (fest), Laternen, Blumen, mehr Baumarten
- ☑ Häuser: Backstein mit Feuertreppe, Parkhaus, Strandhotel, Wassertanks, Satellitenschüsseln/Aggregate
- ☑ 74 betretbare Läden (Supermarkt, Imbiss, Bar, Mode, 3 Waffenläden, Lobbys): Türöffnung, Innenraum, Möbel fest; Kollision = Wände + Decke (`y0`), Autos stoßen am ganzen Grundriss an
- ☑ Waffen: Pistole, Maschinenpistole, Pump-Schrotflinte, Sturmgewehr (keine Marken); Start nur Pistole; Fundorte (20, Respawn 45 s) und Kauf am Tresen; Geld (Start 300 $, K.o. +150 $); alles auf dem Server geprüft
- ☑ Fahrzeuge neu: Feuerwehr, Müllwagen, Rennwagen, Pritschenwagen, Kleinlaster (Kenney, CC0)
- ☑ Shader-Stufen als Karten im Startmenü: Chromebook Turbo, Chromebook (Lambert, 30 fps, Physik 30 Hz), Niedrig, Mittel, Hoch, Kino (Farbfilter/Vignette); Chromebook wird erkannt
- ☑ Tests: `npm test` (Fundort, Kauf, fremde Waffe, Verkehr meidet Rampen), Physik-Test Sprung/Brücke/Ausfahrt, Bilder

## Offen
- Echte Chromebook-Messung (nur Software-Grafik geprüft)
- Ladenpersonal (Figuren hinter dem Tresen), Türen zum Aufschieben, Geld-Beute
- Innenräume nur im Erdgeschoss; Obergeschosse bleiben massiv
- „2D-Modelle“ als 3D-Modelle verstanden (Tippfehler angenommen)

## Hinweise für die nächste Sitzung
- Bild-Werkzeuge liegen nur im Scratchpad (geht verloren): `view.cjs` = Playwright mit Server im selben Prozess, Teleport setzt auch Serverposition (`place`). Bei Verlust neu schreiben: Server per `process.env.PORT` + `import('server/server.js')` starten, `?debug` öffnet `window.G`.
- Testpunkt Straße: `x = roadCenter(3)`, `z = blockMin(3) + 20` (Werte aus `shared.js`).
- Das abgelehnte Thema (Tarn-Overlay gegen Schul-Überwachung) bleibt abgelehnt und wird nicht gebaut.
