# Lindenau – isometrische Stadtbausimulation

Ein kleines Dorf am Fluss wird zur Metropole. Lindenau ist eine Stadtbausimulation im Browser mit
hochauflösender 3D-Grafik in isometrischer Ansicht: Man kann bis auf einzelne Menschen heranzoomen,
den Baustellen beim Wachsen zusehen und dem Leben in den Straßen folgen.

Die Oberflächen sind fotorealistisch: über 110 Fassadentexturen (Putz mit Klappläden, Segmentbögen,
Gründerzeit-Giebeln und Jugendstil-Stuck, fränkisches, niedersächsisches und Backstein-Fachwerk,
Schiefer, Holzschindeln, Lärchenholz, Bruchstein, Klinker, Hanse-Backstein, 50er- und 70er-Jahre,
Bauhaus, Plattenbau, Art déco, Lamellen- und Diagrid-Glas, Gold- und Bronzeglas, 15 Ladentypen),
Biberschwanz-, Hohlpfannen-, Schiefer-, Reet-, Schindel- und Gründächer, Kopfsteinpflaster, Asphalt,
Rasen und Laub wurden mit **OpenArt** generiert und zu einem Fassaden-Atlas mit passender
Nachtbeleuchtung verarbeitet. Putzflächen sind im Atlas neutral gespeichert und werden pro Haus aus
einer großen Farbpalette eingefärbt, sodass kaum zwei Häuser die gleiche Farbe haben.
Ladenschilder mit deutscher Beschriftung, Gebäudeformen, Fahrzeuge und Menschen entstehen im Spiel
prozedural.

**47 Wohnhausvarianten** von Fachwerk bis modern, z. B. fränkisches und niedersächsisches
Fachwerkhaus, Bauernhaus mit Traktor, Schwarzwaldhaus, Alpenhaus, Friesenhaus mit Reetdach,
Schieferhaus, Landhaus mit Klappläden, Gründerzeit-Villa mit Turm, Jugendstil-Villa, Bauhaus-Villa,
50er-Siedlungshaus, 70er-Bungalow, Klinker-Reihenhäuser, Doppelhaus, Holzhaus, weißer und
anthrazitfarbener Kubus, Scheunenhaus; Altstadt- und Fachwerkzeilen, hanseatische Treppengiebel,
Barock- und Jugendstil-Bürgerhäuser, Wiederaufbauhäuser; Gründerzeit-, Jugendstil- und Klinkerblöcke,
Plattenbau, Bauhaus-Wohnblock; Wohntürme bis zum grünen und gläsernen Wohnturm. Dazu Gärten mit
Trampolin, Gartenhaus, Gewächshaus, Sandkasten, Wäscheleine, Fahrrädern und Jägerzaun.

**22 Gewerbevarianten** vom Einzelhandel bis zum Wolkenkratzer: Ladenhaus, Fachwerk-Ladenhaus mit
Nasenschild, Kiosk mit Litfaßsäule, Tankstelle, Supermarkt und Fachmarkt mit Parkplatz,
50er-Geschäftshaus, Kaufhaus der 20er mit Uhr und Kupferdach, Bürohäuser mit Fensterbändern oder
Lochfassade, Grandhotel, Art-déco-Wolkenkratzer, Lamellenturm mit Hubschrauberlandeplatz,
Diagrid-Rundturm, gedrehter Glasturm, goldener Achteckturm, Zwillingstürme mit Himmelsbrücke und
Einkaufszentrum mit Büroturm. Das Infofenster eines Gebäudes nennt seine Bauweise.

Die Fahrzeuge sind modellierte Karosserien mit gemalten Details: Limousine, Kleinwagen, Kombi,
Taxi, Polizeistreife mit Lichtbalken, Rettungswagen, Feuerwehr mit Drehleiter, Müllwagen,
Linienbus, Postauto, Umzugswagen, Lkw und Betonmischer. Blaulichter blinken bei Einsätzen.
Autos bremsen vor dem Ziel ab und blenden beim Parken weich aus, statt plötzlich zu verschwinden.

## Spielen

**https://marcelweissgerberit.github.io/Town/** (wird bei jedem Push auf `main` über GitHub Pages veröffentlicht)

Läuft auf Desktop (Maus und Tastatur) und Tablet (Touch). Auf iPad und Android-Tablets lässt sich
das Spiel über „Zum Home-Bildschirm“ als Vollbild-App ablegen.

## Bedienung

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Karte verschieben | Linke Maustaste ziehen (Werkzeug „Ansehen“), WASD, Pfeiltasten | 1 Finger ziehen |
| Zoomen | Mausrad, `+` / `−` | 2 Finger spreizen |
| Drehen | Rechte Maustaste ziehen, `Q` / `E` | 2 Finger drehen |
| Werkzeuge | `1`–`9` | Werkzeugleiste unten |
| Gebäude drehen beim Platzieren | `R` | – |
| Pause | Leertaste | Pause-Knopf |
| Kinomodus | `K` | Kamera-Knopf |

Ein Klick auf ein Haus, eine Person oder ein Fahrzeug öffnet die Details. Personen und Fahrzeugen
kann man folgen.

## Spielablauf

- **Straßen** ziehen (Brücken über den Fluss sind möglich), **Zonen** für Wohnen, Gewerbe und
  Industrie aufziehen. Gebaut wird nur auf Feldern, die an einer Straße liegen.
- Häuser entstehen von selbst, sobald Nachfrage besteht (Anzeige W/G/I rechts). Jede Baustelle
  durchläuft Vermessung, Aushub mit Bagger, Fundament mit Betonmischer, Rohbau mit Gerüst und
  Turmdrehkran, Dach & Fassade und Innenausbau. Danach kommt der Umzugswagen.
- Mit steigendem Bodenwert und guter Versorgung (Feuerwehr, Polizei, Gesundheit, Bildung) werden
  Häuser durch größere ersetzt: Einfamilienhaus → Stadthaus → Mehrfamilienhaus → Wohnturm (2×2),
  Laden → Geschäftshaus → Kaufhaus → Bürohochhaus (2×2), Werkstatt → Fabrik → Logistikzentrum.
- Stadtstufen: **Dorf → Kleinstadt (350) → Stadt (1.800) → Großstadt (7.000) → Metropole (22.000)**.
  Jede Stufe schaltet neue Gebäude frei, bis hin zu Stadion und Fernsehturm.
- Leben in der Stadt: Fußgänger (manche mit Hund), Kinder auf Spielplätzen, Tauben am Brunnen,
  Autos mit Ampeln an Kreuzungen, Linienbusse ab zwei Haltestellen, Müllabfuhr, Post, Lieferwagen,
  Polizeistreifen, Rettungswagen und Feuerwehreinsätze bei Bränden.
- Tag und Nacht: Fenster gehen abends nach und nach an, Laternen und Scheinwerfer leuchten.
- Optional: prozedurale Geräuschkulisse (Vögel, Grillen, Baustellenlärm, Kirchenglocken).
- Das Spiel speichert automatisch jede Minute im Browser.

## Lokal starten

Es gibt keinen Build-Schritt. Ein beliebiger statischer Webserver genügt:

```bash
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

Three.js (r169) wird per Import-Map von jsDelivr geladen.

Optionale URL-Parameter: `?q=low|mid|tablet|high` (Grafikqualität), `?fresh` (Spielstand ignorieren),
`?procedural` (ohne Fotoassets).

Code-Überblick: `js/houses.js` enthält den Wohnhauskatalog (Stile, Farbpalette, Dachformen, Gauben,
Gärten), `js/commerce.js` den Gewerbekatalog bis zum Wolkenkratzer, `js/vehicles.js` die
Fahrzeugmodelle samt prozeduralem Lackier-Atlas, `js/buildgen.js` die übrigen Gebäude.

## Assets

Alle Bilder wurden mit dem OpenArt MCP erzeugt (Modelle *Nano Banana 2* und *GPT Image 2*, text2image,
Projekt „Lindenau Stadtbau“). Quell-URLs und historyIds stehen in `tools/asset_sources.json`.

Für die Fenster wurden die Glasscheiben im Prompt als reines Magenta angefordert. Die Pipeline ersetzt
diese Maske durch gespiegeltes Glas und nutzt sie als Leuchtmaske, damit nachts genau die Fenster
leuchten. Putzflächen werden neutralisiert und als Maske im roten Kanal der ORM-Textur abgelegt;
der Shader färbt nur diese Flächen mit der Hausfarbe ein. Rohbilder neu verarbeiten:

```bash
pip install pillow numpy scipy
python3 tools/process_assets.py   # lädt fehlende Rohbilder, schreibt assets/
```

Ohne die Bilddateien fällt das Spiel automatisch auf prozedurale Texturen zurück
(erzwingen mit `?procedural`).

## Einzeldatei-Build

`node tools/build-artifact.mjs dist/lindenau.html` bündelt den Code mit esbuild in eine einzige
HTML-Seite (z. B. zum Teilen als Artifact). Der Ordner `assets/` muss daneben liegen.

## Projektstruktur

```
index.html          Oberfläche (HUD, Werkzeuge, Dialoge)
css/style.css       Stil der Oberfläche
js/main.js          Start, Hauptschleife, Ereignisse (Brände, Stufenaufstieg, Speichern)
js/config.js        Gebäude, Stadtstufen, Kosten
assets/             fotorealistische Texturen (OpenArt) und Fassaden-Atlas
tools/              Asset-Pipeline (process_assets.py) und Einzeldatei-Build
js/textures.js      Laden der Fotoassets, Ladenschilder, prozeduraler Fallback
js/materials.js     Materialien inkl. nächtlicher Fensterbeleuchtung
js/geom.js          Geometrie-Builder (Buckets je Material)
js/houses.js        Wohnhauskatalog (47 Varianten)
js/commerce.js      Gewerbekatalog (22 Varianten, Laden bis Wolkenkratzer)
js/buildgen.js      Gebäudegeneratoren (Industrie, Kirche, Stadion …) und Fassaden-Einfärbung
js/vehicles.js      Fahrzeugmodelle und Lackier-Atlas
js/models.js        Menschen, Bäume, Fahrräder, Traktor, Kleinkram
js/ground.js        Gelände, Straßen, Brücken, Ufer, Umland mit Feldern
js/chunks.js        Zusammenfassen der Geometrie in Kartenblöcke
js/construction.js  Baustellen mit Gerüst, Kran und Bagger
js/traffic.js       Verkehr, Ampeln, Busse, Einsatzfahrzeuge
js/people.js        Fußgänger, Hunde, Bauarbeiter, Tauben
js/sim.js           Nachfrage, Wachstum, Bodenwert, Finanzen
js/env.js           Sonne, Tag/Nacht, Schatten
js/camera.js        Isometrische Kamera
js/ui.js            Werkzeuge, Infofenster, Minimap
js/audio.js         Geräuschkulisse (WebAudio)
js/save.js          Speichern und Laden
```
