# KI-Gerüchte

Ein täglicher deutscher Überblick über KI-Gerüchte, Leaks und News, die auf X auftauchen. Jede Meldung ist als „Bestätigt“ oder „Gerücht – unbestätigt“ markiert und verlinkt auf ihre Quelle.

Die Seite ist komplett statisch: kein Framework, kein JavaScript im Browser, keine externen Fonts oder Skripte, keine Cookies, kein Tracking. Das Build-Skript nutzt nur die Node-Standardbibliothek, `npm install` ist nicht nötig.

## Bauen

```sh
node build.mjs
```

Dafür reicht Node 18 oder neuer (getestet mit Node 20). Das Skript liest alle Ausgaben in `data/` (täglich `JJJJ-MM-TT.json`, alte Wochenausgaben `JJJJ-wKW.json`), prüft sie, löscht `public/` komplett und baut den Ordner neu auf. Bei fehlerhaften Daten bricht es mit Exit-Code 1 und einer Meldung ab, die Datei und Problem nennt (siehe „Prüfungen beim Build“).

Zum Ansehen einfach `public/index.html` im Browser öffnen. Alle Links sind relativ, deshalb funktioniert die Seite auch über `file://`. Wer lieber einen lokalen Server nimmt: `python3 -m http.server -d public`.

## Ordnerstruktur

```
build.mjs                        Build-Skript (Quelle)
src/style.css                    einziges Stylesheet (Quelle, wird nach public/ kopiert)
src/impressum.html               Impressum (HTML-Fragment, Quelle)
src/datenschutz.html             Datenschutzerklärung (HTML-Fragment, Quelle)
data/
  2026-10-19.json                eine Datei pro Tagesausgabe (Quelle)
  2026-w42.json                  alte Wochenausgabe (Quelle)
public/                          fertige Seite, wird bei jedem Build gelöscht und neu erzeugt
  index.html                     aktuelle Ausgabe
  style.css                      Kopie von src/style.css
  ausgaben/<ausgabe>/index.html  eine Seite pro Ausgabe, z. B. ausgaben/2026-10-19/ oder ausgaben/2026-w42/
  archiv/index.html              Liste aller Ausgaben, neueste zuerst
  impressum/index.html           aus src/impressum.html
  datenschutz/index.html         aus src/datenschutz.html
```

Nur `public/` wird ausgeliefert. README, Build-Skript, `data/`, Logs, Prompts und Screenshots liegen außerhalb und landen nicht auf der Seite. Dateien in `public/` bitte nicht von Hand bearbeiten, beim nächsten Build ist der Ordner wieder weg. Impressum und Datenschutz stehen in `src/impressum.html` und `src/datenschutz.html`, Newsletter-Hinweis und Footer in `build.mjs`, das Layout in `src/style.css`.

## JSON-Schema einer Ausgabe

Der Normalfall ist eine Tagesausgabe. Dateiname: `data/JJJJ-MM-TT.json`, das Feld `issue` muss genau diesem Dateinamen ohne `.json` entsprechen und ein echtes Kalenderdatum sein.

```jsonc
{
  "issue": "2026-10-19",        // Pflicht. JJJJ-MM-TT = Dateiname ohne .json
  "number": 2,                  // laufende Nummer der Ausgabe (optional, wird als „Ausgabe 2“ angezeigt)
  "title": "…",                 // Pflicht. Überschrift der Ausgabe
  "published": "2026-10-19",    // JJJJ-MM-TT (optional, derzeit nicht angezeigt)
  "intro": "…",                 // Pflicht. kurzer Einleitungstext
  "items": [                    // Pflicht, mindestens ein Eintrag; Reihenfolge = Anzeige
    {
      "id": "gemini-4-argon",   // Pflicht, eindeutig pro Ausgabe; wird zum Anker (#gemini-4-argon)
      "headline": "…",          // Pflicht
      "status": "confirmed",    // Pflicht: "confirmed" (Bestätigt) oder "rumor" (Gerücht – unbestätigt)
      "summary": "…",           // Pflicht, 2–3 Sätze
      "take": "…",              // eigene Einschätzung; leer oder mit "[Platzhalter" beginnend
                                // wird ausgegraut/kursiv als Platzhalter angezeigt
      "source": {               // Pflicht
        "url": "https://x.com/…/status/…",  // muss mit http:// oder https:// beginnen
        "handle": "sundarpichai",           // ohne @
        "date": "2026-10-13",               // JJJJ-MM-TT
        "via": true                         // optional, nur zusammen mit "original":
                                            // der X-Post gibt die Originalquelle nur weiter
      },
      "more_sources": [         // optional, gleiche Form wie source (ohne via); erscheint als „Mehr: @a, @b“
        { "url": "…", "handle": "levie", "date": "2026-10-13" }
      ],
      "original": {             // optional: Primärquelle außerhalb von X, z. B. ein Blogpost
        "url": "https://www.anthropic.com/research/…",  // muss mit http:// oder https:// beginnen
        "label": "Anthropic-Blog"                       // Linktext
      }
    }
  ]
}
```

So wird die Quellenzeile daraus (das Datum kommt immer aus `source.date`):

- ohne `original`: „Quelle: @handle auf X, 13.10.2026“
- mit `original`, ohne `via` (der X-Post ist selbst offiziell, z. B. @AnthropicAI): „Quelle: @handle auf X, 13.10.2026 · Anthropic-Blog“
- mit `original` und `"via": true` (der X-Post ist aus zweiter Hand): „Quelle: Anthropic-Blog, 12.10.2026 · via @handle auf X“

Alle Texte werden beim Build HTML-escaped. HTML im JSON wird also als Text angezeigt, nicht interpretiert.

### Alte Wochenausgaben

Wochenausgaben wie `data/2026-w42.json` werden weiterhin unterstützt (URL `ausgaben/2026-w42/`). Dort hat `issue` das Format `JJJJ-wKW` (KW zweistellig, 01–53), und zusätzlich sind `week_start` und `week_end` Pflicht (JJJJ-MM-TT): erster und letzter Tag der Woche. Angezeigt werden Zeitraum und „KW 42“. Bei Tagesausgaben werden `week_start`/`week_end` nicht verwendet.

### Reihenfolge

Jede Ausgabe hat ein Sortierdatum: bei Tagesausgaben das Datum selbst, bei Wochenausgaben `week_end`. Sortiert wird neueste zuerst; bei gleichem Datum steht die Tagesausgabe vor der Wochenausgabe. Die neueste Ausgabe ist die Startseite, das Archiv und die Links „Ältere/Neuere Ausgabe“ folgen derselben Reihenfolge.

### Prüfungen beim Build

- Sicherungskopien nach den Mustern `*.v<Ziffern>*.json` und `*.before-*.json` (siehe `.gitignore`) werden mit einem Hinweis übersprungen.
- Jede andere `.json`-Datei in `data/`, deren Name weder `JJJJ-MM-TT.json` noch `JJJJ-wKW.json` ist, lässt den Build scheitern.
- Ebenso: ungültiges JSON, `issue` passt nicht zum Dateinamen, kein echtes Datum (z. B. `2026-02-30`), KW außerhalb von 01–53, doppelte Ausgaben, fehlende Pflichtfelder oder ungültige Einträge.

## Neue Ausgabe (tägliche Routine)

1. Neue Datei `data/JJJJ-MM-TT.json` nach obigem Schema anlegen (z. B. `data/2026-10-19.json`).
2. `node build.mjs` ausführen; der Build muss ohne Fehler durchlaufen. Optional `public/index.html` im Browser prüfen.
3. Die neue Datei committen und nach `main` pushen. `public/` gehört nicht ins Repo.

Der Server holt sich Pushes auf `main` automatisch innerhalb von etwa einer Minute und baut die Seite neu. Schlägt der Build fehl, bleibt die letzte funktionierende Version online. Die neue Ausgabe wird zur Startseite, Archiv und Vor/Zurück-Links werden neu erzeugt, bestehende Ausgaben bleiben unter ihrer URL erreichbar.

## Hosting

Die Seite läuft selbst gehostet auf einem eigenen Server bei der Hetzner Online GmbH (Gunzenhausen, Deutschland) in einem Kubernetes-Setup:

- ein git-sync-Container fragt regelmäßig den `main`-Branch des GitHub-Repos ab,
- ein Node-Container führt bei jedem neuen Commit `node build.mjs` aus,
- ein eigener nginx liefert `public/` aus.

Zusätzlich läuft der GitHub-Actions-Workflow „build“ bei jedem Push `node build.mjs` als Prüfung.

## Offen vor Veröffentlichung

- Impressum und Datenschutzerklärung ausfüllen (aktuell Platzhalter).
- „Meine Einschätzung“ pro Meldung schreiben.
- Newsletter-Anmeldung ist nur Attrappe (Feld und Button deaktiviert, kein Formular).
