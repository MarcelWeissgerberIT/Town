# Lindenau – isometrische Stadtbausimulation

Ein kleines Dorf am Fluss wird zur Metropole. Lindenau ist eine Stadtbausimulation im Browser mit
hochauflösender 3D-Grafik in isometrischer Ansicht: Man kann bis auf einzelne Menschen heranzoomen,
den Baustellen beim Wachsen zusehen und dem Leben in den Straßen folgen.

Alle Grafiken (Fassaden, Dachziegel, Kopfsteinpflaster, Ladenschilder, Bäume, Fahrzeuge, Menschen)
werden beim Start prozedural erzeugt. Es gibt keine Bilddateien, deshalb bleibt alles bei jeder
Zoomstufe scharf.

## Spielen

**https://marcelweissgerberit.github.io/Town/** (wird bei jedem Push über GitHub Pages veröffentlicht)

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

Optionale URL-Parameter: `?q=low|mid|high` (Grafikqualität), `?fresh` (Spielstand ignorieren).

## Einzeldatei-Build

`node tools/build-artifact.mjs dist/lindenau.html` bündelt das Spiel mit esbuild in eine einzige
HTML-Seite (z. B. zum Teilen als Artifact).

## Projektstruktur

```
index.html          Oberfläche (HUD, Werkzeuge, Dialoge)
css/style.css       Stil der Oberfläche
js/main.js          Start, Hauptschleife, Ereignisse (Brände, Stufenaufstieg, Speichern)
js/config.js        Gebäude, Stadtstufen, Kosten
js/textures.js      prozedurale Texturen und Fassaden-Atlas
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
