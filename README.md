# KI-Gerüchte der Woche

Ein wöchentlicher deutscher Überblick über KI-Gerüchte, Leaks und News, die auf X auftauchen. Jede Meldung ist als „Bestätigt“ oder „Gerücht – unbestätigt“ markiert und verlinkt auf ihre Quelle.

Die Seite ist komplett statisch: kein Framework, kein JavaScript im Browser, keine externen Fonts oder Skripte, keine Cookies, kein Tracking. Das Build-Skript nutzt nur die Node-Standardbibliothek, `npm install` ist nicht nötig.

## Bauen

```sh
node build.mjs
```

Dafür reicht Node 18 oder neuer (getestet mit Node 20). Das Skript liest alle `data/JJJJ-wKW.json`, prüft sie, löscht `public/` komplett und baut den Ordner neu auf. Andere `.json`-Dateien in `data/` (z. B. Sicherungskopien) werden mit einem Hinweis übersprungen. Bei fehlerhaften Daten bricht es mit einer Meldung ab, die Datei und Feld nennt.

Zum Ansehen einfach `public/index.html` im Browser öffnen. Alle Links sind relativ, deshalb funktioniert die Seite auch über `file://`. Wer lieber einen lokalen Server nimmt: `python3 -m http.server -d public`.

## Ordnerstruktur

```
build.mjs                        Build-Skript (Quelle)
src/style.css                    einziges Stylesheet (Quelle, wird nach public/ kopiert)
data/
  2026-w42.json                  eine Datei pro Ausgabe (Quelle)
public/                          fertige Seite, wird bei jedem Build gelöscht und neu erzeugt
  index.html                     aktuelle Ausgabe
  style.css                      Kopie von src/style.css
  ausgaben/<ausgabe>/index.html  eine Seite pro Ausgabe, z. B. ausgaben/2026-w42/
  archiv/index.html              Liste aller Ausgaben, neueste zuerst
  impressum/index.html           Platzhalter
  datenschutz/index.html         Platzhalter
```

Nur `public/` wird ausgeliefert. README, Build-Skript, `data/`, Logs, Prompts und Screenshots liegen außerhalb und landen nicht auf der Seite. Dateien in `public/` bitte nicht von Hand bearbeiten, beim nächsten Build ist der Ordner wieder weg. Texte für Impressum, Datenschutz, Newsletter-Hinweis und Footer stehen in `build.mjs`, das Layout in `src/style.css`.

## JSON-Schema einer Ausgabe

Dateiname: `data/<issue>.json`, wobei `<issue>` genau dem Feld `issue` entsprechen muss.

```jsonc
{
  "issue": "2026-w42",          // Pflicht. Format JJJJ-wKW, KW immer zweistellig (2026-w07)
  "number": 1,                  // laufende Nummer der Ausgabe (optional, wird als „Ausgabe 1“ angezeigt)
  "title": "KW 42: …",          // Pflicht. Überschrift der Ausgabe
  "week_start": "2026-10-12",   // Pflicht. JJJJ-MM-TT
  "week_end": "2026-10-18",     // Pflicht. JJJJ-MM-TT
  "published": "2026-10-18",    // JJJJ-MM-TT (optional, derzeit nicht angezeigt)
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

## Neue Ausgabe (wöchentliche Routine)

1. Neue Datei `data/JJJJ-wKW.json` nach obigem Schema anlegen (z. B. `data/2026-w43.json`).
2. `node build.mjs` ausführen.
3. `public/index.html` im Browser prüfen.
4. Die neue Datei in `data/` committen. `public/` muss nicht ins Repo, Cloudflare Pages baut die Seite selbst (siehe unten).

Die Ausgabe mit der höchsten `issue`-ID wird automatisch zur Startseite, das Archiv und die Vor/Zurück-Links zwischen den Ausgaben werden neu erzeugt. Bestehende Ausgaben bleiben unverändert erreichbar.

## Cloudflare Pages

- Framework preset: **None**
- Build command: `node build.mjs`
- Build output directory: `public`

Cloudflare führt das Skript bei jedem Push aus und veröffentlicht nur den Inhalt von `public/`.

## Offen vor Veröffentlichung

- Impressum und Datenschutzerklärung ausfüllen (aktuell Platzhalter).
- „Meine Einschätzung“ pro Meldung schreiben.
- Newsletter-Anmeldung ist nur Attrappe (Feld und Button deaktiviert, kein Formular).
