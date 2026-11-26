/**
 * fetch-brand-logos.mjs  --  holt echte, offizielle Marken-Logos (1:1, farbig) lokal
 *
 * Aufruf:  node tools/fetch-brand-logos.mjs
 * Ausgabe: prototype/web/assets/brands/<slug>.<svg|png>  +  prototype/web/brandset.js
 *
 * Quellen (in dieser Reihenfolge pro Slug):
 *   1. offizielle Hersteller-Assets (Microsoft Fluent Brand Icons, GitHub-Raw, VS-Code-Branding)
 *   2. Wikimedia Commons / Wikipedia (Datei der Original-Logos, Special:FilePath bzw. imageinfo-API)
 * Keine Hotlinks im Code: die Dateien liegen lokal im Projekt.
 *
 * Abrufdatum aller Downloads: 2026-11-24
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'prototype', 'web', 'assets', 'brands');
const BRANDSET = path.join(ROOT, 'prototype', 'web', 'brandset.js');
const ABRUF = '2026-11-24';
const UA = 'NovoraBrandFetcher/1.0 (local desktop app; contact: novora@localhost)';

const FLUENT = 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg';

/** slug -> { label, icon: bevorzugt Icon-Marke ohne Schriftzug, cand: [urls], search: [Suchbegriffe], lizenz, quelle } */
const SOURCES = [
  { slug: 'spotify', label: 'Spotify', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Spotify_logo_without_text.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Spotify_logo_with_text.svg'],
    search: ['Spotify logo'], lizenz: 'Marke Spotify AB; Datei: Wikimedia Commons (PD-ineligible/Logo)', quelle: 'Wikimedia Commons' },
  { slug: 'youtube', label: 'YouTube', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/YouTube_social_red_squircle_(2017).svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/YouTube_Logo_2017.svg'],
    search: ['YouTube icon 2017', 'YouTube logo'], lizenz: 'Marke Google/YouTube; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'steam', label: 'Steam', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Steam_icon_logo.svg'],
    search: ['Steam icon logo'], lizenz: 'Marke Valve; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'twitch', label: 'Twitch', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Twitch_logo.svg'],
    search: ['Twitch logo'], lizenz: 'Marke Twitch Interactive; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'github', label: 'GitHub', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/GitHub_logo_2013.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Octicons-mark-github.svg'],
    search: ['GitHub mark'], lizenz: 'Marke GitHub/Microsoft; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'googlechrome', label: 'Google Chrome', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Google_Chrome_icon_(February_2022).svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Google_Chrome_icon_(2011).svg'],
    search: ['Google Chrome icon'], lizenz: 'Marke Google; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'firefox', label: 'Firefox', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Firefox_logo,_2019.svg'],
    search: ['Firefox logo 2019', 'Firefox logo'], lizenz: 'Marke Mozilla; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'windows', label: 'Windows', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Windows_logo_-_2021.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Windows_logo_-_2012.svg'],
    search: ['Windows logo 2021', 'Windows logo'], lizenz: 'Marke Microsoft; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'apple', label: 'Apple', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Apple_logo_black.svg'],
    search: ['Apple logo'], lizenz: 'Marke Apple Inc.; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'android', label: 'Android', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Android_new_logo_2019.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Android_robot_head.svg'],
    search: ['Android logo 2019', 'Android robot'], lizenz: 'Marke Google; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'slack', label: 'Slack', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Slack_icon_2019.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Slack_Technologies_Logo.svg'],
    search: ['Slack logo'], lizenz: 'Marke Salesforce/Slack; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'reddit', label: 'Reddit', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Reddit_logo.svg'],
    search: ['Reddit logo'], lizenz: 'Marke Reddit Inc.; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'whatsapp', label: 'WhatsApp', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/WhatsApp.svg'],
    search: ['WhatsApp logo'], lizenz: 'Marke Meta; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'telegram', label: 'Telegram', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Telegram_logo.svg'],
    search: ['Telegram logo'], lizenz: 'Marke Telegram FZ-LLC; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'instagram', label: 'Instagram', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Instagram_logo_2016.svg'],
    search: ['Instagram logo 2016', 'Instagram logo'], lizenz: 'Marke Meta; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'soundcloud', label: 'SoundCloud', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Soundcloud_logo.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/SoundCloud_logo.svg'],
    search: ['SoundCloud logo'], lizenz: 'Marke SoundCloud; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'wordpress', label: 'WordPress', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/WordPress_blue_logo.svg'],
    search: ['WordPress logo'], lizenz: 'Marke WordPress Foundation; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'dropbox', label: 'Dropbox', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Dropbox_logo_2017.svg'],
    search: ['Dropbox logo'], lizenz: 'Marke Dropbox Inc.; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'obsstudio', label: 'OBS Studio', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/OBS_Studio_Logo.svg'],
    search: ['OBS Studio logo'], lizenz: 'GPL-2.0 (Projekt-Logo, Marke OBS); Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'blender', label: 'Blender', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Blender_logo_no_text.svg'],
    search: ['Blender logo'], lizenz: 'Marke Blender Foundation; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'visualstudiocode', label: 'Visual Studio Code', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Visual_Studio_Code_1.35_icon.svg'],
    search: ['Visual Studio Code icon'], lizenz: 'MIT/Trademark Microsoft; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'microsoftteams', label: 'Microsoft Teams', icon: true,
    cand: [`${FLUENT}/teams_48x1.svg`,
           'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Teams_2018â€“present.svg'],
    search: ['Microsoft Teams logo'], lizenz: 'Marke Microsoft (offizielles Fluent Brand Icon)', quelle: 'Microsoft Fluent Brand Icons / Wikimedia Commons' },
  { slug: 'figma', label: 'Figma', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Figma-logo.svg'],
    search: ['Figma logo'], lizenz: 'Marke Figma Inc.; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'netflix', label: 'Netflix', icon: false,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Netflix_2015_logo.svg'],
    search: ['Netflix logo 2015', 'Netflix logo'], lizenz: 'Marke Netflix Inc.; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'zoom', label: 'Zoom', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Zoom_Communications_Logo.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Zoom_Logo_2022.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Zoom_logo.svg'],
    search: ['Zoom logo video', 'Zoom Communications logo'], lizenz: 'Marke Zoom Communications; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'epicgames', label: 'Epic Games', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Epic_Games_logo.svg'],
    search: ['Epic Games logo'], lizenz: 'Marke Epic Games; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'nodedotjs', label: 'Node.js', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Node.js_logo.svg'],
    search: ['Node.js logo'], lizenz: 'Marke OpenJS Foundation; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'microsoftword', label: 'Microsoft Word', icon: true,
    cand: [`${FLUENT}/word_48x1.svg`,
           'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Office_Word_(2019â€“present).svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Word_2013-2019_logo.svg'],
    search: ['Microsoft Word logo'], lizenz: 'Marke Microsoft (offizielles Fluent Brand Icon)', quelle: 'Microsoft Fluent Brand Icons / Wikimedia Commons' },
  { slug: 'microsoftexcel', label: 'Microsoft Excel', icon: true,
    cand: [`${FLUENT}/excel_48x1.svg`,
           'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Office_Excel_(2019â€“present).svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Excel_2013-2019_logo.svg'],
    search: ['Microsoft Excel logo'], lizenz: 'Marke Microsoft (offizielles Fluent Brand Icon)', quelle: 'Microsoft Fluent Brand Icons / Wikimedia Commons' },
  { slug: 'primevideo', label: 'Prime Video', icon: false,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/Amazon_Prime_Video_logo.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/Prime_Video_logo.svg'],
    search: ['Amazon Prime Video logo', 'Prime Video logo'], lizenz: 'Marke Amazon; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' },
  { slug: 'tiktok', label: 'TikTok', icon: true,
    cand: ['https://commons.wikimedia.org/wiki/Special:FilePath/TikTok_logo.svg',
           'https://commons.wikimedia.org/wiki/Special:FilePath/TikTok_Logo.svg'],
    search: ['TikTok logo'], lizenz: 'Marke ByteDance; Datei: Wikimedia Commons', quelle: 'Wikimedia Commons' }
];

const ALIASES = { 'youtube-play': 'youtube', chrome: 'googlechrome', git: 'github' };

/* ---------------------------------------------------------------- Hilfen */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;

/** GET mit Drosselung + Retry bei 429/5xx (Wikimedia drosselt sonst hart) */
async function get(url, bin = false, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const wait = 450 - (Date.now() - lastReq);
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': UA, accept: bin ? '*/*' : 'image/svg+xml,image/png,application/json;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
        signal: ctrl.signal
      });
      if (r.status === 429 || r.status === 503 || r.status === 500 || r.status === 403) {
        clearTimeout(t);
        if (attempt < tries) { await sleep(1500 * attempt * attempt); continue; }
        return { ok: false, status: r.status, error: `HTTP ${r.status}` };
      }
      if (!r.ok) { clearTimeout(t); return { ok: false, status: r.status, error: `HTTP ${r.status}` }; }
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (bin) { const buf = Buffer.from(await r.arrayBuffer()); clearTimeout(t); return { ok: true, status: r.status, ct, buf }; }
      const text = await r.text(); clearTimeout(t);
      return { ok: true, status: r.status, ct, text };
    } catch (e) {
      clearTimeout(t);
      if (attempt < tries) { await sleep(1200 * attempt); continue; }
      return { ok: false, status: 0, error: String(e && e.message || e) };
    }
  }
  return { ok: false, status: 0, error: 'kein Versuch' };
}

function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function isSvg(buf) {
  const head = buf.slice(0, 2048).toString('utf8').trim().toLowerCase();
  if (!(head.startsWith('<svg') || head.startsWith('<?xml'))) return false;
  return head.includes('<svg');
}

/** prÃ¼ft die heruntergeladenen Bytes, gibt {ok, ext, note} */
function validate(buf) {
  if (!buf || buf.length === 0) return { ok: false, note: 'leer' };
  if (isSvg(buf)) {
    if (buf.length < 1024) return { ok: false, note: `SVG zu klein (${buf.length} B)` };
    return { ok: true, ext: 'svg', note: `${buf.length} B` };
  }
  const png = pngSize(buf);
  if (png) {
    if (png.w < 256) return { ok: false, note: `PNG nur ${png.w}x${png.h}` };
    return { ok: true, ext: 'png', note: `${png.w}x${png.h}, ${buf.length} B` };
  }
  return { ok: false, note: 'keine SVG-/PNG-Signatur' };
}

/* ------------------------------------------- Wikimedia-Suche als Fallback */

async function commonsSearch(query) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&list=search&srnamespace=6&srlimit=15&srsearch=' + encodeURIComponent(query);
  const r = await get(api);
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.text);
    return (j.query && j.query.search || []).map((x) => x.title.replace(/^File:/i, ''));
  } catch { return []; }
}

async function commonsUrl(title) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1024&titles=' + encodeURIComponent('File:' + title);
  const r = await get(api);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.text);
    const p = (j.query && j.query.pages || [])[0];
    if (!p || !p.imageinfo || !p.imageinfo[0]) return null;
    const ii = p.imageinfo[0];
    if (ii.mime === 'image/svg+xml') return { url: ii.url, title };
    if (ii.mime && ii.mime.startsWith('image/') && !/svg/i.test(ii.mime)) {
      return { url: ii.thumburl || ii.url, title, mime: ii.mime };
    }
    return null;
  } catch { return null; }
}

function scoreTitle(title, src) {
  const t = title.toLowerCase();
  let s = 0;
  if (t.endsWith('.svg')) s += 5;
  else if (!/\.(png|jpg|jpeg|webp)$/.test(t)) s -= 10; // pdf/gif usw. raus
  if (/logo|icon|mark/.test(t)) s += 4;
  const stem = src.slug.replace(/^(microsoft|google)/, '');
  const re = new RegExp(stem.slice(0, 6).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (re.test(src.label)) { /* nur Info */ }
  if (t.includes(src.label.toLowerCase().split(' ')[0])) s += 3;
  if (src.icon && /(without|no)[ _-]?text|icon|symbol|mark/.test(t)) s += 3;
  if (/(with|incl)[ _-]?text|wordmark/.test(t)) s -= src.icon ? 4 : 0;
  if (/old|former|alternate|alt[ _-]|legacy|199\d|200\d|201[0-4]/.test(t)) s -= 6;
  if (/wikidata|commons-|symbol support|favicon/.test(t)) s -= 5;
  return s;
}

/* ------------------------------------------------------------------ Lauf */

async function resolveOne(src, log) {
  const tried = [];
  const seen = new Set();

  const tryUrl = async (url, why) => {
    if (seen.has(url)) return null;
    seen.add(url);
    const r = await get(url, true);
    if (!r.ok) { tried.push(`${why}: ${r.error}`); return null; }
    const buf = r.buf;
    // Wikimedia liefert bei fehlender Datei eine HTML-Fehlerseite mit 200er? -> validate fÃ¤ngt es
    const v = validate(buf);
    if (!v.ok) { tried.push(`${why}: ${v.note}`); return null; }
    return { url, buf, ext: v.ext, note: v.note, why };
  };

  // 1. kuratierte offizielle / Wikimedia-Dateien
  for (const url of src.cand || []) {
    const hit = await tryUrl(url, 'cand');
    if (hit) return { ...hit, tried };
  }

  // 2. Wikimedia-Suche
  const cands = [];
  for (const q of src.search || []) {
    const titles = await commonsSearch(q);
    for (const t of titles) cands.push(t);
  }
  const ranked = [...new Set(cands)]
    .map((t) => ({ t, s: scoreTitle(t, src) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  for (const { t } of ranked) {
    const info = await commonsUrl(t);
    if (!info) { tried.push(`commons:${t}: keine Bild-URL`); continue; }
    const hit = await tryUrl(info.url, `commons:${t}`);
    if (hit) return { ...hit, tried, title: t };
  }

  return { failed: true, tried };
}

function extOfUrl(u) { return /\.png$/i.test(new URL(u).pathname) ? 'png' : 'svg'; }

async function main() {
  await mkdir(OUT, { recursive: true });
  const map = {};
  const report = [];
  const failed = [];

  for (const src of SOURCES) {
    const res = await resolveOne(src);
    if (res.failed) {
      failed.push(src.slug);
      report.push(`FAIL  ${src.slug.padEnd(18)} ${res.tried.slice(0, 3).join(' | ')}`);
      continue;
    }
    const ext = res.ext || extOfUrl(res.url);
    const file = `${src.slug}.${ext}`;
    await writeFile(path.join(OUT, file), res.buf);
    map[src.slug] = `/assets/brands/${file}`;
    report.push(`OK    ${src.slug.padEnd(18)} ${file.padEnd(28)} ${res.note.padEnd(22)} ${res.why}`);
  }

  for (const [alias, target] of Object.entries(ALIASES)) {
    if (map[target]) map[alias] = map[target];
  }

  const lines = [
    '/* Novora Marken-Logos (lokal, echte Hersteller-Logos)',
    ` * Erzeugt von tools/fetch-brand-logos.mjs, Abruf ${ABRUF}.`,
    ' * Werte = Pfade relativ zum Web-Root: "<img src=..." nutzen (NICHT als Inline-SVG-Fragment).',
    ' * Quelle/Lizenz je Datei: prototype/web/assets/brands/README.md',
    ' */',
    'window.NOVORA_BRANDS = ' + JSON.stringify(map, null, 2) + ';',
    ''
  ];
  await writeFile(BRANDSET, lines.join('\n'), 'utf8');

  const readme = [
    '# Marken-Logos (lokal)',
    '',
    `Abruf: ${ABRUF} durch \`tools/fetch-brand-logos.mjs\`.`,
    'Alle Dateien sind die Original-Logos der Hersteller (SVG bevorzugt, sonst PNG >= 256 px).',
    'Nutzung nur als Anzeige-Marke in der UI; Markenrechte liegen bei den jeweiligen Inhabern.',
    '',
    '| Datei | Marke | Quelle | Lizenz/Hinweis |',
    '| --- | --- | --- | --- |'
  ];
  for (const src of SOURCES) {
    const p = map[src.slug];
    if (!p) continue;
    readme.push(`| \`${p.replace('/assets/brands/', '')}\` | ${src.label} | ${src.quelle} | ${src.lizenz} |`);
  }
  if (failed.length) readme.push('', `Nicht beschafft: ${failed.join(', ')}`);
  await writeFile(path.join(OUT, 'README.md'), readme.join('\n') + '\n', 'utf8');

  const srcDoc = [
    '# Quellenprotokoll (tools/fetch-brand-logos.mjs)',
    '',
    `Abrufdatum: ${ABRUF}`,
    ''
  ];
  for (const src of SOURCES) {
    srcDoc.push(`## ${src.slug} (${src.label})`);
    srcDoc.push(`- Quelle: ${src.quelle}`);
    srcDoc.push(`- Lizenz: ${src.lizenz}`);
    for (const c of src.cand) srcDoc.push(`- Kandidat: ${c}`);
    for (const s of src.search || []) srcDoc.push(`- Wikimedia-Suche: ${s}`);
    srcDoc.push('');
  }
  await writeFile(path.join(OUT, 'SOURCES.md'), srcDoc.join('\n'), 'utf8');

  console.log(report.join('\n'));
  console.log(`\n${Object.keys(map).length} Keys (${SOURCES.length} kanonisch + ${Object.keys(ALIASES).length} Alias)`);
  if (failed.length) console.log('FEHLT: ' + failed.join(', '));
}

main().catch((e) => { console.error('ABBRUCH:', e); process.exit(1); });
