#!/usr/bin/env node
// Baut die statische Seite "KI-Gerüchte" (tägliche Ausgaben) aus data/*.json nach public/.
// Keine Abhängigkeiten, nur Node-Standardbibliothek. Aufruf: node build.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = join(ROOT, "public");
const STYLE_SRC = join(ROOT, "src", "style.css");
const ANALYTICS_FILE = join(ROOT, "analytics.json");
const SITE_NAME = "KI-Gerüchte";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const DAILY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKLY_RE = /^(\d{4})-w(\d{2})$/;
// Sicherungskopien (siehe .gitignore), werden mit Hinweis übersprungen
const BACKUP_RE = /(\.v\d.*|\.before-.*)\.json$/;

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
  throw new Error(`data/${file}: ${msg}`);
}

function parseDate(str, file, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str ?? "");
  if (!m) fail(file, `${field} muss im Format JJJJ-MM-TT sein, ist aber ${JSON.stringify(str)}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isRealDate({ y, m, d }) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function dateKey({ y, m, d }) {
  return y * 10000 + m * 100 + d;
}

// 18. Oktober 2026
function formatDate({ y, m, d }) {
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

// Sonntag, 18. Oktober 2026
function formatLongDate(date) {
  const wd = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${formatDate(date)}`;
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

// ---------- Statistik (Umami) ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAINS_RE = /^[a-z0-9.-]+(\s*,\s*[a-z0-9.-]+)*$/i;

// Liest analytics.json; die Umgebungsvariable UMAMI_WEBSITE_ID überschreibt websiteId.
// Fehlt die Datei oder ist die ID leer, gibt es kein Skript (Rückgabe null).
function loadAnalytics() {
  const failA = (msg) => {
    throw new Error(`analytics.json: ${msg}`);
  };
  let umami = {};
  if (existsSync(ANALYTICS_FILE)) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(ANALYTICS_FILE, "utf8"));
    } catch (err) {
      failA(`ungültiges JSON (${err.message})`);
    }
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) failA("muss ein JSON-Objekt sein");
    if (cfg.umami !== undefined && (!cfg.umami || typeof cfg.umami !== "object" || Array.isArray(cfg.umami))) {
      failA(`"umami" muss ein Objekt sein`);
    }
    umami = cfg.umami ?? {};
  }
  const envId = (process.env.UMAMI_WEBSITE_ID ?? "").trim();
  const websiteId = envId || (typeof umami.websiteId === "string" ? umami.websiteId.trim() : umami.websiteId ?? "");
  if (websiteId === "") return null;
  if (typeof websiteId !== "string" || !UUID_RE.test(websiteId)) {
    const where = envId ? "Umgebungsvariable UMAMI_WEBSITE_ID" : "analytics.json: umami.websiteId";
    throw new Error(`${where} muss eine UUID sein (z. B. 01234567-89ab-cdef-0123-456789abcdef), ist aber ${JSON.stringify(websiteId)}`);
  }
  const { scriptUrl, domains } = umami;
  if (typeof scriptUrl !== "string" || !/^https:\/\/\S+$/.test(scriptUrl)) {
    failA(`umami.scriptUrl muss mit https:// beginnen, ist aber ${JSON.stringify(scriptUrl)}`);
  }
  if (typeof domains !== "string" || !DOMAINS_RE.test(domains.trim())) {
    failA(`umami.domains muss ein Hostname oder eine kommagetrennte Liste sein, ist aber ${JSON.stringify(domains)}`);
  }
  return { websiteId, scriptUrl, domains: domains.trim() };
}

function analyticsTag(a) {
  if (!a) return "";
  return `<script defer src="${esc(a.scriptUrl)}" data-website-id="${esc(a.websiteId)}" data-domains="${esc(a.domains)}" data-do-not-track="true"></script>\n`;
}

// ---------- Daten laden ----------

function loadIssues() {
  // Ausgaben heißen JJJJ-MM-TT.json (täglich) oder JJJJ-wKW.json (alte Wochenausgaben).
  // Sicherungskopien werden übersprungen, jeder andere .json-Name bricht den Build ab.
  const files = [];
  for (const f of readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort()) {
    if (BACKUP_RE.test(f)) {
      console.warn(`Übersprungen (Sicherungskopie): data/${f}`);
      continue;
    }
    const stem = f.slice(0, -".json".length);
    if (!DAILY_RE.test(stem) && !WEEKLY_RE.test(stem)) {
      fail(f, `ungültiger Dateiname, erwartet JJJJ-MM-TT.json (z. B. 2026-10-18.json) oder JJJJ-wKW.json`);
    }
    files.push(f);
  }
  const seen = new Set();
  const issues = files.map((f) => {
    let issue;
    try {
      issue = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));
    } catch (err) {
      fail(f, `ungültiges JSON (${err.message})`);
    }
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) fail(f, "muss ein JSON-Objekt sein");
    const stem = f.slice(0, -".json".length);
    if (issue.issue !== stem) fail(f, `"issue" (${JSON.stringify(issue.issue)}) passt nicht zum Dateinamen, erwartet "${stem}"`);
    if (seen.has(issue.issue)) fail(f, `Ausgabe ${issue.issue} ist doppelt`);
    seen.add(issue.issue);
    for (const key of ["title", "intro"]) {
      if (typeof issue[key] !== "string" || !issue[key].trim()) fail(f, `"${key}" fehlt`);
    }
    const weekly = WEEKLY_RE.exec(issue.issue);
    if (weekly) {
      issue._kind = "weekly";
      issue._kw = Number(weekly[2]);
      if (issue._kw < 1 || issue._kw > 53) fail(f, `Kalenderwoche muss zwischen 01 und 53 liegen, ist aber ${weekly[2]}`);
      issue._start = parseDate(issue.week_start, f, "week_start");
      issue._end = parseDate(issue.week_end, f, "week_end");
      issue._sort = issue._end;
    } else {
      issue._kind = "daily";
      issue._date = parseDate(issue.issue, f, "issue");
      if (!isRealDate(issue._date)) fail(f, `"issue" ist kein gültiges Kalenderdatum: ${issue.issue}`);
      issue._sort = issue._date;
    }
    if (issue.published) {
      issue._published = parseDate(issue.published, f, "published");
      if (issue._kind === "daily" && !isRealDate(issue._published)) fail(f, `"published" ist kein gültiges Kalenderdatum: ${issue.published}`);
    }
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
  // Neueste zuerst: Tagesausgaben nach Datum, Wochenausgaben nach week_end.
  // Bei gleichem Datum kommt die Tagesausgabe vor der Wochenausgabe.
  return issues.sort(
    (a, b) =>
      dateKey(b._sort) - dateKey(a._sort) ||
      (a._kind === b._kind ? 0 : a._kind === "daily" ? -1 : 1) ||
      (a.issue < b.issue ? 1 : -1)
  );
}

// Kurzlabel für Pager und Archiv: „17. Oktober 2026“ bzw. „KW 42“
function shortLabel(issue) {
  return issue._kind === "daily" ? formatDate(issue._date) : `KW ${issue._kw}`;
}

// Datumszeile: „Sonntag, 18. Oktober 2026“ bzw. „12.–18. Oktober 2026 · KW 42“
function dateLabel(issue) {
  return issue._kind === "daily"
    ? formatLongDate(issue._date)
    : `${formatRange(issue._start, issue._end)} · KW ${issue._kw}`;
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
${analyticsTag(analytics)}</head>
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
<p>${
    analytics
      ? "Diese Seite verwendet keine Cookies. Zugriffe werden mit einem selbst gehosteten Umami anonym gezählt."
      : "Diese Seite verwendet keine Cookies und keine Tracker."
  }</p>
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
  const meta = [dateLabel(issue)];
  if (issue.number) meta.push(`Ausgabe ${esc(issue.number)}`);

  const pager = [];
  if (older) pager.push(`<a href="${prefix}ausgaben/${esc(older.issue)}/index.html" rel="prev">Ältere Ausgabe: ${shortLabel(older)}</a>`);
  if (newer) pager.push(`<a href="${prefix}ausgaben/${esc(newer.issue)}/index.html" rel="next">Neuere Ausgabe: ${shortLabel(newer)}</a>`);
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
    description:
      issue._kind === "daily"
        ? `${formatDate(issue._date)}: ${issue.title}. KI-Gerüchte, Leaks und News von X, täglich gesammelt.`
        : `KW ${issue._kw}, ${formatRange(issue._start, issue._end)}: ${issue.title.replace(/^KW \d+:\s*/, "")}. KI-Gerüchte, Leaks und News von X, täglich gesammelt.`,
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
<span class="archive-date">${dateLabel(i)}</span>
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

let issues;
let analytics;
try {
  analytics = loadAnalytics();
  issues = loadIssues();
  if (issues.length === 0) throw new Error("Keine Ausgaben in data/ gefunden.");
} catch (err) {
  console.error(`Build abgebrochen: ${err.message}`);
  process.exit(1);
}
console.log(
  analytics
    ? `Statistik: Umami aktiv (Website-ID ${analytics.websiteId}, ${analytics.scriptUrl}).`
    : "Statistik: deaktiviert (keine Umami-Website-ID gesetzt)."
);

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
