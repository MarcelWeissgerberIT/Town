# Lindenau – isometrische Stadtbausimulation

Ein kleines Dorf am Fluss wird zur Metropole. Lindenau ist eine Stadtbausimulation im Browser mit
hochauflösender 3D-Grafik in isometrischer Ansicht: Man kann bis auf einzelne Menschen heranzoomen,
den Baustellen beim Wachsen zusehen und dem Leben in den Straßen folgen.

Die Oberflächen sind fotorealistisch: Fassaden (Putz in acht Farben mit sieben Fensterstilen –
Klappläden in Grün, Rot und Taubenblau, Segmentbögen, Gründerzeit-Giebel, französische Balkone –,
Fachwerk, norddeutsches Backstein-Fachwerk, Schiefer, Lärchenholz, Bruchstein, Klinker, moderne
Häuser, Läden mit Auslagen, Glasfassaden, Kirchenfenster), Biberschwanz-, Hohlpfannen- und
Schieferdächer, Kopfsteinpflaster, Asphalt, Rasen und Laub wurden mit **OpenArt** generiert und zu
einem Fassaden-Atlas mit passender Nachtbeleuchtung verarbeitet. Ladenschilder mit deutscher
Beschriftung, Gebäudeformen, Fahrzeuge und Menschen entstehen im Spiel prozedural.

Kein Haus gleicht dem anderen: Traufhäuser mit Gauben oder Zwerchhaus, Giebelhäuser, Winkelhäuser,
Villen mit Erker oder Eckturm und Mansarddach, Siedlungshäuser mit Garage und Auto in der Einfahrt,
Doppelhäuser in zwei Farben, moderne Kuben mit Carport und Pool, Bauernhäuser mit Traktor,
Altstadtzeilen aus schmalen Giebelhäusern und Gründerzeit- und Klinkerblöcke. Dazu Gärten mit
Trampolin, Gartenhaus, Gewächshaus, Sandkasten, Wäscheleine, Fahrrädern und Jägerzaun.

Die Fahrzeuge sind modellierte Karosserien mit gemalten Details: Limousine, Kleinwagen, Kombi,
Taxi, Polizeistreife mit Lichtbalken, Rettungswagen, Feuerwehr mit Drehleiter, Müllwagen,
Linienbus, Postauto, Umzugswagen, Lkw und Betonmischer. Blaulichter blinken bei Einsätzen.

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

Code-Überblick: `js/houses.js` enthält die Hausarchetypen (Stile, Dachformen, Gauben, Gärten),
`js/vehicles.js` die Fahrzeugmodelle samt prozeduralem Lackier-Atlas, `js/buildgen.js` die übrigen
Gebäude.

## Assets

Alle Bilder wurden mit dem OpenArt MCP erzeugt (Modelle *Nano Banana 2* und *GPT Image 2*, text2image,
Projekt „Lindenau Stadtbau“). Quell-URLs und historyIds stehen in `tools/asset_sources.json`.

Für die Fenster wurden die Glasscheiben im Prompt als reines Magenta angefordert. Die Pipeline ersetzt
diese Maske durch gespiegeltes Glas und nutzt sie als Leuchtmaske, damit nachts genau die Fenster
leuchten. Rohbilder neu verarbeiten:

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
js/buildgen.js      Gebäudegeneratoren (Fachwerk, Altbau, Hochhäuser, Kirche, Stadion …)
js/models.js        Fahrzeuge, Menschen, Bäume, Kleinkram
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
