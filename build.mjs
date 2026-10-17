#!/usr/bin/env node
// Baut die statische Seite "KI-Gerüchte der Woche" aus data/*.json nach public/.
// Keine Abhängigkeiten, nur Node-Standardbibliothek. Aufruf: node build.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = join(ROOT, "public");
const STYLE_SRC = join(ROOT, "src", "style.css");
const SITE_NAME = "KI-Gerüchte der Woche";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const STATUS_LABELS = {
  confirmed: "Bestätigt",
  rumor: "Gerücht – unbestätigt",
};

// ---------- Hilfsfunktionen ----------

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fail(file, msg) {
  throw new Error(`${file}: ${msg}`);
}

function parseDate(str, file, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str ?? "");
  if (!m) fail(file, `${field} muss im Format JJJJ-MM-TT sein, ist aber ${JSON.stringify(str)}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// 13.10.2026
function formatShortDate({ y, m, d }) {
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

// 12.–18. Oktober 2026 / 28. September – 4. Oktober 2026 / 29. Dezember 2025 – 4. Januar 2026
function formatRange(a, b) {
  if (a.y === b.y && a.m === b.m) return `${a.d}.–${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d}. ${MONTHS[a.m - 1]} – ${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}. ${MONTHS[a.m - 1]} ${a.y} – ${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
}

function checkUrl(url, file, where) {
  if (!/^https?:\/\/\S+$/.test(url ?? "")) fail(file, `${where}: ungültige URL ${JSON.stringify(url)}`);
}

function checkSource(src, file, where) {
  if (!src || typeof src !== "object") fail(file, `${where} fehlt`);
  checkUrl(src.url, file, where);
  if (!src.handle) fail(file, `${where}: handle fehlt`);
  if (src.via !== undefined && typeof src.via !== "boolean") fail(file, `${where}.via muss true oder false sein`);
  src._date = parseDate(src.date, file, `${where}.date`);
}

function checkOriginal(orig, file, where) {
  if (!orig || typeof orig !== "object") fail(file, `${where} muss ein Objekt sein`);
  checkUrl(orig.url, file, where);
  if (typeof orig.label !== "string" || !orig.label.trim()) fail(file, `${where}: label fehlt`);
}

// ---------- Daten laden ----------

function loadIssues() {
  // Nur Dateien der Form JJJJ-wKW.json sind Ausgaben; andere .json (z. B. Sicherungskopien) werden übersprungen.
  const all = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort();
  const files = all.filter((f) => /^\d{4}-w\d{2}\.json$/.test(f));
  for (const f of all) if (!files.includes(f)) console.warn(`Übersprungen (kein Ausgaben-Dateiname): data/${f}`);
  const issues = files.map((f) => {
    const issue = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));
    const m = /^(\d{4})-w(\d{2})$/.exec(issue.issue ?? "");
    if (!m) fail(f, `"issue" muss das Format JJJJ-wKW haben (z. B. 2026-w42)`);
    if (`${issue.issue}.json` !== f) fail(f, `Dateiname passt nicht zu "issue": ${issue.issue}`);
    for (const key of ["title", "intro"]) {
      if (typeof issue[key] !== "string" || !issue[key].trim()) fail(f, `"${key}" fehlt`);
    }
    issue._kw = Number(m[2]);
    issue._start = parseDate(issue.week_start, f, "week_start");
    issue._end = parseDate(issue.week_end, f, "week_end");
    if (issue.published) issue._published = parseDate(issue.published, f, "published");
    if (!Array.isArray(issue.items) || issue.items.length === 0) fail(f, `"items" ist leer`);
    const ids = new Set();
    issue.items.forEach((item, i) => {
      const where = `items[${i}]`;
      if (!item.id || ids.has(item.id)) fail(f, `${where}: id fehlt oder doppelt`);
      ids.add(item.id);
      if (!STATUS_LABELS[item.status]) fail(f, `${where}: status muss "confirmed" oder "rumor" sein`);
      for (const key of ["headline", "summary"]) {
        if (typeof item[key] !== "string" || !item[key].trim()) fail(f, `${where}: "${key}" fehlt`);
      }
      checkSource(item.source, f, `${where}.source`);
      (item.more_sources ?? []).forEach((s, j) => checkSource(s, f, `${where}.more_sources[${j}]`));
      if (item.original !== undefined) checkOriginal(item.original, f, `${where}.original`);
      if (item.source.via && !item.original) fail(f, `${where}.source.via braucht ein "original"`);
    });
    return issue;
  });
  // Neueste zuerst (Issue-IDs sind dank fester Breite lexikografisch sortierbar)
  return issues.sort((a, b) => (a.issue < b.issue ? 1 : -1));
}

// ---------- Templates ----------

function layout({ prefix, title, description, current, body }) {
  const nav = (key, href, label) =>
    `<a href="${prefix}${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${prefix}style.css">
</head>
<body>
<header class="site-header">
<p class="site-name"><a href="${prefix}index.html">${esc(SITE_NAME)}</a></p>
<nav aria-label="Hauptnavigation">
${nav("aktuell", "index.html", "Aktuell")}
${nav("archiv", "archiv/index.html", "Archiv")}
</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
<p><a href="${prefix}impressum/index.html">Impressum</a> · <a href="${prefix}datenschutz/index.html">Datenschutz</a> · <a href="${prefix}archiv/index.html">Archiv</a></p>
<p>Diese Seite verwendet keine Cookies und keine Tracker.</p>
</footer>
</body>
</html>
`;
}

function sourceLink(src) {
  return `<a href="${esc(src.url)}">@${esc(src.handle)} auf X</a>`;
}

// Ohne original:        Quelle: @handle auf X, Datum
// Mit original:         Quelle: @handle auf X, Datum · Original-Link
// Mit original + via:   Quelle: Original-Link, Datum · via @handle auf X
function sourceLine(item) {
  const src = item.source;
  const date = formatShortDate(src._date);
  if (!item.original) return `Quelle: ${sourceLink(src)}, ${date}`;
  const orig = `<a href="${esc(item.original.url)}">${esc(item.original.label)}</a>`;
  return src.via
    ? `Quelle: ${orig}, ${date} · via ${sourceLink(src)}`
    : `Quelle: ${sourceLink(src)}, ${date} · ${orig}`;
}

function renderItem(item) {
  const take = (item.take ?? "").trim();
  const isPlaceholder = !take || /^\[Platzhalter/i.test(take);
  const more = item.more_sources ?? [];
  const moreLine = more.length
    ? `\n<p class="more">Mehr: ${more
        .map((s) => `<a href="${esc(s.url)}">@${esc(s.handle)}</a>`)
        .join(", ")}</p>`
    : "";
  return `<article class="item status-${esc(item.status)}" id="${esc(item.id)}">
<p class="status">${STATUS_LABELS[item.status]}</p>
<h2>${esc(item.headline)}</h2>
<p>${esc(item.summary)}</p>
${isPlaceholder ? "" : `<p class="take"><strong>Meine Einschätzung:</strong> ${esc(take)}</p>\n`}<p class="source">${sourceLine(item)}</p>${moreLine}
</article>`;
}

const NEWSLETTER = `<section class="newsletter" aria-labelledby="newsletter-title">
<h2 id="newsletter-title">Newsletter kommt bald – Anmeldung funktioniert noch nicht</h2>
<p>Später kannst du dir jede Ausgabe per Mail schicken lassen. Bis dahin passiert hier nichts.</p>
<div class="newsletter-row">
<label for="newsletter-email">E-Mail-Adresse</label>
<input id="newsletter-email" type="email" placeholder="du@example.de" disabled>
<button type="button" disabled>Anmelden</button>
</div>
</section>`;

function renderIssue(issue, { prefix, newer, older, isFrontPage }) {
  const range = formatRange(issue._start, issue._end);
  const meta = [range, `KW ${issue._kw}`];
  if (issue.number) meta.push(`Ausgabe ${esc(issue.number)}`);

  const pager = [];
  if (older) pager.push(`<a href="${prefix}ausgaben/${esc(older.issue)}/index.html" rel="prev">Ältere Ausgabe: KW ${older._kw}</a>`);
  if (newer) pager.push(`<a href="${prefix}ausgaben/${esc(newer.issue)}/index.html" rel="next">Neuere Ausgabe: KW ${newer._kw}</a>`);
  const permalink = isFrontPage
    ? `<p class="permalink"><a href="${prefix}ausgaben/${esc(issue.issue)}/index.html">Dauerhafter Link zu dieser Ausgabe</a></p>\n`
    : "";

  const body = `<article class="issue">
<header class="issue-header">
<h1>${esc(issue.title)}</h1>
<p class="issue-meta">${meta.join(" · ")}</p>
</header>
<p class="intro">${esc(issue.intro)}</p>
<p class="note">Die Meldungen stammen aus öffentlichen Posts auf X. Gerüchte sind Gerüchte, nicht mehr. Jeder Eintrag verlinkt auf seine Quelle, damit du selbst nachlesen kannst.</p>
${issue.items.map(renderItem).join("\n")}
</article>
${permalink}${pager.length ? `<nav class="pager" aria-label="Weitere Ausgaben">\n${pager.join("\n")}\n</nav>\n` : ""}${NEWSLETTER}`;

  return layout({
    prefix,
    title: isFrontPage ? `${SITE_NAME} – ${issue.title}` : `${issue.title} – ${SITE_NAME}`,
    description: `KW ${issue._kw}, ${range}: ${issue.title.replace(/^KW \d+:\s*/, "")}. KI-Gerüchte, Leaks und News von X, jede Woche gesammelt.`,
    current: isFrontPage ? "aktuell" : null,
    body,
  });
}

function renderArchive(issues) {
  const prefix = "../";
  const list = issues
    .map(
      (i) => `<li>
<a href="${prefix}ausgaben/${esc(i.issue)}/index.html">${esc(i.title)}</a>
<span class="archive-date">${formatRange(i._start, i._end)} · KW ${i._kw}</span>
</li>`
    )
    .join("\n");
  return layout({
    prefix,
    title: `Archiv – ${SITE_NAME}`,
    description: `Alle Ausgaben von ${SITE_NAME}, neueste zuerst.`,
    current: "archiv",
    body: `<h1>Archiv</h1>
<p>Alle bisherigen Ausgaben, die neueste zuerst.</p>
<ul class="archive">
${list}
</ul>`,
  });
}

// Rechtstexte: HTML-Fragmente aus src/<name>.html (Inhalt von <main>, ohne Layout).
// Fehlt die Datei, wird eine Platzhalterseite erzeugt.
function renderLegal(name, title) {
  const file = join(ROOT, "src", `${name}.html`);
  if (!existsSync(file)) return renderPlaceholder(title);
  return layout({
    prefix: "../",
    title: `${title} – ${SITE_NAME}`,
    description: `${title} von ${SITE_NAME}.`,
    current: null,
    body: readFileSync(file, "utf8").trim(),
  });
}

function renderPlaceholder(title) {
  return layout({
    prefix: "../",
    title: `${title} – ${SITE_NAME}`,
    description: `${title} von ${SITE_NAME}.`,
    current: null,
    body: `<h1>${esc(title)}</h1>
<p class="placeholder">Platzhalter – wird vor Veröffentlichung ausgefüllt.</p>`,
  });
}

// ---------- Schreiben ----------

function write(relPath, html) {
  const full = join(OUT_DIR, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
  console.log(`  public/${relPath}`);
}

const issues = loadIssues();
if (issues.length === 0) throw new Error("Keine Ausgaben in data/ gefunden.");

// public/ wird komplett neu erzeugt, damit gelöschte JSON-Dateien keine Leichen hinterlassen.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log("Erzeuge:");
copyFileSync(STYLE_SRC, join(OUT_DIR, "style.css"));
console.log("  public/style.css");
write("index.html", renderIssue(issues[0], { prefix: "", newer: null, older: issues[1], isFrontPage: true }));
issues.forEach((issue, i) => {
  write(
    `ausgaben/${issue.issue}/index.html`,
    renderIssue(issue, { prefix: "../../", newer: issues[i - 1], older: issues[i + 1], isFrontPage: false })
  );
});
write("archiv/index.html", renderArchive(issues));
write("impressum/index.html", renderLegal("impressum", "Impressum"));
write("datenschutz/index.html", renderLegal("datenschutz", "Datenschutz"));
console.log(`Fertig: ${issues.length} Ausgabe(n), aktuell ${issues[0].issue}.`);
