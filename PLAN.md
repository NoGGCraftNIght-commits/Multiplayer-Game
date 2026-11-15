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

# Nächster Auftrag (15.11.2026, noch nicht begonnen)

Wunsch: HUD wie im großen Vorbild (GTA V), Gebäude und Autos sehr realistisch, Blaster sehen aus wie echte Spielwaffen aus dem Vorbild.
Regel: nur Aufbau und Stimmung nachbauen. Keine Original-Schrift (Pricedown), keine Logos, Icons, Modelle oder Texturen aus GTA (Urheberrecht).
Ablauf je Phase: umsetzen → `npm test` → Bilder mit `view.cjs` (Tag + Nacht, Qualität low + medium) → Commit + Push auf `claude/confident-cori-jj4oph`.

## Phase 8 – HUD im Stil des Vorbilds
Dateien: `client/index.html` (Block `<div id="hud">`), `client/css/style.css` (Abschnitt HUD), `client/js/hud.js` (`minimap`), `client/js/main.js` (HUD-Updates: `hpbar`, `ammo`, `wname`, `kmh`, Sterne).
- ☐ Minikarte unten links, abgerundetes Rechteck ca. 260 × 170 px statt Kreis oben links (`#minimap` + Canvas-Größe in `hud.js`: `R` → Breite/Höhe getrennt, Ausschnitt nach vorn verschoben, Spieler-Pfeil im unteren Drittel).
- ☐ Kartenfarben dunkel/entsättigt: Straßen grau-weiß, Blöcke dunkelgrau, Wasser dunkelblau, Parks dunkelgrün (`drawCity`).
- ☐ Unter der Karte zwei schmale Balken: links grün = Energie (`#hpbar`), rechts blau = Schutz (vorerst leer/voll als Platzhalter oder weglassen). Rot blinkend unter 25 %.
- ☐ Oben rechts untereinander: Uhrzeit (`#clock` dorthin), Waffenbild + Munition „28 | 120“ (`#weapon`), darunter Fahndungssterne (`#stars`, weiße Umrisse, aktive Sterne weiß gefüllt, blinkend beim Abtauchen = bleibt).
- ☐ Waffenbild: kleines Canvas-Icon (Silhouette des neuen Waffenmodells, Phase 11) statt Text; Name nur kurz beim Wechsel einblenden.
- ☐ Waffenrad: Taste Tab halten bzw. Touch-Taste ⟳ lange drücken → Kreis mit 4 Feldern, Maus/Stick wählt (Tab ist aktuell Punkteliste → Punkteliste auf `P` verlegen, Hinweistexte im Menü anpassen).
- ☐ Fahrzeugname unten rechts groß, kurz eingeblendet beim Einsteigen (statt `#speed`-Leiste); km/h klein darunter.
- ☐ Meldungen (`#feed`) oben links als dunkle Box mit Text, nicht mehr rechts.
- ☐ Großer Text bei K.o. („Durchgeweicht!“/„Erwischt!“) mittig, grau entsättigter Bildschirm (CSS `filter: grayscale` auf `#game` während K.o.).
- ☐ Schrift: freie Google-Schrift mit ähnlicher Wirkung, z. B. „Bebas Neue“ oder „Oswald“ (OFL) für Zahlen/Titel; Lizenz im README nachtragen.
- ☐ Touch: Layout skalieren (`body.touch`), Karte kleiner (200 × 130), nichts darf Touch-Tasten verdecken.
- Test: `touch.cjs` + Bild PC; Prüfen, dass `e2e.cjs` IDs (`#ammo`, `#hpbar`, `#starsOn`) noch findet.

## Phase 9 – Gebäude realistischer
Datei: `client/js/buildings.js` (alles prozedural, Canvas-Texturen, 6 Sammel-Meshes – Draw-Call-Budget halten!).
- ☐ Texturen höher auflösen auf medium/high (PX 128 → 256), low bleibt 128 (Speicher Chromebook).
- ☐ Normal-/Rauheitskarten aus derselben Canvas ableiten (Fensterscheiben glatt + spiegelnd über `roughnessMap`, Putz rau) → Scheiben spiegeln `scene.environment`.
- ☐ Echte Fenster-Tiefe vortäuschen: dunkler Rahmenschatten innen + Innenraum-Andeutung (Vorhänge, Decke hell, Lampen) in der Textur; nachts mehr Variation.
- ☐ Neue Gebäudetypen in `TINT`/`CELL`: Wolkenkratzer mit Glasfassade + Metall-Lisenen, Backstein/Altbau, Parkhaus (offene Decks), Hotel am Strand mit Balkonen.
- ☐ Höhenstaffelung: Türme mit Rücksprüngen (2–3 schmalere Quader übereinander), Dachkronen.
- ☐ Erdgeschoss: mehr Ladenvarianten, Schaufenster mit Auslagen, Eingänge mit Vordach, Graffiti/Schmutzstreifen unten (Verwitterung via `vertexColors` dunkler am Boden).
- ☐ Dächer: Wassertanks, Lüfter, Antennen, Kies-Textur.
- ☐ Straßen (world.js `canvasTex`): Flicken, Ölflecken, Gullys, Bordstein-Kante als eigener Quader; Ampeln an Kreuzungen (InstancedMesh, nur Optik).
- ☐ Licht: Standard-Stil auf „real“ setzen (Menü `#style` Default), Nebel etwas dunstiger, Sonne wärmer.
- Budget: max. +6 Draw Calls, Dreiecke < 1,5 Mio auf medium; mit `view.cjs` `calls/tris` messen.

## Phase 10 – Autos realistischer
Dateien: `client/js/vehicles.js` (Laden/Material), `client/js/assets.js`, ggf. neue Modelle in `client/assets/models/`.
- ☐ Zuerst Material-Upgrade an den Kenney-Modellen: Lack als `MeshPhysicalMaterial` mit `clearcoat 1`, `metalness 0.6`, `roughness 0.35`; Scheiben dunkel getönt, glatt, leicht durchsichtig; Felgen Chrom; Reifen matt schwarz; `scene.environment` immer setzen (auch Low-Poly-Stil), damit Lack spiegelt.
- ☐ Scheinwerfer/Rücklichter als emissive Flächen (nachts an, Bremslicht hell beim Bremsen), Kennzeichen-Fläche.
- ☐ Proportionen: `CAR_SIZE` in `shared.js` prüfen (flacher, breiter wirkt echter), Räder größer.
- ☐ Falls Material nicht reicht: freie realistischere Modelle suchen (Lizenz CC0/CC-BY, z. B. Quaternius, Poly Pizza CC0), mit `rb/conv.mjs`-Pipeline (meshopt, WebP) umwandeln, Größe < 400 KB je Auto. Lizenz im README eintragen. Keine Marken/Logos am Auto.
- ☐ Schadensoptik (`crumple`, `door`) muss mit neuen Materialien weiter gehen – Test „Autoschaden + Explosion“ + Bilder.
- ☐ Schatten unter dem Auto (Blob-Schatten auf low ohne Schattenkarte).

## Phase 11 – Spielzeug-Blaster im Stil echter Spielwaffen
Datei: `client/js/character.js` (`makeBlaster`, `gunOf`, `gunmetal`), `shared.js` `WEAPONS` (Namen).
- ☐ Kenney-Blaster durch eigene prozedurale Modelle aus Grundkörpern ersetzen (keine Fremd-Assets nötig): Pistole (Wasser), Maschinenpistole (Schaum), Schrotflinte (Konfetti), Gewehr (Farbe). Teile: Lauf (Zylinder), Gehäuse (Box mit Fase), Griff schräg, Magazin, Abzugsbügel, Kimme/Korn, Schiene.
- ☐ Material: schwarzes Polymer + mattes Metall, kleine Glanzkanten; orange Mündung bleibt (Spielzeug-Kennzeichen, Schutz der Idee „harmlos“).
- ☐ Mündungspunkt aus dem neuen Modell (statt Bounding-Box-Suche), Haltung beim Zielen prüfen (Figur-Hand, `AIM_FLAG`).
- ☐ Mündungsblitz = Wassernebel/Konfettiwolke statt Feuer.
- ☐ Waffen-Icons für HUD (Phase 8) aus denselben Modellen rendern (einmal in Offscreen-Canvas).
- ☐ Namen anpassen, keine echten Waffenmarken.

## Phase 12 – Abschluss
- ☐ `npm test`, `e2e.cjs` low + medium, `touch.cjs`, Bilder Tag/Nacht.
- ☐ README: neue Schrift-/Modell-Lizenzen, Steuerung (Waffenrad, Punkteliste auf P).
- ☐ PLAN.md Stand aktualisieren, Commit, Push. Kein Pull Request.

## Hinweise für die nächste Sitzung
- Bild-Werkzeuge liegen nur im Scratchpad (geht verloren): `view.cjs` = Playwright mit Server im selben Prozess, Teleport setzt auch Serverposition (`place`). Bei Verlust neu schreiben: Server per `process.env.PORT` + `import('server/server.js')` starten, `?debug` öffnet `window.G`.
- Testpunkt Straße: `x = roadCenter(3)`, `z = blockMin(3) + 20` (Werte aus `shared.js`).
- Das abgelehnte Thema (Tarn-Overlay gegen Schul-Überwachung) bleibt abgelehnt und wird nicht gebaut.
