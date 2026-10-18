# KI-Gerüchte

Ein täglicher deutscher Überblick über KI-Gerüchte, Leaks und News, die auf X auftauchen. Jede Meldung ist als „Bestätigt“ oder „Gerücht – unbestätigt“ markiert und verlinkt auf ihre Quelle.

Die Seite ist komplett statisch: kein Framework, kein eigenes JavaScript, keine externen Fonts, keine Cookies. Einzige Ausnahme ist optional das Zählskript eines selbst gehosteten Umami von `stats.dotschranz.net` (cookielos, respektiert „Do Not Track“, siehe „Statistik (Umami)“). Ist keine Website-ID eingetragen, enthält die Seite gar kein Skript. Das Build-Skript nutzt nur die Node-Standardbibliothek, `npm install` ist nicht nötig.

## Bauen

```sh
node build.mjs
```

Dafür reicht Node 18 oder neuer (getestet mit Node 20). Das Skript liest alle Ausgaben in `data/` (täglich `JJJJ-MM-TT.json`, alte Wochenausgaben `JJJJ-wKW.json`), prüft sie, löscht `public/` komplett und baut den Ordner neu auf. Bei fehlerhaften Daten bricht es mit Exit-Code 1 und einer Meldung ab, die Datei und Problem nennt (siehe „Prüfungen beim Build“).

Zum Ansehen einfach `public/index.html` im Browser öffnen. Alle Links sind relativ, deshalb funktioniert die Seite auch über `file://`. Wer lieber einen lokalen Server nimmt: `python3 -m http.server -d public`.

## Ordnerstruktur

```
build.mjs                        Build-Skript (Quelle)
analytics.json                   Umami-Einstellungen (Website-ID, Skript-URL, Domain)
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

## Statistik (Umami)

Besucherzahlen zählt optional ein selbst gehostetes [Umami](https://umami.is) unter https://stats.dotschranz.net. Umami setzt keine Cookies; das Skript wird mit `data-do-not-track="true"` eingebunden und zählt Browser mit aktiviertem „Do Not Track“ nicht mit.

Einrichten:

1. Die Website in Umami muss niemand von Hand anlegen. Das übernimmt das HKube-Chart `charts/umami`: Es legt jede Website aus der Liste `websites` in seiner `values.yaml` per PostSync-Hook bei jedem ArgoCD-Sync an, und zwar mit fester ID. Im Umami-Dashboard ist nichts zu klicken.
2. In `analytics.json` steht bereits die feste Website-ID `1bfd182c-b7a4-4859-aa40-6846e0ee7b6f`. Sie entspricht dem Eintrag unter `websites` in `charts/umami/values.yaml` im HKube-Repo:

   ```json
   {
     "umami": {
       "websiteId": "1bfd182c-b7a4-4859-aa40-6846e0ee7b6f",
       "scriptUrl": "https://stats.dotschranz.net/script.js",
       "domains": "ki-geruechte.dotschranz.net"
     }
   }
   ```

   Die ID ist öffentlich (sie steht im Quelltext jeder Seite) und kein Geheimnis. Sie sollte nicht geändert werden. Falls doch, müssen `analytics.json` und die HKube-Values gemeinsam angepasst werden, sonst laufen die Zugriffe ins Leere. Eine leere `websiteId` schaltet das Skript ab.
3. Änderungen an `analytics.json` committen und nach `main` pushen. git-sync holt sie, und der Build im Cluster bindet das Skript automatisch in jede Seite ein.

Details:

- Leere `websiteId` (oder fehlende `analytics.json`) = kein Skript, der Build meldet „Statistik: deaktiviert“.
- Die Umgebungsvariable `UMAMI_WEBSITE_ID` überschreibt `websiteId`, wenn sie gesetzt und nicht leer ist (z. B. `UMAMI_WEBSITE_ID=… node build.mjs`).
- Der Build bricht ab, wenn die ID keine UUID ist, `scriptUrl` nicht mit `https://` beginnt oder `domains` kein Hostname bzw. keine kommagetrennte Liste von Hostnamen ist.
- `domains` sorgt dafür, dass nur Aufrufe auf dieser Domain gezählt werden (lokal über `file://` oder `localhost` also nicht).
- Ist Umami aktiv, ändert sich der Footer-Hinweis von „keine Cookies und keine Tracker“ zu „keine Cookies, Zugriffe werden mit Umami anonym gezählt“.
- Die Content-Security-Policy im HKube-Chart muss `https://stats.dotschranz.net` bei `script-src` (Skript laden) und `connect-src` (Zugriffe senden) erlauben, sonst blockiert der Browser das Zählen.

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
