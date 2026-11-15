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
