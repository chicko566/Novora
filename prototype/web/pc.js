'use strict';

/* ============ Helpers ============ */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function hexA(hex, a) {
  const h = String(hex || '#22D3EE').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r || 34},${g || 211},${b || 238},${a})`;
}

/* ============ Logos (identisch zur App) ============ */
const ALIAS = {
  "mic": "mic",
  "volume": "volume",
  "play": "play",
  "prev": "prev",
  "next": "next",
  "mute": "volume-mute",
  "rec": "record",
  "browser": "browser",
  "tool": "tool",
  "timer": "calendar",
  "menu": "grid",
  "monitor": "monitor",
  "music": "music",
  "grid": "grid",
  "keyboard": "keyboard",
  "lock": "lock",
  "chat": "chat",
  "camera": "camera",
  "folder": "folder",
  "power": "power",
  "gamepad": "gamepad",
  "search": "search",
  "home": "grid",
  "link": "link",
  "spotify": "music",
  "discord": "voice-chat",
  "chrome": "browser",
  "steam": "games",
  "obs": "stream",
  "blender": "image",
  "vscode": "code",
  "teams": "video-call",
  "figma": "image",
  "youtube": "video",
  "twitch": "stream",
  "netflix": "video",
  "game": "games",
  "system": "settings"
};

// Eigene Glyphen aus /iconset.js; alte Keys bleiben als Alias gültig.
const LOGOS = {};
for (const [key, d] of Object.entries(window.NOVORA_ICONS || {})) {
  LOGOS['nv-' + key] = { kind: 'system', label: d.label, svg: d.svg, cat: d.cat };
}
for (const [old, neu] of Object.entries(ALIAS)) {
  if (LOGOS['nv-' + neu]) LOGOS[old] = LOGOS['nv-' + neu];
}
LOGOS.tool = LOGOS.tool || LOGOS['nv-tool'];
LOGOS.system = LOGOS.system || LOGOS['nv-settings'];
LOGOS.home = LOGOS.home || LOGOS['nv-grid'];


function normalizeLogo(k) {
  if (!k) return k;
  if (k === 'letter' || String(k).startsWith('nv-')) return k;
  const t = ALIAS[k];
  return t ? 'nv-' + t : 'nv-app';
}

const FEATURED = [
  'nv-mic', 'nv-volume', 'nv-play', 'nv-prev', 'nv-next', 'nv-volume-mute', 'nv-record',
  'nv-browser', 'nv-tool', 'nv-calendar', 'nv-grid', 'nv-monitor', 'nv-music', 'nv-keyboard',
  'nv-lock', 'nv-power', 'nv-camera', 'nv-folder', 'nv-search', 'nv-link', 'nv-chat', 'nv-gamepad',
  'nv-terminal', 'nv-settings', 'nv-equalizer', 'nv-mixer', 'nv-files', 'nv-stream', 'nv-video',
  'nv-image', 'nv-screenshot', 'nv-code'
];

const WEB_LINKS = [
  { key: 'nv-video', label: 'YouTube', url: 'https://www.youtube.com', slug: 'youtube' },
  { key: 'nv-stream', label: 'Twitch', url: 'https://www.twitch.tv', slug: 'twitch' },
  { key: 'nv-video', label: 'Netflix', url: 'https://www.netflix.com', slug: 'netflix' },
  { key: 'nv-video', label: 'Prime Video', url: 'https://www.primevideo.com', slug: 'primevideo' },
  { key: 'nv-music', label: 'Spotify Web', url: 'https://open.spotify.com', slug: 'spotify' },
  { key: 'nv-music', label: 'SoundCloud', url: 'https://soundcloud.com', slug: 'soundcloud' },
  { key: 'nv-voice-chat', label: 'Discord', url: 'https://discord.com/app', slug: 'discord' },
  { key: 'nv-chat', label: 'WhatsApp Web', url: 'https://web.whatsapp.com', slug: 'whatsapp' },
  { key: 'nv-chat', label: 'Telegram Web', url: 'https://web.telegram.org', slug: 'telegram' },
  { key: 'nv-chat', label: 'Reddit', url: 'https://www.reddit.com', slug: 'reddit' },
  { key: 'nv-chat', label: 'TikTok', url: 'https://www.tiktok.com', slug: 'tiktok' },
  { key: 'nv-chat', label: 'Instagram', url: 'https://www.instagram.com', slug: 'instagram' },
  { key: 'nv-code', label: 'GitHub', url: 'https://github.com', slug: 'github' },
  { key: 'nv-browser', label: 'Google', url: 'https://www.google.com', slug: 'googlechrome' },
  { key: 'nv-games', label: 'Steam', url: 'https://store.steampowered.com', slug: 'steam' }
];

/* Software-Katalog: Marken werden lokal aus installierten EXEs extrahiert
   (novora-icons.exe/appicons.mjs); bis dahin eigene Icons als Fallback. */

/* Marke aus Kachel ableiten: alte Kacheln tragen nur ein generisches Icon
   (nv-*), die Marke steckt im Namen oder im Ziel (spotify:, obs64.exe ...).
   Keine Datenmigration, Ableitung zur Laufzeit. */
const BRAND_BY_NAME = [
  ['prime video', 'primevideo'], ['primevideo', 'primevideo'],
  ['visual studio code', 'visualstudiocode'], ['vs code', 'visualstudiocode'],
  ['vscode', 'visualstudiocode'], ['code.exe', 'visualstudiocode'],
  ['microsoft teams', 'microsoftteams'], ['ms-teams', 'microsoftteams'], ['teams', 'microsoftteams'],
  ['microsoft word', 'microsoftword'], ['winword', 'microsoftword'], ['word', 'microsoftword'],
  ['microsoft excel', 'microsoftexcel'], ['excel', 'microsoftexcel'],
  ['google chrome', 'googlechrome'], ['googlechrome', 'googlechrome'], ['chrome', 'googlechrome'],
  ['obs studio', 'obsstudio'], ['obs64', 'obsstudio'], ['obs.exe', 'obsstudio'], ['obs', 'obsstudio'],
  ['epic games', 'epicgames'], ['epicgames', 'epicgames'],
  ['node.js', 'nodedotjs'], ['node.exe', 'nodedotjs'], ['node', 'nodedotjs'],
  ['steam', 'steam'],
  ['youtube', 'youtube'], ['youtu.be', 'youtube'],
  ['spotify', 'spotify'], ['discord', 'discord'], ['netflix', 'netflix'], ['twitch', 'twitch'],
  ['soundcloud', 'soundcloud'], ['whatsapp', 'whatsapp'], ['telegram', 'telegram'],
  ['instagram', 'instagram'], ['tiktok', 'tiktok'], ['github', 'github'],
  ['firefox', 'firefox'], ['wordpress', 'wordpress'], ['dropbox', 'dropbox'],
  ['zoom', 'zoom'], ['slack', 'slack'], ['figma', 'figma'], ['blender', 'blender']
];
const BRAND_NAME_RE = BRAND_BY_NAME.map(([name, slug]) => [
  new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), slug
]);
/* Nur ergaenzen: explizite Marke/Bild gewinnt, Monogramm und Fremd-Icons bleiben. */
function brandForTile(tile) {
  if (!tile || tile.brand || tile.img) return '';
  const logo = String(tile.logo || '');
  if (logo && !logo.startsWith('nv-')) return '';
  const target = String((tile.action && tile.action.target) || '');
  const hay = [String(tile.label || ''), target, logo].join(' ').trim();
  if (!hay) return '';
  for (const [re, slug] of BRAND_NAME_RE) if (re.test(hay)) return slug;
  return '';
}

/* Lokale Marken-Bilddateien: window.NOVORA_BRANDS bildet slug -> URL-Pfad ab.
   Es wird kein Markenpaket mehr mitgeliefert; Pfade kommen aus dem lokalen
   Icon-Cache der EXE-Extraktion. */
function brandPath(slug) {
  const set = window.NOVORA_BRANDS || {};
  const v = set[slug];
  if (typeof v !== 'string' || !v) return '';
  if (/[<>"'\s]/.test(v)) return '';            // keine Markup-/Whitespace-Werte
  return /\.(?:svg|png|webp|avif)(?:[?#].*)?$/i.test(v) ? v : '';
}
/* Marke als echtes Bild (lokal); fehlt die Datei, bleibt das eigene Symbol. */
function brandMarkup(slug, cls, extra) {
  const path = brandPath(slug);
  if (!path) return svgFallback('nv-app');
  const fb = svgFallback('nv-app');
  const attr = `${cls ? ` class="${esc(cls)}"` : ''}${extra ? ' ' + extra : ''}`;
  const rest = `alt="" loading="lazy" decoding="async" draggable="false" data-fb="${esc(fb)}" ` +
    `onerror="this.onerror=null;this.outerHTML=this.dataset.fb||'';"`;
  return `<img${attr} src="${esc(path)}" ${rest}>`;
}

/* Favicon über Google S2 – Host ohne Protokoll, ohne www */
function siteHost(url) {
  const raw = String(url || '').trim();
  let host = '';
  try { host = new URL(raw).hostname; } catch { host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]; }
  return String(host || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
}

function siteFavicon(url) {
  // Bewusst kein Fremd-Dienst (Google S2): keine Marken-Favicons laden.
  return '';
}

/* Nur http(s)-Ziele, fehlendes Schema wird ergänzt */
function normalizeSiteUrl(raw) {
  let v = String(raw || '').trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}

const PRESET_LABEL = {
  shutdown: 'Herunterfahren', restart: 'Neustart', logoff: 'Abmelden',
  sleep: 'Energiesparen', hibernate: 'Ruhezustand', lock: 'Sperren', screenoff: 'Bildschirm aus'
};
const PRESET_HARD = ['shutdown', 'restart', 'logoff'];

const COLORS = [
  { v: '', n: 'Neutral' }, { v: '#22D3EE', n: 'Cyan' }, { v: '#A78BFA', n: 'Violett' },
  { v: '#4ADE80', n: 'Grün' }, { v: '#FBBF24', n: 'Amber' }, { v: '#F87171', n: 'Rot' },
  { v: '#60A5FA', n: 'Blau' }, { v: '#F472B6', n: 'Pink' }
];

const PAL = {
  graphite: { name: 'Graphit', accent: '#22D3EE', swatch: '#0A0D12' },
  violet: { name: 'Violett', accent: '#A78BFA', swatch: '#0C0A14' },
  sage: { name: 'Salbei', accent: '#4ADE80', swatch: '#0D1210' }
};
const ACCENTS = ['#22D3EE', '#A78BFA', '#4ADE80', '#FBBF24', '#F87171', '#60A5FA', '#F472B6'];

/* ============ Vorlagen für neue Seiten ============ */
/* Tiles: logo muss in LOGOS existieren, Marken-Logos je Vorlage nur einmal.
   folderPage legt beim Anlegen automatisch eine leere Ordnerseite an. */
const PAGE_TPL = [
  {
    id: 'medien', name: 'Medien', rows: 3,
    desc: 'Wiedergabe, Lautstärke und die wichtigsten Streaming-Dienste.',
    tiles: [
      { logo: 'play', label: 'Play', action: { type: 'media', key: 'playpause' } },
      { logo: 'prev', label: 'Zurück', action: { type: 'media', key: 'prev' } },
      { logo: 'next', label: 'Weiter', action: { type: 'media', key: 'next' } },
      { logo: 'volume', label: 'Lauter', action: { type: 'volume', dir: 'up' }, state: 'volume' },
      { logo: 'volume', label: 'Leiser', action: { type: 'volume', dir: 'down' } },
      { logo: 'mute', label: 'Stumm', action: { type: 'volume', dir: 'mute' } },
      { logo: 'spotify', action: { type: 'open', target: 'spotify:' } },
      { logo: 'youtube', action: { type: 'open', target: 'https://www.youtube.com' } },
      { logo: 'netflix', action: { type: 'open', target: 'https://www.netflix.com' } },
      { logo: 'folder', label: 'Musik', folderPage: 'Musik' }
    ]
  },
  {
    id: 'stream', name: 'Streaming', rows: 3,
    desc: 'Mikrofon, Aufnahme, OBS-Steuerung und Chat für Live-Sessions.',
    tiles: [
      { logo: 'mic', label: 'Mikrofon', action: { type: 'mic' }, state: 'mic' },
      { logo: 'rec', label: 'Aufnahme', action: { type: 'record' }, state: 'recording' },
      { logo: 'obs', label: 'OBS', action: { type: 'open', target: 'obs64.exe' } },
      { logo: 'nv-grid', label: 'Szene', action: { type: 'hotkey', keys: 'Ctrl+F1' } },
      { logo: 'camera', label: 'Kamera', action: { type: 'open', target: 'microsoft.windows.camera:' } },
      { logo: 'monitor', label: 'Bildschirm', action: { type: 'hotkey', keys: 'Win+Shift+S' } },
      { logo: 'discord', action: { type: 'open', target: 'discord:' } },
      { logo: 'chat', label: 'Chat', action: { type: 'open', target: 'https://discord.com/channels/@me' } },
      { logo: 'volume', label: 'Lautstärke', action: { type: 'volume', dir: 'up' }, state: 'volume' }
    ]
  },
  {
    id: 'musik', name: 'Musik', rows: 3,
    desc: 'Spotify-Steuerung mit Sammlungen und eigenen Ordner-Seiten.',
    tiles: [
      { logo: 'spotify', action: { type: 'open', target: 'spotify:' } },
      { logo: 'play', label: 'Play', action: { type: 'media', key: 'playpause' } },
      { logo: 'nv-music', label: 'Playlist', action: { type: 'open', target: 'spotify:playlist' } },
      { logo: 'prev', label: 'Zurück', action: { type: 'media', key: 'prev' } },
      { logo: 'next', label: 'Weiter', action: { type: 'media', key: 'next' } },
      { logo: 'volume', label: 'Lautstärke', action: { type: 'volume', dir: 'up' }, state: 'volume' },
      { logo: 'folder', label: 'Alben', folderPage: 'Alben' },
      { logo: 'folder', label: 'Playlists', folderPage: 'Playlists' }
    ]
  },
  {
    id: 'tools', name: 'Tools', rows: 3,
    desc: 'Systemwerkzeuge, Befehle und Hotkeys für Windows.',
    tiles: [
      { logo: 'nv-terminal', label: 'IPConfig', action: { type: 'command', cmd: 'ipconfig', mode: 'window' } },
      { logo: 'nv-cpu', label: 'Task-Manager', action: { type: 'command', cmd: 'taskmgr', mode: 'window' } },
      { logo: 'nv-folder', label: 'Explorer', action: { type: 'open', target: 'explorer' } },
      { logo: 'nv-tool', label: 'Rechner', action: { type: 'open', target: 'calc' } },
      { logo: 'nv-settings', label: 'Einstellungen', action: { type: 'open', target: 'ms-settings:' } },
      { logo: 'nv-keyboard', label: 'Task-Hotkey', action: { type: 'hotkey', keys: 'Ctrl+Shift+Esc' } },
      { logo: 'nv-image', label: 'Screenshot', action: { type: 'hotkey', keys: 'Win+Shift+S' } },
      { logo: 'nv-terminal', label: 'CMD', action: { type: 'command', cmd: 'cmd', mode: 'window' } }
    ]
  },
  {
    id: 'gaming', name: 'Gaming', rows: 3,
    desc: 'Launcher, Voice-Chat, Aufnahme und Clip-Hotkey.',
    tiles: [
      { logo: 'discord', action: { type: 'open', target: 'discord:' } },
      { logo: 'steam', action: { type: 'open', target: 'steam://open/main' } },
      { logo: 'nv-games', label: 'Epic Games', action: { type: 'open', target: 'com.epicgames.launcher://apps' } },
      { logo: 'rec', label: 'Aufnahme', action: { type: 'record' }, state: 'recording' },
      { logo: 'nv-video', label: 'Clip', action: { type: 'hotkey', keys: 'Alt+F10' } },
      { logo: 'volume', label: 'Lautstärke', action: { type: 'volume', dir: 'up' }, state: 'volume' },
      { logo: 'mic', label: 'Mikrofon', action: { type: 'mic' }, state: 'mic' },
      { logo: 'folder', label: 'Spiele', folderPage: 'Spiele' }
    ]
  },
  {
    id: 'buero', name: 'Büro', rows: 3,
    desc: 'Meetings, Dokumente, Mail und Browser für den Arbeitstag.',
    tiles: [
      { logo: 'teams', label: 'Teams', action: { type: 'open', target: 'msteams:' } },
      { logo: 'nv-video-call', label: 'Zoom', action: { type: 'open', target: 'https://zoom.us' } },
      { logo: 'nv-file', label: 'Word', action: { type: 'open', target: 'winword' } },
      { logo: 'nv-file', label: 'Excel', action: { type: 'open', target: 'excel' } },
      { logo: 'browser', label: 'Browser', action: { type: 'open', target: 'https://www.google.com' } },
      { logo: 'nv-mail', label: 'Mail', action: { type: 'open', target: 'mailto:' } },
      { logo: 'nv-notes', label: 'Notizen', action: { type: 'open', target: 'notepad.exe' } },
      { logo: 'folder', label: 'Arbeit', folderPage: 'Arbeit' }
    ]
  },
  {
    id: 'leer', name: 'Leere Seite', rows: 4,
    desc: 'Unbelegtes Raster mit 5 × 4 freien Tasten.',
    tiles: []
  }
];

const state = {
  layout: null, pageId: null, key: null, devices: [], libTab: 'brand', logoQ: '',
  color: '', dragKey: null, suppressClick: 0, code: null, codeUntil: 0, codeTimer: null,
  apps: null, appQ: '', appErr: false, scanning: false,
  installedBrands: null, brandAll: false, brandAutoScan: false,
  tab: 'editor', pairs: [], pairTimer: null, pairBusy: false,
  crumbs: null,
  nets: [], port: 47830, qrIp: null,
  design: { palette: 'graphite', accent: PAL.graphite.accent, radius: 14 }
};

/* Auto-Farbe für gescannte Apps: feste Palette, per Namens-Hash */
const APP_PALETTE = ['#22D3EE', '#A78BFA', '#4ADE80', '#FBBF24', '#F87171', '#60A5FA', '#F472B6'];

function hashName(s) {
  let h = 2166136261;
  for (const c of String(s || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function autoColor(name) { return APP_PALETTE[hashName(name) % APP_PALETTE.length]; }

/* ============ API ============ */
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/* ============ Toast & Speicher-Status ============ */
let toastT;
function toast(msg, err = false) {
  const n = $('#toast');
  n.textContent = msg;
  n.classList.toggle('err', err);
  n.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => n.classList.remove('show'), 2400);
}
function markDirty() { $('#savedTag').textContent = 'ungespeichert'; $('#savedLine').classList.remove('err'); $('#savedTxt').textContent = 'Änderungen werden sofort gespeichert'; }
function markSaving() { $('#savedTag').textContent = 'speichert …'; }
function markSaved() {
  const t = new Date().toLocaleTimeString('de-DE');
  $('#savedTag').textContent = 'gespeichert ' + t;
  $('#savedLine').classList.remove('err');
  $('#savedTxt').textContent = 'Zuletzt gespeichert ' + t;
}
function markError() { $('#savedTag').textContent = 'Fehler'; $('#savedLine').classList.add('err'); $('#savedTxt').textContent = 'Speichern fehlgeschlagen'; }

let chain = Promise.resolve();
function savePages() {
  const body = JSON.stringify({ pages: state.layout.pages });
  const p = chain.then(async () => { markSaving(); await api('/api/admin/save', { method: 'POST', body }); markSaved(); return true; });
  chain = p.catch((e) => { markError(); toast('Speichern fehlgeschlagen: ' + e.message, true); return false; });
  return chain;
}
function saveSettings() {
  const body = JSON.stringify({ settings: { palette: state.design.palette, accent: state.design.accent, radius: state.design.radius } });
  const p = chain.then(async () => { markSaving(); await api('/api/admin/save', { method: 'POST', body }); markSaved(); return true; });
  chain = p.catch((e) => { markError(); toast('Design speichern fehlgeschlagen: ' + e.message, true); return false; });
  return chain;
}

/* Einzelne Schalter (z. B. requireApproval) über dieselbe Admin-Save-Route */
function saveSettingsPatch(patch, label) {
  const body = JSON.stringify({ settings: patch });
  const p = chain.then(async () => { markSaving(); await api('/api/admin/save', { method: 'POST', body }); markSaved(); return true; });
  chain = p.catch((e) => { markError(); toast((label || 'Einstellungen') + ' speichern fehlgeschlagen: ' + e.message, true); return false; });
  return chain;
}
const saveSoon = debounce(() => savePages(), 350);
const saveSettingsSoon = debounce(() => saveSettings(), 350);
function touch() { markDirty(); saveSoon(); }
function touchSettings() { markDirty(); saveSettingsSoon(); }

/* ============ Tile-Markup ============ */
function isMono(tile) { return tile?.logo === 'letter'; }

function monoLetter(tile) {
  const raw = String(tile?.letter || tile?.label || '').trim();
  return (raw[0] || '?').toUpperCase();
}

function monoFg(color) {
  const h = String(color || '#22D3EE').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const lum = (0.299 * (r || 34) + 0.587 * (g || 211) + 0.114 * (b || 238)) / 255;
  return lum > 0.62 ? '#0A0D12' : '#FFFFFF';
}

function tileHtml(tile) {
  if (tile && tile.logo) tile.logo = normalizeLogo(tile.logo);
  if (isMono(tile)) {
    const tint = tile.color || autoColor(tile.label || monoLetter(tile));
    return `<div class="tile mono"${tile.color ? ' data-tint' : ''} style="--tint:${esc(tint)};--mono:${monoFg(tint)}" ` +
      `data-logo="letter" title="${esc(tile.label || 'Taste')}">` +
      `<svg viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="50" text-anchor="middle" ` +
      `dominant-baseline="central" font-size="54">${esc(monoLetter(tile))}</text></svg></div>`;
  }
  // Marken-Kachel: echtes Logo-Bild zentriert auf transparenter Kachel
  const appIconFirst = tile && (tile.appIcon || (typeof tile.img === 'string' && tile.img.startsWith('/assets/appicons/') ? tile.img : ''));
  if (appIconFirst) {
    const src1 = typeof appIconFirst === 'string' && appIconFirst.startsWith('/assets/appicons/') ? appIconFirst : `/assets/appicons/${encodeURIComponent(String(appIconFirst))}.png`; return `<div class="tile app has-appicon"${tile.color ? ` data-tint="" style="--tint:${esc(tile.color)}"` : ''} data-logo="${esc(tile.logo || 'nv-app')}" data-appicon="1" title="${esc(tile.label || 'App')}"><img class="appicon" src="${esc(src1)}" alt="" loading="lazy" decoding="async" draggable="false"></div>`;


  }
  const appIconSrc = tile && (tile.appIcon || (typeof tile.img === 'string' && tile.img.startsWith('/assets/appicons/')));
  if (appIconSrc) {
    const src = typeof appIconSrc === 'string' && appIconSrc.startsWith('/assets/appicons/')
      ? appIconSrc : `/assets/appicons/${encodeURIComponent(String(appIconSrc))}.png`;
    return `<div class="tile app has-appicon"${tile.color ? ` data-tint="" style="--tint:${esc(tile.color)}"` : ''}` +
      ` data-logo="${esc(tile.logo || 'nv-app')}" data-appicon="1" title="${esc(tile.label || 'App')}">` +
      `<img class="appicon" src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false"></div>`;
  }
  const d = LOGOS[tile.logo] || LOGOS.tool;
  const appLogo = (window.NOVORA_APPLOGOS || {})[tile.logo];
  if (appLogo) {
    return `<div class="tile has-applogo${tile.color ? ' data-tint' : ''}" ${tile.color ? `style="--tint:${esc(tile.color)}"` : ''}` +
      ` data-logo="${esc(tile.logo)}" title="${esc(tile.label || d.label)}">` +
      `<img class="tile-applogo" src="${esc(appLogo)}" alt="" loading="lazy"></div>`;
  }
  const imgOk = tile.img && /^(?:\/|data:image\/)/i.test(String(tile.img)) && !/google\.com\/s2/i.test(String(tile.img));
  if (imgOk) {
    const si = [];
    if (d.brand) { si.push(`--brand:${d.brand}`, `--brand2:${d.brand2}`); }
    if (tile.color) si.push(`--tint:${tile.color}`);
    const styleI = si.length ? ` style="${si.join(';')}"` : '';
    const tintI = tile.color ? ' data-tint=""' : '';
    const light = d.brand && d.light ? ' light' : '';
    const fb = svgFallback(tile.logo);
    return `<div class="tile${d.brand ? ' app' : ''}${light}"${tintI}${styleI} data-logo="${esc(tile.logo)}" data-img="1" title="${esc(tile.label || d.label)}">` +
      `<span class="tileimgwrap"><img class="tileimg" src="${esc(tile.img)}" alt="" data-fb="${esc(fb)}" ` +
      `onerror="this.onerror=null;var w=this.parentNode;if(w){w.innerHTML=this.dataset.fb||'';}"></span></div>`;
  }
  const st = [];
  if (d.brand) { st.push(`--brand:${d.brand}`, `--brand2:${d.brand2}`); }
  if (tile.color) st.push(`--tint:${tile.color}`);
  const style = st.length ? ` style="${st.join(';')}"` : '';
  const tint = tile.color ? ' data-tint=""' : '';
  if (d.brand) return `<div class="tile app${d.light ? ' light' : ''}"${tint}${style} data-logo="${tile.logo}" title="${esc(d.label)}"><div class="logo" style="color:${d.ink || '#FFFFFF'}"><svg viewBox="0 0 24 24">${d.svg}</svg></div></div>`;
  return `<div class="tile"${tint}${style} data-logo="${tile.logo}" title="${esc(d.label)}"><svg class="ic" viewBox="0 0 24 24">${d.svg}</svg></div>`;
}
function decorate(tile, node) {
  if (!node || !tile) return;
  const st = state.layout?.state || {};
  if (tile.state === 'mic' && st.mic) node.classList.add('on');
  if (tile.state === 'recording' && st.recording) { node.classList.add('warn'); node.insertAdjacentHTML('afterbegin', '<span class="badge"></span>'); }
  if (tile.state === 'volume') {
    const v = Math.max(0, Math.min(100, Number(st.volume) || 0));
    node.insertAdjacentHTML('beforeend', `<svg class="ring" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="45"/><circle class="arc" cx="50" cy="50" r="45" stroke-dasharray="283" stroke-dashoffset="${(283 - 283 * v / 100).toFixed(1)}"/></svg><b class="num">${v}</b>`);
  }
}
const ghostHtml = '<div class="tile ghost" title="Frei – klicken zum Hinzufügen"><svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>';
function nodeFrom(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/* ============ Seiten ============ */
function currentPage() { return state.layout?.pages.find((p) => p.id === state.pageId) || null; }
function currentTile() { const p = currentPage(); return p?.tiles?.find((t) => t.key === state.key) || null; }

/* ============ Ordner-Navigation (Breadcrumb) ============ */
function pageById(id) { return (state.layout?.pages || []).find((p) => p.id === id) || null; }

function homePageId() {
  const pages = state.layout?.pages || [];
  const home = pages.find((p) => p.type !== 'mixer' && !p.folder) || pages.find((p) => p.type !== 'mixer') || pages[0];
  return home?.id || null;
}

function crumbsFor(id) {
  const home = homePageId();
  if (!id) return home ? [home] : [];
  if (home && id === home) return [home];
  const p = pageById(id);
  if (p?.folder) return home ? [home, id] : [id];
  return [id];
}

/* Pfad mit dem aktuellen Zustand abgleichen (nach Löschen, Umbenennen, Neuladen). */
function syncCrumbs() {
  const id = state.pageId;
  if (!id) { state.crumbs = []; return state.crumbs; }
  if (!Array.isArray(state.crumbs) || !state.crumbs.includes(id)) state.crumbs = crumbsFor(id);
  state.crumbs = state.crumbs.filter((x) => !!pageById(x));
  if (!state.crumbs.includes(id)) state.crumbs = crumbsFor(id);
  return state.crumbs;
}

/* push=true bei Klick auf eine Ordner-Kachel: Pfad erweitern statt ersetzen. */
function navTo(id, push) {
  const p = pageById(id);
  if (!p) { toast('Zielseite nicht gefunden', true); return false; }
  const home = homePageId();
  let trail;
  if (!push) trail = crumbsFor(id);
  else {
    const base = (Array.isArray(state.crumbs) && state.crumbs.includes(state.pageId))
      ? state.crumbs.slice(0, state.crumbs.indexOf(state.pageId) + 1)
      : crumbsFor(state.pageId);
    trail = (home && id === home) ? [home]
      : base.includes(id) ? base.slice(0, base.indexOf(id) + 1)
      : [...base, id];
  }
  state.crumbs = trail.filter((x) => !!pageById(x));
  state.pageId = id;
  state.key = null;
  renderPages(); renderEditor(); renderInspector();
  return true;
}

function renderBreadcrumb() {
  const box = $('#crumbs');
  if (!box) return;
  const trail = syncCrumbs();
  const home = homePageId();
  box.innerHTML = '';
  trail.forEach((id, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = '›'; box.append(sep); }
    const p = pageById(id);
    const cur = id === state.pageId;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'crumb' + (cur ? ' cur' : '');
    b.textContent = (home && id === home) ? 'Home' : (p?.name || '—');
    b.title = b.textContent;
    b.disabled = cur;
    b.onclick = () => { if (!cur) navTo(id, false); };
    box.append(b);
  });
  const folder = !!pageById(state.pageId)?.folder;
  let back = $('#crumbBack');
  if (!back) {
    back = document.createElement('button');
    back.type = 'button';
    back.id = 'crumbBack';
    back.className = 'crumb-back';
    back.textContent = '◀ Zurück zu Home';
    box.append(back);
  }
  back.classList.toggle('hidden', !folder || state.pageId === home);
  back.onclick = () => { if (home) navTo(home, false); };
}

function autoSelectFirst() {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  const first = (page.tiles || []).slice().sort((a, b) => a.key - b.key)[0];
  if (first) { state.key = first.key; renderEditor(); }
}

function renderPages() {
  const box = $('#pageList'); if (box) { const cd1 = $('#cntDev'); if (cd1) cd1.textContent = String(state.devices.length); const bt1 = $('#bezelTitle'); const cp1 = currentPage(); if (bt1 && cp1) bt1.textContent = 'Vorschau · ' + cp1.name; } box.innerHTML = '';
  state.layout.pages.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'pg-tab' + (p.id === state.pageId ? ' active' : '');
    row.dataset.id = p.id;
    row.innerHTML = `<span class="pg-dot" aria-hidden="true"></span><button class="pg-name" type="button" title="${esc(p.name)}">${esc(p.name)}</button>` +
      (p.type === 'mixer' ? '<span class="tag">Mixer</span>' : '') +
      '<span class="pg-act">' +
      (idx > 0 ? '<button data-act="up" title="nach oben">▲</button>' : '') +
      (idx < state.layout.pages.length - 1 ? '<button data-act="down" title="nach unten">▼</button>' : '') +
      (p.type === 'mixer' ? '' : '<button data-act="del" class="del" title="löschen">×</button>') +
      '</span>';
    row.querySelector('.pg-name').onclick = () => { navTo(p.id, false); autoSelectFirst(); renderInspector(); };
    row.querySelector('.pg-name').ondblclick = (e) => { e.stopPropagation(); renamePage(p.id); };
    row.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); pageAction(p.id, b.dataset.act); };
    });
    box.append(row);
  });


}

function renamePage(id) {
  const p = state.layout?.pages.find((x) => x.id === id);
  if (!p || p.type === 'mixer') return;
  const v = prompt('Name der Seite', p.name);
  if (v == null) return;
  const name = v.trim().slice(0, 28);
  if (!name || name === p.name) return;
  p.name = name;
  touch(); renderPages(); renderEditor();
  toast('Umbenannt: ' + name);
}

function pageAction(id, act) {
  const pages = state.layout.pages;
  const i = pages.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = pages[i];
  if (act === 'up' && i > 0) { pages.splice(i, 1); pages.splice(i - 1, 0, p); }
  else if (act === 'down' && i < pages.length - 1) { pages.splice(i, 1); pages.splice(i + 1, 0, p); }
  else if (act === 'del') {
    if (p.type === 'mixer') { toast('Mixer-Seite ist geschützt und kann nicht gelöscht werden.', true); return; }
    if (pages.length <= 1) { toast('Letzte Seite kann nicht gelöscht werden.', true); return; }
    // Verweise auf gelöschte Seite leeren – betroffene Kacheln bleiben stehen.
    let refs = 0;
    for (const q of pages) {
      for (const t of (q.tiles || [])) {
        if (t.action && t.action.type === 'page' && t.action.page === p.id) {
          t.action.type = 'none';
          delete t.action.page;
          refs++;
        }
      }
    }
    pages.splice(i, 1);
    if (state.pageId === id) {
      state.pageId = (pages.find((x) => x.type !== 'mixer') || pages[0]).id;
      state.key = null;
    }
    touch(); renderPages(); renderEditor(); renderInspector();
    toast(refs
      ? `Seite „${p.name}“ gelöscht · ${refs} Verweis${refs === 1 ? '' : 'e'} geleert`
      : `Seite „${p.name}“ gelöscht`);
    return;
  }
  touch(); renderPages(); renderEditor(); renderInspector();
}

function addPage() { openTplModal(); }

/* ============ Vorlagen-Modal ============ */
let tplOpen = false, tplReturnFocus = null;

function newPageId() {
  let id;
  do { id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  while (state.layout.pages.some((p) => p.id === id));
  return id;
}

function makePageFromTemplate(tpl, asFolder) {
  const pages = state.layout.pages;
  const used = new Set(pages.map((p) => p.name));
  const uniqueName = (base) => {
    let name = base, n = 2;
    while (used.has(name)) name = base + ' ' + n++;
    used.add(name);
    return name;
  };

  const brandSeen = new Set();
  const folders = [];
  const tiles = (tpl.tiles || []).map((src, i) => {
    let logo = LOGOS[src.logo] ? src.logo : 'tool';
    if (LOGOS[logo].kind === 'brand') {
      if (brandSeen.has(logo)) logo = 'tool'; else brandSeen.add(logo);
    }
    const tile = { key: i, logo };
    if (src.label) tile.label = src.label;
    if (src.folderPage) {
      const pid = newPageId();
      folders.push({ id: pid, name: uniqueName(src.folderPage), cols: 5, rows: 3, folder: true, tiles: [] });
      tile.action = { type: 'page', page: pid };
    } else if (src.action) {
      tile.action = { ...src.action };
    }
    if (src.state) tile.state = src.state;
    return tile;
  });

  const rows = tpl.rows || (tiles.length > 15 ? 4 : tiles.length ? 3 : 4);
  const page = { id: newPageId(), name: uniqueName(tpl.name), cols: 5, rows, folder: !!asFolder, tiles };

  const mix = pages.findIndex((p) => p.type === 'mixer');
  pages.splice(mix < 0 ? pages.length : mix, 0, page, ...folders);
  state.pageId = page.id; state.key = null;

  closeTplModal();
  touch(); renderPages(); renderEditor(); autoSelectFirst(); renderInspector();
  toast('Seite „' + page.name + '“ angelegt' + (folders.length ? ` · ${folders.length} Ordner` : ''));
  return page;
}

function tplPreviewHtml(tpl) {
  if (!tpl.tiles.length) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  }
  const head = tpl.tiles.slice(0, 6);
  const more = tpl.tiles.length > head.length
    ? `<span class="tpl-more">+${tpl.tiles.length - head.length}</span>` : '';
  return head.map((t) => tileHtml({ logo: t.logo, label: t.label })).join('') + more;
}

function renderTemplates() {
  const grid = $('#tplGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const tpl of PAGE_TPL) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tpl-card' + (tpl.tiles.length ? '' : ' blank');
    card.setAttribute('aria-label', tpl.name + ' – ' + tpl.desc);
    card.innerHTML =
      `<span class="tpl-prev">${tplPreviewHtml(tpl)}</span>` +
      `<span class="tpl-name"><span>${esc(tpl.name)}</span>` +
      `<span class="tpl-count">${tpl.tiles.length ? tpl.tiles.length + ' Tasten' : 'leer'}</span></span>` +
      `<span class="tpl-desc">${esc(tpl.desc)}</span>`;
    card.onclick = () => makePageFromTemplate(tpl, $('#tplFolder').checked);
    grid.append(card);
  }
}

function openTplModal() {
  if (!state.layout) { toast('Layout lädt noch', true); return; }
  if (tplOpen) return;
  renderTemplates();
  $('#tplFolder').checked = false;
  tplOpen = true;
  tplReturnFocus = document.activeElement;
  $('#tplModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const first = $('#tplGrid .tpl-card');
  (first || $('#tplClose')).focus({ preventScroll: true });
}

function closeTplModal() {
  if (!tplOpen) return;
  tplOpen = false;
  $('#tplModal').classList.add('hidden');
  document.body.style.overflow = '';
  const back = tplReturnFocus && tplReturnFocus !== document.body ? tplReturnFocus : $('#addPage');
  if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
  tplReturnFocus = null;
}


/* ============ Raster ============ */
function renderEditor() {
  const page = currentPage();
  if (!page) return;
  renderBreadcrumb();
  const isMixer = page.type === 'mixer';
  const cols = page.cols || 5, rows = page.rows || 4;

  $('#pageName').value = page.name;
  $('#pageName').disabled = isMixer;
  $('#colsStep').querySelector('.sv').textContent = cols;
  $('#rowsStep').querySelector('.sv').textContent = rows;
  $('#colsStep').classList.toggle('hidden', isMixer);
  $('#rowsStep').classList.toggle('hidden', isMixer);
  $$('.ed-head .mini-lbl').forEach((n) => n.classList.toggle('hidden', isMixer));

  const g = $('#edgrid'), mp = $('#mixPanel');
  if (isMixer) {
    g.classList.add('hidden'); g.innerHTML = '';
    mp.classList.remove('hidden'); renderMixerPanel(page);
    $('#gridHint').classList.add('hidden');
    $('#pageMeta').textContent = 'Mixer-Seite · geschützt';
    state.key = null; renderInspector();
    return;
  }
  g.classList.remove('hidden'); mp.classList.add('hidden'); $('#gridHint').classList.remove('hidden');

  const tiles = page.tiles || (page.tiles = []);
  const total = cols * rows;
  const inside = tiles.filter((t) => t.key < total).length;
  const outside = tiles.length - inside;
  $('#pageMeta').textContent = `${cols} × ${rows} · ${total} Tasten · ${inside} belegt` + (outside ? ` · ${outside} außerhalb` : '');

  g.innerHTML = '';
  g.style.setProperty('--cols', cols);

  for (let i = 0; i < total; i++) {
    const tile = tiles.find((t) => t.key === i);
    const node = nodeFrom(tile ? tileHtml(tile) : ghostHtml);
    if (tile) {
      decorate(tile, node);
      node.draggable = true;
      node.dataset.key = i;
      const badge = document.createElement('span');
      badge.className = 'actbadge';
      badge.textContent = badgeText(tile);
      if (tile.action) node.append(badge);
      if (!tile.action) {
        node.classList.add('dead');
        node.title = 'Keine Aktion zugeordnet';
      }
      // Entfernen nur über das X – kein Doppelklick, kein Rechtsklick-Löschen.
      const kill = document.createElement('button');
      kill.className = 'killx';
      kill.type = 'button';
      kill.textContent = '×';
      kill.title = `Taste ${i + 1} entfernen`;
      kill.setAttribute('aria-label', `Taste ${i + 1} entfernen`);
      kill.onmousedown = (e) => e.stopPropagation();
      kill.onclick = (e) => { e.preventDefault(); e.stopPropagation(); removeTileAt(i); };
      node.append(kill);
      node.onclick = (e) => { if (Date.now() < state.suppressClick) return; e.stopPropagation(); selectKey(i); };
      // Doppelklick auf eine Ordner-Kachel: im Editor in die Zielseite wechseln.
      node.ondblclick = (e) => {
        if (Date.now() < state.suppressClick) return;
        const a = tile.action;
        if (!a || a.type !== 'page' || !a.page) return;
        e.preventDefault(); e.stopPropagation();
        state.suppressClick = Date.now() + 250;
        if (!navTo(a.page, true)) return;
        toast('Ordner geöffnet: ' + (pageById(a.page)?.name || 'Seite'));
      };
      // Kein Rechtsklick-Menü: entfernt wird ausschließlich über das X.
      node.oncontextmenu = (e) => e.preventDefault();
      node.ondragstart = (e) => {
        if (e.target.closest('.killx')) { e.preventDefault(); return; }
        state.dragKey = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ }
      };
      node.ondragend = () => { state.suppressClick = Date.now() + 150; };
    } else {
      node.onclick = () => { if (Date.now() < state.suppressClick) return; addTile(i); };
    }
    node.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = state.dragLogo ? 'copy' : 'move'; node.classList.add('dragover'); };
    node.ondragleave = () => node.classList.remove('dragover');
    node.ondrop = (e) => {
      e.preventDefault();
      node.classList.remove('dragover');
      // Website-Kachel aus der Bibliothek: Logo + "URL öffnen" in einem Schritt
      const web = e.dataTransfer?.getData('application/x-sp-web');
      if (web) {
        try { dropWeb(i, JSON.parse(web)); } catch { /* ignore bad payload */ }
        return;
      }
      const appPayload = e.dataTransfer?.getData('application/x-sp-app');
      if (appPayload) {
        try { dropApp(i, JSON.parse(appPayload)); } catch { /* ignore bad payload */ }
        return;
      }
      const brand = e.dataTransfer?.getData('application/x-sp-brand');
      if (brand) {
        try { dropBrand(i, JSON.parse(brand)); } catch { /* ignore bad payload */ }
        return;
      }
      const logo = e.dataTransfer?.getData('application/x-sp-logo');
      if (logo) { dropLogo(i, logo); return; }
      dropOn(i);
    };
    if (state.key === i) node.classList.add('sel');
    g.append(node);
  }
  fitEditorGrid();
}

// Kachelgröße aus der verfügbaren Fläche: quadratisch, füllt Breite UND Höhe.
function fitEditorGrid() {
  const g = $('#edgrid');
  if (!g || g.classList.contains('hidden')) return;
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  const cols = Math.max(1, page.cols || 5);
  const rows = Math.max(1, page.rows || 4);
  const gap = 7;
  const w = g.clientWidth, h = g.clientHeight;
  if (!w || !h) return;
  const byWidth = (w - (cols - 1) * gap) / cols;
  const byHeight = (h - (rows - 1) * gap) / rows;
  const size = Math.max(48, Math.min(Math.floor(Math.min(byWidth, byHeight)), 420));
  g.style.setProperty('--tile', size + 'px');
}
window.addEventListener('resize', debounce(fitEditorGrid, 60));

function renderMixerPanel(page) {
  const apps = state.layout.mixer || [];
  $('#mixPanel').innerHTML =
    `<div class="mixpanel"><div class="ed-head" style="margin-bottom:6px"><h3>Mixer</h3><span class="meta">${apps.length} Sessions · eigene Seite auf dem Gerät</span></div>` +
    apps.map((a) => `<div class="mixrow"><span class="mn">${esc(a.name)}</span><span class="mixbar"><i style="width:${Math.max(0, Math.min(100, a.vol || 0))}%"></i></span><span class="mv">${a.vol ?? 0} %</span>${a.muted ? '<span class="mm">stumm</span>' : ''}</div>`).join('') +
    `</div><div class="hintline" style="margin-top:8px">Mixer-Seite ist geschützt: nicht löschbar und ohne Raster. Die Regler liegen auf dem Gerät.</div>`;
}

function selectKey(k) { state.key = k; renderEditor(); renderInspector(); }

function addTile(i) {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  page.tiles = page.tiles || [];
  if (page.tiles.some((t) => t.key === i)) return;
  page.tiles.push({ key: i, logo: 'tool' });
  state.key = i;
  touch(); renderEditor(); renderInspector();
}

function dropOn(to) {
  const from = state.dragKey;
  state.dragKey = null;
  if (from == null || from === to) return;
  const page = currentPage();
  const tiles = page?.tiles || [];
  const a = tiles.find((t) => t.key === from);
  if (!a) return;
  const b = tiles.find((t) => t.key === to);
  if (b) { b.key = from; a.key = to; } else { a.key = to; }
  state.key = to;
  state.suppressClick = Date.now() + 200;
  touch(); renderEditor(); renderInspector();
}

const DEFAULT_SYMBOL_ACTIONS = { 'nv-settings': { label: 'Einstellungen', action: { type: 'open', target: 'ms-settings:' } }, 'nv-volume': { label: 'Lauter', action: { type: 'volume', dir: 'up' }, state: 'volume' }, 'nv-volume-up': { label: 'Lauter', action: { type: 'volume', dir: 'up' } }, 'nv-volume-low': { label: 'Leiser', action: { type: 'volume', dir: 'down' } }, 'nv-volume-down': { label: 'Leiser', action: { type: 'volume', dir: 'down' } }, 'nv-volume-mute': { label: 'Stumm', action: { type: 'volume', dir: 'mute' } }, 'nv-mute': { label: 'Stumm', action: { type: 'volume', dir: 'mute' } }, 'nv-play': { label: 'Play / Pause', action: { type: 'media', key: 'playpause' } }, 'nv-pause': { label: 'Play / Pause', action: { type: 'media', key: 'playpause' } }, 'nv-next': { label: 'Weiter', action: { type: 'media', key: 'next' } }, 'nv-prev': { label: 'Zurück', action: { type: 'media', key: 'prev' } }, 'nv-stop': { label: 'Stopp', action: { type: 'media', key: 'stop' } }, 'nv-mic': { label: 'Mikrofon', action: { type: 'mic' }, state: 'mic' }, 'nv-record': { label: 'Aufnahme', action: { type: 'record' }, state: 'recording' }, 'nv-folder': { label: 'Explorer', action: { type: 'open', target: 'explorer.exe' } }, 'nv-terminal': { label: 'Terminal', action: { type: 'command', cmd: 'cmd', mode: 'window' } }, 'nv-lock': { label: 'Sperren', action: { type: 'system', preset: 'lock' } }, 'nv-power': { label: 'Ruhezustand', action: { type: 'system', preset: 'sleep' } }, 'nv-browser': { label: 'Browser', action: { type: 'open', target: 'https://www.google.com' } }, 'nv-mail': { label: 'Mail', action: { type: 'open', target: 'mailto:' } }, 'nv-camera': { label: 'Kamera', action: { type: 'open', target: 'microsoft.windows.camera:' } }, 'nv-tool': { label: 'Rechner', action: { type: 'open', target: 'calc.exe' } }, 'nv-cpu': { label: 'Task-Manager', action: { type: 'open', target: 'taskmgr.exe' } }, 'nv-notes': { label: 'Notizen', action: { type: 'open', target: 'notepad.exe' } } }; function applyDefaultSymbolAction(tile, key, force) { const def = DEFAULT_SYMBOL_ACTIONS[key]; if (!def) return; if (force || !tile.action) { tile.action = { ...def.action }; if (!tile.label) tile.label = def.label; if (def.state) tile.state = def.state; } } function dropLogo(key, logo) {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  page.tiles = page.tiles || [];
  let tile = page.tiles.find((t) => t.key === key);
  const isNew = !tile; if (!tile) { tile = { key, logo }; page.tiles.push(tile); } else { tile.logo = logo; delete tile.appIcon; delete tile.img; delete tile.brand; delete tile.letter; } applyDefaultSymbolAction(tile, logo, isNew);
  // action already applied above
  state.key = key;
  state.dragLogo = null;
  state.suppressClick = Date.now() + 200;
  touch(); renderEditor(); renderInspector();
}

// Website auf eine Rasterzelle ziehen: Kachel bekommt Logo und "URL öffnen".
function dropWeb(key, link) {
  const page = currentPage();
  if (!page || page.type === 'mixer' || !link || !link.url) return;
  page.tiles = page.tiles || [];
  let tile = page.tiles.find((t) => t.key === key);
  if (!tile) { tile = { key }; page.tiles.push(tile); }
  tile.logo = link.key;
  tile.label = link.label || siteHost(link.url);
  tile.action = { type: 'open', target: link.url };
  delete tile.letter;
  delete tile.color;
  applyBrandLogo(tile, link.slug);
  state.key = key;
  state.color = '';
  state.dragLogo = null;
  state.suppressClick = Date.now() + 200;
  touch(); renderEditor(); renderInspector(); renderLogoGrid();
  toast('Kachel gesetzt: ' + (link.label || link.url));
}

/* Marken-Logo an eine Kachel hängen: lokale Bilddatei, sonst CDN-Bild */
function applyBrandLogo(tile, slug) {
  if (!tile) return;
  delete tile.brand;
  if (!slug) { delete tile.img; return; }
  if (brandPath(slug)) { tile.brand = slug; delete tile.img; }
  else { delete tile.brand; delete tile.img; }
}

// Marke aus der Bibliothek auf eine Rasterzelle ziehen
function dropBrand(key, brand) {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  if (!brand || !brand.slug || !brand.path) {
    toast('Keine App-Zuordnung: Bitte eine installierte App wählen.', true);
    return;
  }
  page.tiles = page.tiles || [];
  let tile = page.tiles.find((t) => t.key === key);
  if (!tile) { tile = { key }; page.tiles.push(tile); }
  tile.logo = 'nv-app';
  tile.label = brand.label || brand.slug;
  delete tile.letter;
  delete tile.color;
  applyBrandLogo(tile, brand.slug);
  state.key = key;
  state.color = '';
  state.dragLogo = null;
  state.suppressClick = Date.now() + 200;
  touch(); renderEditor(); renderInspector(); renderLogoGrid();
  toast('Kachel gesetzt: ' + (brand.label || brand.slug));
}

async function dropApp(key, app) {
  const page = currentPage();
  if (!page || page.type === 'mixer' || !app || !app.path) return;
  page.tiles = page.tiles || [];
  let tile = page.tiles.find((t) => t.key === key);
  if (!tile) { tile = { key }; page.tiles.push(tile); }
  try {
    const icon = await extractPcIcon(app.iconPath || app.path, app.path);
    applyAppToTile(tile, app, icon);
    state.key = key;
    state.dragLogo = null;
    state.suppressClick = Date.now() + 200;
    touch(); savePages(); renderEditor(); renderInspector(); renderLogoGrid();
    toast('App gesetzt: ' + app.name);
  } catch (e) {
    toast('App konnte nicht gesetzt werden: ' + (e.message || e), true);
  }
}

function pickBrand(brand) {
  const tile = currentTile();
  if (!tile) { toast('Erst eine Taste im Raster wählen', true); return; }
  if (!brand || !brand.path) {
    toast('Keine App-Zuordnung: Bitte eine installierte App wählen.', true);
    return;
  }
  tile.logo = 'nv-app';
  tile.label = brand.label || brand.slug;
  delete tile.letter;
  delete tile.color;
  applyBrandLogo(tile, brand.slug);
  state.color = '';
  touch(); renderEditor(); renderInspector(); renderLogoGrid();
  toast('Kachel gesetzt: ' + (brand.label || brand.slug));
}

/* ============ Apps auf diesem PC (EXE-Icons) ============ */
const pcIconCache = new Map(); let appIconObserver = null; function observeAppIcon(node, app) { const run = () => extractPcIcon(app.iconPath || app.path, app.path).then((ic) => { const im = node.querySelector('img'); const fb = node.querySelector('.lib-fb'); if (im && ic && ic.png) { im.src = ic.png; im.hidden = false; if (fb) fb.hidden = true; } }).catch(() => {}); if (typeof IntersectionObserver === 'undefined') { run(); return; } if (!appIconObserver) { appIconObserver = new IntersectionObserver((entries) => { for (const en of entries) { if (!en.isIntersecting) continue; appIconObserver.unobserve(en.target); const fn = en.target._loadIcon; if (fn) fn(); } }, { root: $('#logoGrid'), rootMargin: '60px' }); } node._loadIcon = run; appIconObserver.observe(node); }

async function extractPcIcon(iconSource, appPath) {
  const src = String(iconSource || appPath || '').trim(); const target = String(appPath || iconSource || '').trim(); const key = `${src.toLowerCase()}|${target.toLowerCase()}`;
  if (pcIconCache.has(key)) return pcIconCache.get(key);
  const r = await fetch('/api/admin/appicons/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: target, iconPath: src })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.message || d.error || 'Extraktion fehlgeschlagen');
  const icon = { id: d.id, png: String(d.png || `/assets/appicons/${d.id}.png`) };
  pcIconCache.set(key, icon);
  return icon;
}

function appKindFromPath(value) {
  const p = String(value || '');
  if (/^shell:AppsFolder\\/i.test(p)) return 'uwp';
  if (/\.lnk$/i.test(p)) return 'lnk';
  if (/\.exe$/i.test(p)) return 'exe';
  return 'file';
}

let installedApps = null;
let installedAppsAt = 0;
let installedAppsPromise = null;

async function loadInstalledApps(refresh = false) {
  if (!refresh && installedApps && Date.now() - installedAppsAt < 300000) return installedApps;
  if (installedAppsPromise) return installedAppsPromise;
  installedAppsPromise = fetch('/api/admin/installed-apps' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
    .then((r) => r.json().then((d) => ({ r, d })))
    .then(({ r, d }) => {
      if (!r.ok || !d.ok) throw new Error(d.message || d.error || 'App-Liste fehlgeschlagen');
      installedApps = Array.isArray(d.apps) ? d.apps : [];
      installedAppsAt = Date.now();
      return installedApps;
    })
    .finally(() => { installedAppsPromise = null; });
  return installedAppsPromise;
}

function applyAppToTile(tile, app, icon) {
  if (!tile || !app || !app.path) return false;
  tile.label = app.name || tile.label || 'App';
  tile.action = { type: 'app', kind: app.kind || appKindFromPath(app.path), target: app.path };
  if (icon && icon.id) {
    tile.appIcon = icon.id;
    tile.img = icon.png;
  }
  delete tile.brand;
  delete tile.letter;
  tile.logo = 'nv-app';
  return true;
}

let pcAppsToken = 0;

async function scanPcApps() {
  const msg = document.getElementById('pcAppsMsg'); if (msg) msg.textContent = 'Suche installierte Apps …'; try { const apps = await loadInstalledApps(true); if (msg) msg.textContent = apps.length + ' installierte Apps gefunden.'; renderLogoGrid(); } catch (e) { if (msg) msg.textContent = 'Fehler: ' + (e.message || e); } return; /* legacy below */ } async function _unusedScan() { const list = null;
  const msg = document.getElementById('pcAppsMsg');
  if (!list) return;
  const token = ++pcAppsToken;
  if (msg) msg.textContent = 'Suche installierte Apps ...';
  try {
    const apps = await loadInstalledApps(true);
    if (token !== pcAppsToken) return;
    list.innerHTML = '';
    const rows = [];
    const cur = currentTile();
    for (const app of apps.slice(0, 120)) {
      const item = document.createElement('div');
      item.className = 'pcapp' + (cur && cur.appIcon && cur?.action?.target === app.path ? ' sel' : '');
      item.title = app.path;
      item.innerHTML = '<img alt="" loading="lazy" decoding="async" hidden><span></span>';
      item.querySelector('span').textContent = app.name;
      item.onclick = () => pickPcApp(app);
      list.append(item);
      rows.push(item);
    }
    if (msg) msg.textContent = `${apps.length} installierte Apps. Klick übernimmt Öffnen-Aktion und Icon.`;
    for (let i = 0; i < Math.min(16, apps.length); i++) {
      if (token !== pcAppsToken) return;
      try {
        const icon = await extractPcIcon(apps[i].path);
        const img = rows[i]?.querySelector('img');
        if (img && icon.png) { img.src = icon.png; img.hidden = false; }
      } catch { /* Vorschau ist optional */ }
    }
  } catch (e) {
    if (token === pcAppsToken && msg) msg.textContent = 'Fehler: ' + (e.message || e);
  }
}

async function pickPcApp(app) {
  const msg = document.getElementById('pcAppsMsg');
  if (!app || !app.path) { if (msg) msg.textContent = 'Kein Programm gefunden.'; return; }
  const tile = currentTile();
  if (!tile) { if (msg) msg.textContent = 'Erst eine Taste im Raster wählen.'; return; }
  if (msg) msg.textContent = `Icon wird extrahiert: ${app.name} ...`;
  try {
    const icon = await extractPcIcon(app.iconPath || app.path, app.path);
    if (!icon || !icon.id) throw new Error('Kein Icon erhalten');
    applyAppToTile(tile, app, icon);
    touch(); savePages(); renderEditor(); renderInspector(); renderLogoGrid();
    if (msg) msg.textContent = 'App übernommen: ' + app.name + ' (Klick öffnet sie)';
  } catch (e) {
    if (msg) msg.textContent = 'Fehler: ' + (e.message || e);
  }
}

let fgBusy = false; async function pickForegroundApp() { if (fgBusy) return; const msg = document.getElementById('pcAppsMsg'); const btn = document.getElementById('pcAppsForeground'); fgBusy = true; if (btn) btn.disabled = true; try { for (let sec = 3; sec > 0; sec--) { if (btn) btn.textContent = `Fenster (${sec}s)…`; if (msg) msg.textContent = `Zum Zielprogramm wechseln (${sec} s)…`; await new Promise((r) => setTimeout(r, 1000)); } if (msg) msg.textContent = 'Aktives Fenster wird gelesen …'; const r = await fetch('/api/admin/appicons/foreground', { method: 'POST' }); const d = await r.json().catch(() => ({})); if (!r.ok || !d.ok) throw new Error(d.message || d.error || 'Fenster nicht lesbar'); const app = d.app || {}; await pickPcApp({ name: app.name || app.title || 'Aktives Fenster', path: app.path, kind: app.kind || appKindFromPath(app.path) }); } catch (e) { if (msg) msg.textContent = 'Fehler: ' + (e.message || e); } finally { fgBusy = false; if (btn) { btn.disabled = false; btn.textContent = 'Aktives Fenster (3s)'; } } } async function extractTargetExe() { const tile = currentTile(); if (!tile) { toast('Erst eine Taste im Raster wählen', true); return; } const target = ($('#target')?.value || '').trim(); if (!target) { toast('Bitte EXE-Pfad oder AppID angeben', true); return; } await pickPcApp({ name: friendlyTarget(target), path: target, kind: appKindFromPath(target) }); } async function _unusedFg() {
  const msg = document.getElementById('pcAppsMsg');
  if (msg) msg.textContent = 'Aktives Fenster wird gelesen ...';
  try {
    const r = await fetch('/api/admin/appicons/foreground', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.message || d.error || 'Fenster nicht lesbar');
    const app = d.app || {};
    await pickPcApp({
      name: app.name || app.title || 'Aktives Fenster',
      path: app.path,
      kind: app.kind || appKindFromPath(app.path)
    });
  } catch (e) {
    if (msg) msg.textContent = 'Fehler: ' + (e.message || e);
  }
}

const TARGET_LABEL = {
  'ms-settings:': 'Einstellungen',
  'calc': 'Rechner', 'calc.exe': 'Rechner',
  'notepad': 'Editor', 'notepad.exe': 'Editor',
  'explorer': 'Explorer', 'explorer.exe': 'Explorer',
  'cmd': 'Eingabeaufforderung', 'cmd.exe': 'Eingabeaufforderung',
  'taskmgr': 'Task-Manager', 'taskmgr.exe': 'Task-Manager',
  'obs64.exe': 'OBS', 'obs64': 'OBS',
  'spotify:': 'Spotify', 'spotify:playlist': 'Spotify Playlist',
  'discord:': 'Discord', 'msteams:': 'Teams',
  'steam://open/main': 'Steam',
  'microsoft.windows.camera:': 'Kamera',
  'com.epicgames.launcher://apps': 'Epic Games'
};
const MEDIA_LABEL = { playpause: 'Play/Pause', next: 'Weiter', prev: 'Zurück', stop: 'Stop' };
const VOL_LABEL = { up: 'Lauter', down: 'Leiser', mute: 'Stumm' };

// "ms-settings:" is not something a user wants to read on a key.
function friendlyTarget(target) {
  const key = String(target || '').trim();
  if (!key) return '—';
  const low = key.toLowerCase();
  if (TARGET_LABEL[low]) return TARGET_LABEL[low];
  if (low.startsWith('shell:appsfolder\\')) return 'App';
  if (/^https?:\/\//.test(low)) {
    try { return new URL(key).hostname.replace(/^www\./, ''); } catch { return key.slice(0, 32); }
  }
  const file = key.split(/[\\/]/).pop() || key;
  return file.replace(/\.(exe|bat|cmd)$/i, '') || key;
}

/* Ordner/Datei-Pfad: absolut erkennen, letzten Pfadteil lesen */
function isAbsPath(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
  if (/^\\\\[^\\]/.test(s)) return true;
  return false;
}
function pathLeaf(p) {
  const s = String(p || '').trim().replace(/[\\/]+$/, '');
  return s.split(/[\\/]/).pop() || s;
}

const ACTION_LABEL = { hotkey: 'Tasten', open: 'App', command: 'Befehl', path: 'Pfad', media: 'Medien', volume: 'Volume', mic: 'Mikro', record: 'Aufnahme', system: 'Energie', page: 'Seite' };
function badgeText(tile) {
  const a = tile?.action;
  if (!a || !a.type || a.type === 'none') return 'frei';
  if (a.type === 'hotkey') return '⌨ ' + (a.keys || '—');
  if (a.type === 'open') return 'OFFEN ' + friendlyTarget(a.target);
  if (a.type === 'app') return 'APP ' + (tile?.label || friendlyTarget(a.target));
  if (a.type === 'command') return 'CMD ' + (a.cmd || '—');
  if (a.type === 'path') return 'PFAD ' + (pathLeaf(a.path) || '—');
  if (a.type === 'media') return 'TON ' + (MEDIA_LABEL[a.key] || a.key || '—');
  if (a.type === 'volume') return 'VOL ' + (VOL_LABEL[a.dir] || a.dir || 'Lauter');
  if (a.type === 'system') return '⏻ ' + (PRESET_LABEL[a.preset] || 'Energie');
  if (a.type === 'page') {
    const p = pageById(a.page);
    return 'SEITE ' + (p?.name || a.page || '—');
  }
  return ACTION_LABEL[a.type] || a.type;
}
function actionSummary(tile) {
  const a = tile?.action;
  if (!a || !a.type || a.type === 'none') return 'Keine Aktion hinterlegt.';
  if (a.type === 'hotkey') return `Tastenkombination <b>${esc(a.keys || '—')}</b> — wird am PC gesendet.`;
  if (a.type === 'app') {
    return `Öffnet <b>${esc(tile?.label || friendlyTarget(a.target))}</b> am PC (${esc(a.kind || 'exe')}).`;
  }
  if (a.type === 'open') {
    const extra = a.args ? ` mit Argument <b>${esc(a.args)}</b>` : '';
    if (a.then && a.then.keys) {
      const ms = Number(a.then.delayMs) || 800;
      return `Öffnet <b>${esc(friendlyTarget(a.target))}</b>${extra}, danach <b>${esc(a.then.keys)}</b> nach ${ms} ms.`;
    }
    return `Öffnet <b>${esc(friendlyTarget(a.target))}</b>${extra} am PC.`;
  }
  if (a.type === 'command') return `Führt <b>${esc(a.cmd || '—')}</b> am PC aus (${a.mode === 'silent' ? 'still' : 'Fenster'}).`;
  if (a.type === 'path') return `Öffnet Ordner <b>${esc(a.path || '—')}</b> im Explorer.`;
  if (a.type === 'media') return `Medienbefehl <b>${esc(MEDIA_LABEL[a.key] || a.key || '—')}</b> am PC.`;
  if (a.type === 'volume') return `Lautstärke <b>${esc(VOL_LABEL[a.dir] || a.dir || 'Lauter')}</b> am PC.`;
  if (a.type === 'mic') return a.scope === 'deaf' ? 'Schaltet <b>Discord Taub / Deafen</b> um (Live-Sync).' : (a.scope === 'output' && a.app ? `Schaltet Ton-Ausgabe von <b>${esc(a.app)}</b> stumm / wieder an.` : (a.scope === 'app' && a.app ? `Schaltet Mikrofon für <b>${esc(a.app)}</b> stumm / an${a.keys ? ` (Hotkey <b>${esc(a.keys)}</b>)` : ''}.` : 'Schaltet das Standard-Mikrofon systemweit stumm / wieder an.'));
  if (a.type === 'record') return 'Startet / stoppt die Aufnahme (Windows Game Bar, Win+Alt+R).';
  if (a.type === 'system') {
    const n = PRESET_LABEL[a.preset] || 'Sperren';
    const warn = PRESET_HARD.includes(a.preset)
      ? ' <span style="color:var(--danger);font-weight:600">Achtung: beendet laufende Programme.</span>' : '';
    return `Energie-Aktion <b>${esc(n)}</b> — wird sofort am PC ausgeführt.${warn}`;
  }
  if (a.type === 'page') return `Wechselt zur Seite <b>${esc(pageById(a.page)?.name || a.page || '—')}</b>.`;
  return esc(a.type);
}

/* Taste entfernen: fester Slot bleibt frei, andere Tasten rücken nicht nach. */
function removeTileAt(k) {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  const tile = (page.tiles || []).find((t) => t.key === k);
  if (!tile) return;
  page.tiles = page.tiles.filter((t) => t.key !== k);
  if (state.key === k) state.key = null;
  touch(); renderEditor(); renderInspector();
  toast(`Taste ${k + 1} entfernt`);
}

function deleteKey() {
  if (state.key == null) return;
  removeTileAt(state.key);
}

/* ============ Inspektor ============ */
function renderInspector() {
  const tile = currentTile();
  const insp = $('#insp');
  insp.classList.toggle('disabled', !tile);
  $('#keyNo').textContent = state.key == null ? '–' : String(state.key + 1);
  $('#prev').innerHTML = tile ? tileHtml(tile) : '<span class="hintline">Taste im Raster wählen</span>';
  if (tile) decorate(tile, $('#prev').firstElementChild);
  const sum = $('#actsum');
  if (sum) sum.innerHTML = tile ? actionSummary(tile) : 'Keine Taste gewählt.';

  const a = tile?.action || { type: 'none' };
  $('#atype').value = a.type || 'none';
  $('#keys').value = a.keys || 'Ctrl+Shift+M';
  $('#target').value = a.target || '';
  $('#openArgs').value = a.args || '';
  $('#thenKeys').value = (a.then && a.then.keys) || '';
  $('#thenDelay').value = Number(a.then && a.then.delayMs) ? Number(a.then.delayMs) : 800;
  $('#cmd').value = a.cmd || '';
  $('#cmdMode').value = a.mode === 'silent' ? 'silent' : 'window';
  if ($('#pathVal')) $('#pathVal').value = a.path || '';
  $('#mkey').value = a.key || 'playpause';
  $('#vdir').value = a.dir || 'up'; populateMicApps(a.app || ''); if ($('#micScope')) $('#micScope').value = (a.scope === 'output' || a.scope === 'deaf') ? a.scope : 'app'; if ($('#micKeys')) $('#micKeys').value = a.keys || '';
  $('#spreset').value = PRESET_LABEL[a.preset] ? a.preset : 'lock';
  $('#stateSrc').value = tile?.state || '';
  if ($('#appSearch')) $('#appSearch').value = state.appQ;
  state.color = tile?.color || '';
  const openBox = $('#fPageOpen');
  if (openBox) openBox.classList.toggle('hidden', !(a.type === 'page' && a.page && pageById(a.page)));
  renderPageTarget(a.type === 'page' ? a.page : '');
  renderSwatches();
  renderLogoGrid();
  toggleFields();
}

function renderPageTarget(sel) {
  const s = $('#pageTarget'); s.innerHTML = '';
  const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Seite wählen —'; s.append(o0);
  for (const p of state.layout.pages) {
    if (p.id === state.pageId) continue;
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; s.append(o);
  }
  s.value = sel || '';
}

function toggleFields() {
  const t = $('#atype').value;
  const show = (id, on) => { const n = $('#' + id); if (n) n.classList.toggle('hidden', !on); };
  show('fKeys', t === 'hotkey');
  show('fTarget', t === 'open' || t === 'app'); show('fAppExtract', t === 'app');
  show('fOpenArgs', t === 'open');
  show('fThen', t === 'open');
  show('fApps', t === 'open');
  show('fCmd', t === 'command');
  show('fPath', t === 'path');
  show('fMedia', t === 'media');
  show('fVol', t === 'volume'); show('fMic', t === 'mic'); const selApp = $('#micAppSelect')?.value || ''; const hasApp = selApp !== ''; show('micApp', t === 'mic' && selApp === '__custom__'); show('fMicAppWrap', t === 'mic' && hasApp); const ms = $('#micScope')?.value || 'app'; show('fMicKeyWrap', t === 'mic' && hasApp && ms === 'app'); const isDc = t === 'mic' && /discord/i.test(selApp === '__custom__' ? ($('#micApp')?.value || '') : selApp); show('discordRpcBox', isDc); if (isDc) refreshDiscordStatus();
  show('fSystem', t === 'system');
  show('fPage', t === 'page');
  if (t === 'open') renderAppList();
}

/* ============ Installierte Apps ============ */
function renderAppList() {
  const box = $('#appList');
  if (!box) return;
  if (state.scanning) { box.innerHTML = '<div class="hintline">Suche installierte Apps …</div>'; return; }
  if (!state.apps) { box.innerHTML = '<div class="hintline">Noch nicht gescannt. Button oben startet die Suche.</div>'; return; }
  if (state.appErr) { box.innerHTML = '<div class="hintline">App-Liste nicht verfügbar — Server zu alt?</div>'; return; }
  if (!state.apps.length) { box.innerHTML = '<div class="hintline">Keine Apps gefunden.</div>'; return; }

  const q = state.appQ.trim().toLowerCase();
  const hits = (q ? state.apps.filter((a) => a.name.toLowerCase().includes(q) || String(a.appid).toLowerCase().includes(q)) : state.apps).slice(0, 300);
  if (!hits.length) { box.innerHTML = '<div class="hintline">Kein Treffer für „' + esc(state.appQ) + '“.</div>'; return; }

  const cur = currentTile()?.action;
  const curTarget = cur?.type === 'open' ? cur.target : '';
  box.innerHTML = '';
  for (const app of hits) {
    const color = autoColor(app.name);
    const row = document.createElement('div');
    row.className = 'appitem' + (curTarget === 'shell:AppsFolder\\' + app.appid ? ' cur' : '');
    row.title = app.name + ' — ' + app.appid;
    row.innerHTML = `<span class="mdot" style="background:${color};color:${monoFg(color)}">${esc((app.name.trim()[0] || '?').toUpperCase())}</span>` +
      `<span class="an">${esc(app.name)}</span><span class="ai">${esc(app.appid)}</span>`;
    row.onclick = () => pickApp(app);
    box.append(row);
  }
}

/* Installierte Software -> neutrale Icon-Kategorie (keine Marken-Logos) */
const CAT_RULES = [
  [/spotify|music|foobar|winamp|deezer|soundcloud|audacity|amazon ?music/i, 'nv-music'],
  [/discord|teams|zoom|slack|skype|whatsapp|telegram|signal|element|voice|chat/i, 'nv-voice-chat'],
  [/chrome|edge|firefox|brave|opera|vivaldi|browser/i, 'nv-browser'],
  [/obs|streamlabs|xsplit|prism|stream/i, 'nv-stream'],
  [/steam|epic|battle|gog|riot|game|minecraft|unity|launcher/i, 'nv-games'],
  [/code|studio|devenv|idea|pycharm|sublime|terminal|powershell|cmd|git/i, 'nv-code'],
  [/photoshop|blender|figma|gimp|paint|affinity|krita|image/i, 'nv-image'],
  [/youtube|netflix|prime|plex|mpc|media ?player|vlc/i, 'nv-video'],
  [/explorer|files|commander/i, 'nv-folder'],
  [/word|excel|powerpoint|acrobat|pdf|libre/i, 'nv-file'],
  [/outlook|thunderbird|mail/i, 'nv-mail'],
  [/camera|webcam/i, 'nv-camera']
];

function categoryForApp(text) {
  const s = String(text || '');
  if (!s) return null;
  for (const [re, key] of CAT_RULES) if (re.test(s)) return key;
  return null;
}

function computeInstalledCategories(apps) {
  const set = new Set();
  for (const a of apps || []) {
    const key = categoryForApp(`${a.name || ''} ${a.appid || ''}`);
    if (key) set.add(key);
  }
  return set;
}

let appScanToken = 0;
async function scanApps(quiet) {
  const silent = quiet === true;
  const btn = $('#scanApps');
  const token = ++appScanToken;
  state.scanning = true;
  if (btn) { btn.disabled = true; btn.textContent = 'scanne …'; }
  renderAppList();
  try {
    const j = await api('/api/admin/apps');
    if (token !== appScanToken) return;
    const seen = new Set();
    state.apps = (Array.isArray(j.apps) ? j.apps : [])
      .filter((a) => a && a.name && a.appid)
      .filter((a) => { const k = a.name + '|' + a.appid; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    state.appErr = false;
    state.installedBrands = computeInstalledCategories(state.apps);
    if (!silent) toast(state.apps.length ? state.apps.length + ' installierte Apps gefunden' : 'Keine installierten Apps gefunden', !state.apps.length);
  } catch (e) {
    if (token !== appScanToken) return;
    state.apps = [];
    state.appErr = true;
    state.installedBrands = computeInstalledCategories([]);
    if (!silent) toast('App-Liste nicht verfügbar — Server zu alt? (' + e.message + ')', true);
  } finally {
    if (token === appScanToken) {
      state.scanning = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Installierte Apps scannen'; }
      renderAppList();
      if (state.libTab === 'brand') renderLogoGrid();
    }
  }
}

function brandForApp(text) {
  return categoryForApp(text);
}

function pickApp(app) {
  const tile = currentTile();
  if (!tile) { toast('Erst eine Taste im Raster wählen', true); return; }
  const name = String(app.name).trim();
  const letter = (name[0] || '?').toUpperCase();
  const brand = brandForApp(name + ' ' + app.appid);
  const color = autoColor(name);
  tile.action = { type: 'open', target: 'shell:AppsFolder\\' + app.appid };
  tile.logo = brand || 'letter';
  if (brand) { delete tile.letter; delete tile.color; state.color = ''; }
  else { tile.letter = letter; tile.color = color; state.color = color; }
  tile.label = name;
  state.appQ = '';
  if ($('#appSearch')) $('#appSearch').value = '';
  touch(); renderEditor(); renderInspector();
  toast('Kachel gesetzt: ' + name);
}

function webEntries() {
  const out = WEB_LINKS.map((w) => ({ key: w.key, label: w.label, url: w.url, slug: w.slug || null, img: null }));
  const seen = new Set(out.map((e) => String(e.url).replace(/\/+$/, '').toLowerCase()));
  for (const p of (state.layout?.pages || [])) {
    for (const t of (p.tiles || [])) {
      const a = t?.action;
      if (!a || a.type !== 'open') continue;
      const url = String(a.target || '');
      if (!/^https?:\/\//i.test(url)) continue;
      const norm = url.replace(/\/+$/, '').toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const key = (t.logo && LOGOS[t.logo]) ? t.logo : (LOGOS['nv-link'] ? 'nv-link' : 'browser');
      out.push({ key, label: String(t.label || siteHost(url) || url), url, slug: t.brand || null, img: t.img || null });
    }
  }
  return out;
}

function webMatch(entry, q) {
  const s = q.toLowerCase();
  return String(entry.label).toLowerCase().includes(s)
    || String(entry.key).toLowerCase().includes(s)
    || siteHost(entry.url).includes(s)
    || String(entry.url).toLowerCase().includes(s);
}

function renderLogoGrid() {
  const grid = $('#logoGrid'); grid.innerHTML = '';
  const q = state.logoQ.toLowerCase();
  const tile = currentTile();
  const brandWrap = $('#brandAllWrap');
  if (brandWrap) brandWrap.classList.toggle('hidden', state.libTab !== 'brand');
  if ($('#brandAll')) $('#brandAll').checked = !!state.brandAll;
  const webWrap = $('#webAddBox');
  if (webWrap) webWrap.classList.toggle('hidden', state.libTab !== 'web');
  const pcTools = document.getElementById('pcAppsTools'); if (pcTools) pcTools.hidden = state.libTab === 'system'; const pcMsg = document.getElementById('pcAppsMsg'); if (pcMsg && state.libTab === 'system') pcMsg.textContent = '';


  if (state.libTab === 'web') {
    for (const w of webEntries()) {
      if (q && !webMatch(w, q)) continue;
      const it = document.createElement('div');
      it.className = 'lib-item brand webcell' + (w.slug && tile?.brand === w.slug ? ' sel' : '');
      it.dataset.logo = w.key;
      it.dataset.url = w.url;
      if (w.slug) it.dataset.brand = w.slug;
      it.title = w.label + ' — ' + w.url;
      if (w.slug) {
        // Marken-Logo: lokaler EXE-Icon-Cache, sonst eigenes Icon als Fallback
        it.dataset.own = '1';
        it.innerHTML = brandMarkup(w.slug, 'libimg', 'style="width:74%;height:74%;object-fit:contain;pointer-events:none"');
      } else if (w.img) {
        // Eigener Link mit eigenem Bild, SVG als Fallback
        it.dataset.own = '1';
        it.innerHTML = `<img class="libimg" src="${esc(w.img)}" alt="" data-fb="${esc(svgFallback(w.key))}" ` +
          `onerror="this.onerror=null;this.outerHTML=this.dataset.fb||'';">`;
      } else {
        const d = LOGOS[w.key];
        if (!d) continue;
        it.innerHTML = `<svg class="ic" viewBox="0 0 24 24">${d.svg}</svg>`;
        if (d.brand) it.style.background = d.light ? 'linear-gradient(152deg,#F6F9FC,#D9E1EA)' : `linear-gradient(152deg,${d.brand},${d.brand2})`;
      }
      it.onclick = () => pickWeb(w);
      // Websites dürfen ins Raster gezogen werden (Logo + URL in einem Schritt)
      it.draggable = true;
      it.ondragstart = (e) => {
        state.dragLogo = w.key;
        e.dataTransfer.effectAllowed = 'copy';
        try {
          e.dataTransfer.setData('application/x-sp-web', JSON.stringify({ key: w.key, label: w.label, url: w.url, slug: w.slug }));
          e.dataTransfer.setData('text/plain', w.url);
        } catch { /* ignore */ }
      };
      it.ondragend = () => { state.dragLogo = null; };
      grid.append(it);
    }
    if (!grid.children.length) grid.innerHTML = '<div class="hintline">Keine Website gefunden</div>';
    sizeLogoGrid();
    return;
  }

  if (state.libTab === 'brand' || state.libTab === 'browser') {
    // "Software"/"Browser": ausschliesslich echte, installierte Apps aus /api/admin/installed-apps.
    const wantBrowser = state.libTab === 'browser';
    if (!installedApps) {
      grid.innerHTML = '<div class="hintline">Installierte Apps werden geladen ...</div>';
      loadInstalledApps().then(() => renderLogoGrid()).catch((e) => {
        grid.innerHTML = '<div class="hintline">App-Liste nicht verfuegbar: ' + esc(e.message || e) + '</div>';
      });
      sizeLogoGrid();
      return;
    }
    const apps = installedApps
      .filter((app) => (wantBrowser ? app.category === 'browser' : app.category !== 'browser'))
      .filter((app) => {
        if (!q) return true;
        const hay = (String(app.name || '') + ' ' + String(app.path || '')).toLowerCase();
        return hay.includes(q);
      });
    for (const app of apps) {
      const it = document.createElement('div');
      it.className = 'lib-item brand brandcell' + (tile?.action?.target === app.path ? ' sel' : '');
      it.dataset.logo = 'nv-app';
      it.title = app.name + ' – Klick setzt Öffnen-Aktion und Icon';
      it.draggable = true;
      const abbr = (app.name || '?').trim().slice(0, 2).toUpperCase(); it.innerHTML = `<img class="libimg" alt="" loading="lazy" decoding="async" hidden><span class="lib-fb">${esc(abbr)}</span><span class="lib-lbl">${esc(app.name)}</span>`;
      it.ondragstart = (e) => {
        state.dragLogo = 'nv-app';
        e.dataTransfer.effectAllowed = 'copy';
        try {
          e.dataTransfer.setData('application/x-sp-app', JSON.stringify({ name: app.name, path: app.path, iconPath: app.iconPath || app.path, kind: app.kind }));
          e.dataTransfer.setData('text/plain', app.name);
        } catch { /* ignore */ }
      };
      it.ondragend = () => { state.dragLogo = null; };
      it.onclick = () => pickPcApp(app);
      grid.append(it);
      observeAppIcon(it, app);



    }
    const hint = document.createElement('div');
    hint.className = 'hintline';
    hint.style.gridColumn = '1/-1';
    hint.textContent = wantBrowser
      ? 'Installierte Browser. Klick setzt die Öffnen-Aktion.'
      : 'Nur installierte Apps (EXE/Store). Klick setzt die Öffnen-Aktion; Symbole bleiben für Steuerung.';
    grid.append(hint);
    if (!grid.querySelector('.lib-item')) {
      grid.innerHTML = '<div class="hintline">' + (wantBrowser ? 'Kein installierter Browser gefunden.' : 'Keine installierte App gefunden.') + '</div>';
    }
    sizeLogoGrid();
    return;
  }

  let shown = 0;
  for (const [key, d] of Object.entries(LOGOS)) { if (!key.startsWith('nv-') || key === 'nv-mic-off') continue;
    if (state.libTab === 'featured') { if (!FEATURED.includes(key)) continue; }
    if (q && !d.label.toLowerCase().includes(q) && !key.includes(q)) continue;
    shown++;
    const it = document.createElement('div');
    it.className = 'lib-item' + (tile?.logo === key ? ' sel' : '');
    it.dataset.logo = key;
    it.title = d.label + ' – ins Raster ziehen oder anklicken';
    it.draggable = true;
    it.ondragstart = (e) => {
      state.dragLogo = key;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('application/x-sp-logo', key); e.dataTransfer.setData('text/plain', key); } catch { /* ignore */ }
    };
    it.ondragend = () => { state.dragLogo = null; };
    it.innerHTML = `<svg class="ic" viewBox="0 0 24 24">${d.svg}</svg><span class="lib-lbl">${esc(d.label)}</span>`;



    it.onclick = () => setLogo(key);
    grid.append(it);
  }

  if (!grid.children.length) grid.innerHTML = '<div class="hintline">nichts gefunden</div>';
  sizeLogoGrid();
}

function pickWeb(link) {
  const tile = currentTile();
  if (!tile) { toast('Erst eine Taste im Raster wählen', true); return; }
  tile.logo = 'nv-app';
  tile.label = link.label;
  tile.action = { type: 'open', target: link.url };
  if (link.slug && brandPath(link.slug)) {
    // Lokale Marken-Bilddatei hat Vorrang, CDN-Bild wird dafür entfernt
    tile.brand = link.slug;
    delete tile.img;
  } else if (link.slug) {
    delete tile.brand;
    delete tile.img;
  } else {
    delete tile.brand;
    if (link.img) tile.img = link.img; else delete tile.img;
  }
  delete tile.letter;
  delete tile.color;
  state.color = '';
  touch(); renderEditor(); renderInspector(); renderLogoGrid();
  toast('Kachel gesetzt: ' + link.label);
}

/* SVG-Fallback für Favicon-Kacheln im Editor */
function svgFallback(key) {
  const d = LOGOS[key] || LOGOS.tool;
  return `<svg class="ic" viewBox="0 0 24 24">${d.svg}</svg>`;
}

/* Eigene Website als Kachel im aktuellen Raster */
function addCustomSite() {
  const page = currentPage();
  if (!page || page.type === 'mixer') { toast('Erst eine Seite im Raster wählen', true); return; }
  const url = normalizeSiteUrl($('#webUrl') ? $('#webUrl').value : '');
  if (!url) { toast('Bitte vollständige URL angeben', true); return; }
  const typed = ($('#webName') ? $('#webName').value : '').trim();
  const label = (typed || siteHost(url) || url).slice(0, 24);
  const key = LOGOS['nv-link'] ? 'nv-link' : 'browser';
  page.tiles = page.tiles || [];
  const cols = page.cols || 5, rows = page.rows || 4, total = cols * rows;
  let slot = null;
  for (let i = 0; i < total; i++) { if (!page.tiles.some((t) => t.key === i)) { slot = i; break; } }
  if (slot == null) slot = page.tiles.reduce((m, t) => Math.max(m, Number(t.key) || 0), -1) + 1;
  const tile = { key: slot, logo: key, label, action: { type: 'open', target: url } };
  const fav = siteFavicon(url);
  if (fav) tile.img = fav;
  page.tiles.push(tile);
  state.key = slot;
  if ($('#webUrl')) $('#webUrl').value = '';
  if ($('#webName')) $('#webName').value = '';
  touch(); renderEditor(); renderInspector(); renderLogoGrid();
  toast('Website hinzugefügt: ' + label);
}

function sizeLogoGrid() {
  const g = $('#logoGrid');
  if (!g) return;
  const cs = getComputedStyle(g);
  const gap = parseFloat(cs.columnGap) || 5;
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const avail = g.clientWidth - pad;
  if (avail <= 0) return;
  let cols = 3; const sizeFor = (c) => Math.floor((avail - gap * (c - 1)) / c); while (cols > 2 && sizeFor(cols) < 72) cols--; while (cols < 4 && sizeFor(cols) > 110) cols++; const size = Math.max(64, Math.min(110, sizeFor(cols))); g.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`; g.style.gridAutoRows = 'auto'; g.style.justifyContent = 'start'; return;







}

let libObserver = null;
function watchLogoGrid() {
  const g = $('#logoGrid');
  if (!g || typeof ResizeObserver === 'undefined') return;
  if (libObserver) libObserver.disconnect();
  libObserver = new ResizeObserver(() => sizeLogoGrid());
  libObserver.observe(g.parentElement || g);
}

function setLogo(key) {
  const tile = currentTile();
  if (!tile) return;
  tile.logo = key; delete tile.appIcon; delete tile.img; delete tile.brand; delete tile.letter; applyDefaultSymbolAction(tile, key, false); savePages(); renderInspector();
  touch(); renderEditor();
  $('#prev').innerHTML = tileHtml(tile);
  decorate(tile, $('#prev').firstElementChild);
  $$('#logoGrid .lib-item').forEach((n) => n.classList.toggle('sel', n.dataset.logo === key));
}

function renderSwatches() {
  const box = $('#sws'); box.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'sw' + (c.v ? '' : ' none') + ((state.color || '') === c.v ? ' sel' : '');
    b.title = c.n;
    if (c.v) b.style.background = c.v;
    b.onclick = () => { state.color = c.v; applyInspector(true); };
    box.append(b);
  }
}

function applyInspector(rerender = true, strict = false) {
  const tile = currentTile();
  if (!tile) return;
  const type = $('#atype').value;
  if (type === 'none') {
    delete tile.action;
  } else {
    const a = { type };
    if (type === 'hotkey') a.keys = $('#keys').value.trim() || 'Ctrl+Shift+M';
    if (type === 'app') { const tgt = $('#target').value.trim(); a.target = tgt; a.kind = (tile.action?.type === 'app' && tile.action?.target === tgt && tile.action?.kind) ? tile.action.kind : appKindFromPath(tgt); } if (type === 'open') {
      a.target = $('#target').value.trim();
      const args = $('#openArgs').value.trim();
      if (args) a.args = args;
      const keys = $('#thenKeys').value.trim();
      if (keys) {
        const ms = Number($('#thenDelay').value);
        a.then = { keys, delayMs: Number.isFinite(ms) ? Math.max(0, Math.min(5000, Math.round(ms))) : 800 };
      }
    }
    if (type === 'command') {
      a.cmd = $('#cmd').value.trim();
      a.mode = $('#cmdMode').value === 'silent' ? 'silent' : 'window';
    }
    if (type === 'path') {
      const p = ($('#pathVal')?.value || '').trim();
      if (!isAbsPath(p)) {
        // Ungültig: nichts speichern. Streng (Wechsel/Prüfen/Blur) zusätzlich Toast + Fokus.
        if (strict) { toast('Bitte absoluten Pfad angeben (z. B. D:\\Projekte)', true); $('#pathVal')?.focus(); }
        return;
      }
      a.path = p;
    }
    if (type === 'media') a.key = $('#mkey').value;
    if (type === 'volume') a.dir = $('#vdir').value; if (type === 'mic') { const sel = $('#micAppSelect')?.value || ''; const ma = (sel === '__custom__' ? ($('#micApp')?.value || '') : sel).trim(); const rawSc = $('#micScope')?.value || 'app'; a.scope = ma ? ((rawSc === 'output' || rawSc === 'deaf') ? rawSc : 'app') : 'system'; if (ma) a.app = ma; const mk = ($('#micKeys')?.value || '').trim(); if (mk && a.scope === 'app') a.keys = mk; }
    if (type === 'system') a.preset = $('#spreset').value || 'lock';
    if (type === 'page') a.page = $('#pageTarget').value;
    tile.action = a;
  }
  const st = $('#stateSrc').value;
  if (st) tile.state = st; else delete tile.state;
  if (state.color) tile.color = state.color; else delete tile.color;

  touch();
  if (rerender) { renderEditor(); renderInspector(); }
  else {
    $('#prev').innerHTML = tileHtml(tile);
    decorate(tile, $('#prev').firstElementChild);
    const sum = $('#actsum'); if (sum) sum.innerHTML = actionSummary(tile);
    const badge = document.querySelector(`#edgrid .tile[data-key="${tile.key}"] .actbadge`);
    if (badge) badge.textContent = badgeText(tile);
  }
}

/* ============ Verbindung ============ */
function appUrl(ip) {
  return `http://${ip || (state.nets[0] && state.nets[0].ip) || '127.0.0.1'}:${state.port || 47830}/app`;
}

function pairUrl() {
  const ip = (state.nets[0] && state.nets[0].ip) || '127.0.0.1';
  return state.code
    ? `novora://pair?ip=${ip}&port=${state.port || 47830}&code=${encodeURIComponent(state.code)}`
    : appUrl(ip);
}

/* Draws a QR into canvas cvId. On failure hides the canvas and shows the text fallback. */
function renderQr(cvId, fbId, urlId, url, px) {
  const cv = $('#' + cvId), fb = $('#' + fbId), ul = $('#' + urlId);
  if (ul) ul.textContent = url;
  if (!cv || !fb) return;
  try {
    if (!window.NovoraQR) throw new Error('QR-Modul nicht geladen');
    window.NovoraQR.toCanvas(cv, url, { px: px || 176 });
    cv.hidden = false; fb.hidden = true;
  } catch (e) {
    cv.hidden = true; fb.hidden = false;
    fb.textContent = 'QR nicht verfügbar – Adresse kopieren und im Handy öffnen.';
  }
}

function apkUrl() {
  const ip = (state.nets[0] && state.nets[0].ip) || '';
  if (!ip || ip.startsWith('127.')) return 'https://test.diviesx.de/downloads/novora.apk';
  return `http://${ip}:${state.port || 47830}/downloads/novora.apk`;
}

function renderApkQr() {
  const url = apkUrl();
  renderQr('apkQr', 'apkQrFb', 'apkQrUrl', url, 180);
  const link = $('#apkLink');
  if (link) link.href = url;
}

function renderPairQr() {
  renderQr('pairQr', 'pairQrFb', 'pairQrUrl', pairUrl(), 200);
}

function renderConnQr() {
  const ip = state.qrIp || (state.nets[0] && state.nets[0].ip);
  // Haupt-QR ist #pairQr oben; der IP-QR erscheint nur nach Klick in der IP-Liste.
  const wrap = $('#connQrWrap');
  if (wrap) wrap.style.display = state.qrIp ? '' : 'none';
  if (state.qrIp) renderQr('connQr', 'connQrFb', 'connQrUrl', appUrl(ip), 156);
  $$('#ipList .iprow').forEach((r) => r.classList.toggle('sel', r.dataset.ip === ip));
}

function renderConn(ov) {
  $('#pcname').textContent = ov.name || 'PC';
  $('#hostname').textContent = '127.0.0.1:' + ov.port;
  $('#port').textContent = 'Port ' + ov.port;
  const disc = ov.discoveryPort || 47831;
  $('#discoveryTxt').textContent = `UDP ${disc} · Broadcast alle 3 s`;
  state.nets = ov.nets || [];
  state.port = ov.port || state.port;
  const list = $('#ipList'); list.innerHTML = '';
  const nets = ov.nets || [];
  if (!nets.length) {
    list.innerHTML = '<div class="hintline">keine IPv4-Netzwerke gefunden</div>';
    renderConnQr();
    return;
  }
  for (const n of nets) {
    const r = document.createElement('div');
    r.className = 'iprow';
    r.dataset.ip = n.ip;
    r.innerHTML = `<span class="ip">${esc(n.ip)}</span><span class="if">${esc(n.iface)} · ${esc(n.mask)}</span>`;
    const b = document.createElement('button');
    b.className = 'cpy'; b.textContent = 'kopieren';
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(n.ip); toast('IP kopiert: ' + n.ip); }
      catch { toast('Kopieren nicht möglich', true); }
    };
    const q = document.createElement('button');
    q.className = 'cpy'; q.textContent = 'QR'; q.title = `QR für ${n.ip}`;
    q.onclick = () => { state.qrIp = n.ip; renderConnQr(); };
    r.append(b, q); list.append(r);
  }
  renderConnQr();
}

function renderDevices() {
  const box = $('#devices'); if (!box) return; box.innerHTML = ''; const dc = $('#devCount'); if (dc) dc.textContent = String(state.devices.length); const cd = $('#cntDev'); if (cd) cd.textContent = String(state.devices.length); if (!state.devices.length) { box.innerHTML = '<div class="note" style="margin:0">Noch kein Gerät gekoppelt.</div>'; return; } const tbl = document.createElement('table'); tbl.className = 'dev-table'; tbl.innerHTML = '<thead><tr><th>Gerät</th><th>Status</th><th>Letzter Kontakt</th><th>Aktion</th></tr></thead><tbody></tbody>'; const tb = tbl.querySelector('tbody'); for (const d of state.devices) { const tr = document.createElement('tr'); tr.innerHTML = `<td><b>${esc(d.name)}</b></td><td><span class="tag" style="color:var(--ok);border-color:rgba(52,211,153,.4)">gekoppelt</span></td><td>${esc(new Date(d.last).toLocaleString('de-DE'))}</td><td></td>`; const b = document.createElement('button'); b.className = 'rev'; b.type = 'button'; b.textContent = 'Entfernen'; b.onclick = async () => { try { const j = await api('/api/admin/revoke', { method: 'POST', body: JSON.stringify({ id: d.id }) }); state.devices = j.devices || []; renderDevices(); toast('Gerät entfernt'); } catch (e) { toast('Entfernen fehlgeschlagen: ' + e.message, true); } }; tr.lastElementChild.append(b); tb.append(tr); } box.append(tbl); return;




  if (!state.devices.length) { box.innerHTML = '<div class="note" style="margin:0">Noch kein Gerät gekoppelt.</div>'; return; }
  for (const d of state.devices) {
    const r = document.createElement('div');
    r.className = 'dev';
    r.innerHTML = `<span class="dot"></span><div class="dn"><b>${esc(d.name)}</b><small>zuletzt ${new Date(d.last).toLocaleString('de-DE')}</small></div>`;
    const b = document.createElement('button');
    b.className = 'rev'; b.textContent = 'Entfernen';
    b.onclick = async () => {
      try {
        const j = await api('/api/admin/revoke', { method: 'POST', body: JSON.stringify({ id: d.id }) });
        state.devices = j.devices || [];
        renderDevices();
        toast('Gerät entfernt');
      } catch (e) { toast('Entfernen fehlgeschlagen: ' + e.message, true); }
    };
    r.append(b); box.append(r);
  }
}

function showCode(code) {
  const box = $('#codeBox'); if (!box) return; const ttl = $('#codeTtl'); if (!code) { box.classList.add('empty'); box.innerHTML = '<b>–</b>'.repeat(6); if (ttl) ttl.textContent = '–'; if (state.codeTimer) { clearInterval(state.codeTimer); state.codeTimer = null; } renderPairQr(); return; } box.classList.remove('empty'); box.innerHTML = [...String(code)].map((c) => `<b>${esc(c)}</b>`).join(''); if (ttl) ttl.textContent = '120 s'; renderPairQr(); return;
  if (!code) { box.classList.add('empty'); box.innerHTML = '<b>–</b>'.repeat(6); renderPairQr(); return; }
  box.classList.remove('empty');
  box.innerHTML = [...String(code)].map((c) => `<b>${esc(c)}</b>`).join('');
  renderPairQr();
}

async function measureLatency(verbose = true) {
  const times = [];
  try {
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await api('/api/admin/overview');
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    let extra = '';
    try {
      const st = await api('/api/admin/stats');
      if (st && st.count) extra = ` · Geräte p50 ${st.p50} / p95 ${st.p95} ms`;
    } catch { /* optional */ }
    $('#latRes').innerHTML = `⌀ <b>${avg.toFixed(1)} ms</b> · min ${min.toFixed(1)} ms${extra}`;
    $('#latPill').textContent = `Latenz ${avg.toFixed(1)} ms`;
    if (verbose) toast(`Latenz ⌀ ${avg.toFixed(1)} ms`);
  } catch (e) {
    $('#latRes').textContent = 'Messung fehlgeschlagen';
    if (verbose) toast('Latenz-Test fehlgeschlagen: ' + e.message, true);
  }
}

/* ============ Design ============ */
function applyDesign() {
  const d = state.design;
  if (d.palette === 'graphite') document.documentElement.removeAttribute('data-pal');
  else document.documentElement.setAttribute('data-pal', d.palette);
  const root = document.documentElement.style;
  root.setProperty('--accent', d.accent);
  root.setProperty('--accent-soft', hexA(d.accent, 0.15));
  root.setProperty('--r-tile', d.radius + 'px');
}

function renderDesign() {
  const pp = $('#palPresets'); if (!pp) return; pp.innerHTML = '';
  for (const [id, p] of Object.entries(PAL)) {
    const b = document.createElement('button');
    b.className = 'preset' + (state.design.palette === id ? ' sel' : '');
    b.style.background = `linear-gradient(135deg,${p.swatch},${p.accent})`;
    b.title = p.name;
    b.onclick = () => { state.design.palette = id; state.design.accent = p.accent; applyDesign(); renderDesign(); touchSettings(); };
    pp.append(b);
  }
  const ap = $('#accentPresets'); ap.innerHTML = '';
  for (const c of ACCENTS) {
    const b = document.createElement('button');
    b.className = 'preset' + (state.design.accent.toLowerCase() === c.toLowerCase() ? ' sel' : '');
    b.style.background = c;
    b.title = c;
    b.onclick = () => { state.design.accent = c; applyDesign(); renderDesign(); touchSettings(); };
    ap.append(b);
  }
  $('#radius').value = state.design.radius;
  $('#radiusVal').textContent = state.design.radius;

  const demo = [{ logo: 'mic', state: 'mic' }, { logo: 'volume', state: 'volume' }, { logo: 'spotify' }, { logo: 'rec', state: 'recording' }];
  $('#designPrev').innerHTML = demo.map(tileHtml).join('');
  $$('#designPrev .tile').forEach((n, i) => decorate(demo[i], n));
}

/* ============ Reiter & Kopplungs-Anfragen ============ */
const TABS = ['editor', 'conn', 'devices']; async function requestPairCodeAuto() { if (state.code && state.codeUntil > Date.now() + 5000) return; try { const j = await api('/api/pair/request', { method: 'POST' }); state.code = j.code; state.codeUntil = Date.now() + 120000; showCode(j.code); if (state.codeTimer) clearInterval(state.codeTimer); state.codeTimer = setInterval(() => { const left = Math.max(0, Math.ceil((state.codeUntil - Date.now()) / 1000)); const ttl = $('#codeTtl'); if (ttl) ttl.textContent = left > 0 ? left + ' s' : 'abgelaufen'; if (left <= 0) { state.code = null; showCode(null); } }, 1000); } catch { /* ignore auto error */ } }

function setTab(name) {
  if (!TABS.includes(name)) return;
  state.tab = name;
  $$('.rail-it').forEach((n) => n.classList.toggle('active', n.dataset.tab === name));
  $$('.panes > .pane').forEach((n) => n.classList.toggle('active', n.dataset.pane === name));
  // Verbinden ist der einzige Kopplungs-Bereich: QR + Code + offene Anfragen.
  if (name === 'conn') { startPairPoll(); requestPairCodeAuto(); renderPairQr(); renderApkQr(); renderConnQr(); }
  else stopPairPoll();
  if (name === 'devices') renderDevices();
  if (name === 'editor') { sizeLogoGrid(); fitEditorGrid(); }
  if (name === 'editor') { sizeLogoGrid(); fitEditorGrid(); }
}

function stopPairPoll() {
  if (state.pairTimer) { clearInterval(state.pairTimer); state.pairTimer = null; }
}

function startPairPoll() {
  stopPairPoll();
  loadPairs();
  state.pairTimer = setInterval(loadPairs, 3000);
}

function renderPairs() {
  const box = $('#pairReq');
  const n = state.pairs.length;
  const badge = $('#pairBadge');
  if (badge) { badge.textContent = String(n); badge.classList.toggle('on', n > 0); }
  const cnt = $('#pairCount');
  if (cnt) cnt.textContent = String(n);
  if (!box) return;
  if (!n) { box.innerHTML = '<div class="preq-empty">Keine offenen Anfragen.</div>'; return; }
  box.innerHTML = '';
  for (const r of state.pairs) {
    const row = document.createElement('div');
    row.className = 'preq';
    const age = r.ageSec != null ? `seit ${r.ageSec} s` : 'gerade eben';
    row.innerHTML = `<div class="pn"><b>${esc(r.device || 'Gerät')}</b><small>${esc(r.ip || '—')} · ${esc(age)}</small></div>`;
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'ok'; ok.textContent = 'Annehmen';
    ok.onclick = () => decidePair(r.id, true);
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'no'; no.textContent = 'Ablehnen';
    no.onclick = () => decidePair(r.id, false);
    row.append(ok, no);
    box.append(row);
  }
}

async function loadPairs() {
  if (state.tab !== 'conn' || document.hidden) return;
  try {
    const j = await api('/api/admin/pair/requests');
    if (state.tab !== 'conn') return;
    state.pairs = Array.isArray(j.requests) ? j.requests : [];
    renderPairs();
  } catch { /* Server zu alt oder gerade nicht erreichbar */ }
}

async function refreshOverview() {
  try {
    const ov = await api('/api/admin/overview');
    state.devices = ov.devices || [];
    const n = ov.latencyClients ?? 0; $('#livePill').textContent = n + ' live'; if ($('#bezelLive')) $('#bezelLive').textContent = '● ' + n + ' live';
    $('#liveClients').textContent = ov.latencyClients ?? 0;
    renderDevices();
  } catch { /* optional */ }
}

async function decidePair(id, allow) {
  if (!id || state.pairBusy) return;
  state.pairBusy = true;
  try {
    await api('/api/admin/pair/' + (allow ? 'allow' : 'deny'), { method: 'POST', body: JSON.stringify({ id }) });
    state.pairs = state.pairs.filter((x) => x.id !== id);
    renderPairs();
    if (allow) {
      toast('Gerät bestätigt');
      await refreshOverview();
    
    
    } else {
      toast('Anfrage abgelehnt');
    }
  } catch (e) {
    toast((allow ? 'Bestätigen' : 'Ablehnen') + ' fehlgeschlagen: ' + e.message, true);
  } finally {
    state.pairBusy = false;
    if (state.tab === 'conn') loadPairs();
  }
}

/* ============ Lizenz ============ */
const LICENSE_PLANS = { solo: 'Solo', duo: 'Duo', family: 'Familie', team: 'Team', business: 'Business' };
let licBusy = false;
let licReleaseArmed = false;
let licReleaseTimer = null;

function licPlanName(plan) {
  if (!plan) return '–';
  const k = String(plan).toLowerCase();
  if (LICENSE_PLANS[k]) return LICENSE_PLANS[k];
  return String(plan).charAt(0).toUpperCase() + String(plan).slice(1);
}

function licDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderLicense(s) {
  if (!s || !$('#licStatus')) return;
  const st = $('#licStatus');
  st.textContent = s.licensed ? 'lizenziert' : 'nicht lizenziert';
  st.style.color = s.licensed ? 'var(--ok)' : 'var(--warn)';
  $('#licPlan').textContent = licPlanName(s.plan);
  // "Gültig bis" = Key-Laufzeit; nur wenn unbekannt (alte license.json), Token-Datum.
  $('#licExp').textContent = s.licenseExpiresAt === null ? 'unbegrenzt' : licDate(s.licenseExpiresAt || s.expiresAt);
  $('#licKey').textContent = s.keyHint ? '…' + String(s.keyHint) : '–';
  renderLicToken(s);

  let note;
  if (s.error) note = s.error;
  else if (s.lastCheck) note = 'Zuletzt geprüft: ' + new Date(s.lastCheck).toLocaleString('de-DE');
  else note = 'Der Key wird lokal geprüft; der Lizenzserver wird alle 6 Stunden gefragt.';
  $('#licNote').textContent = note;
}

// Kleine Zeile unter der Karte: Token ist nur die 7-Tage-Berechtigung.
function renderLicToken(s) {
  const card = $('#licenseCard');
  if (!card) return;
  let el = document.getElementById('licToken');
  if (!el) {
    el = document.createElement('div');
    el.className = 'note';
    el.id = 'licToken';
    el.style.marginTop = '4px';
    const note = $('#licNote');
    if (note && note.parentNode === card) card.insertBefore(el, note);
    else card.appendChild(el);
  }
  const tokenEnd = s.expiresAt ? licDate(s.expiresAt) : null;
  el.textContent = tokenEnd
    ? 'Token gültig bis ' + tokenEnd + ' · wird automatisch erneuert'
    : 'Token wird bei bestehender Verbindung automatisch erneuert';
}

async function loadLicenseStatus() {
  if (!$('#licenseCard')) return;
  try {
    const s = await api('/api/license/local/status');
    renderLicense(s);
  } catch (e) {
    const st = $('#licStatus');
    if (st) { st.textContent = 'nicht erreichbar'; st.style.color = 'var(--warn)'; }
    $('#licNote').textContent = 'Lizenzstatus nicht abrufbar: ' + e.message;
  }
}

async function licCheckNow() {
  if (licBusy) return;
  licBusy = true;
  const btn = $('#licCheck');
  btn.disabled = true;
  btn.textContent = 'Prüfe …';
  try {
    const r = await api('/api/license/local/check', { method: 'POST', body: '{}' });
    const status = r.status || {};
    renderLicense(status);
    toast(status.error || (status.licensed ? 'Lizenz geprüft' : 'Lizenz nicht gültig'), !!status.error || !status.licensed);
  } catch (e) {
    toast('Prüfen fehlgeschlagen: ' + e.message, true);
  } finally {
    licBusy = false;
    btn.disabled = false;
    btn.textContent = 'Jetzt prüfen';
  }
}

function licDisarmRelease() {
  licReleaseArmed = false;
  const btn = $('#licRelease');
  if (btn) btn.textContent = 'Gerät freigeben';
  if (licReleaseTimer) { clearTimeout(licReleaseTimer); licReleaseTimer = null; }
}

async function licRelease() {
  if (licBusy) return;
  const btn = $('#licRelease');

  if (!licReleaseArmed) {
    licReleaseArmed = true;
    btn.textContent = 'Wirklich freigeben? Erneut klicken';
    $('#licNote').textContent = 'Freigeben trennt die Lizenz von diesem PC. Erneut klicken zum Bestätigen.';
    licReleaseTimer = setTimeout(licDisarmRelease, 6000);
    return;
  }

  licDisarmRelease();
  licBusy = true;
  btn.disabled = true;
  $('#licNote').textContent = 'Gerät wird freigegeben …';
  try {
    const r = await api('/api/license/local/deactivate', { method: 'POST', body: '{}' });
    toast(r.warning || 'Gerät freigegeben', !!r.warning);
    location.assign('/activate');
  } catch (e) {
    toast('Freigeben fehlgeschlagen: ' + e.message, true);
    $('#licNote').textContent = 'Freigeben fehlgeschlagen: ' + e.message;
  } finally {
    licBusy = false;
    btn.disabled = false;
  }
}

const licCheckBtn = $('#licCheck');
if (licCheckBtn) licCheckBtn.onclick = licCheckNow;
const licChangeBtn = $('#licChange');
if (licChangeBtn) licChangeBtn.onclick = () => location.assign('/activate');
const licReleaseBtn = $('#licRelease');
if (licReleaseBtn) licReleaseBtn.onclick = licRelease;

/* ============ Boot & Events ============ */
async function boot() {
  try {
    const ov = await api('/api/admin/overview');
    $('#ver').textContent = 'v' + ov.version;
    state.devices = ov.devices || [];
    const n = ov.latencyClients ?? 0; $('#livePill').textContent = n + ' live'; if ($('#bezelLive')) $('#bezelLive').textContent = '● ' + n + ' live';
    $('#liveClients').textContent = ov.latencyClients ?? 0;
    renderConn(ov);
    renderDevices();

    const l = await api('/api/admin/layout');
    state.layout = l;
    const s = l.settings || {};
    state.design = {
      palette: PAL[s.palette] ? s.palette : 'graphite',
      accent: s.accent || PAL[s.palette]?.accent || PAL.graphite.accent,
      radius: Number(s.radius) || 14
    };
    state.pageId = (l.pages.find((p) => p.type !== 'mixer') || l.pages[0])?.id;

    const ap = $('#autoPair');
    if (ap) {
      ap.checked = s.autoPair !== false;
      ap.onchange = async () => {
        await api('/api/admin/save', { method: 'POST', body: JSON.stringify({ settings: { autoPair: ap.checked } }) });
        toast(ap.checked ? 'Automatisch koppeln an' : 'Nur mit Code');
      };
    }

    const req = $('#requireApproval');
    if (req) {
      req.checked = s.requireApproval !== false;
      req.onchange = async () => {
        await saveSettingsPatch({ requireApproval: req.checked }, 'Bestätigung');
        if (req.checked) toast('Neue Geräte müssen bestätigt werden');
        else toast('Bestätigung aus – Geräte koppeln direkt');
      };
    }

    applyDesign();
    renderDesign();
    renderPages();
    renderEditor();
    autoSelectFirst();
    renderInspector();
    setTab('editor');
    loadLicenseStatus();
    measureLatency(false);
  } catch (e) {
    toast('Laden fehlgeschlagen: ' + e.message, true);
  }
}

/* statische Events */
$('#reloadBtn').onclick = () => location.reload();
$('#saveBtn').onclick = async () => { if (await savePages()) toast('Layout gespeichert'); };
$('#addPage').onclick = addPage;
$('#tplClose').onclick = closeTplModal;
$('#tplCancel').onclick = closeTplModal;
$('#tplModal').addEventListener('click', (e) => { if (e.target === $('#tplModal')) closeTplModal(); });
document.addEventListener('keydown', (e) => {
  if (!tplOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeTplModal(); return; }
  if (e.key !== 'Tab') return;
  const items = [...$('#tplModal').querySelectorAll('.tpl-card, #tplClose, #tplFolder, #tplCancel')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$('#delKey').onclick = deleteKey;
$('#pageName').oninput = () => {
  const page = currentPage();
  if (!page || page.type === 'mixer') return;
  page.name = $('#pageName').value.trim() || 'Seite';
  renderPages();
  touch();
};
$('#testBtn').onclick = async () => {
  const tile = currentTile();
  if (!tile?.action) { toast('Taste hat keine Aktion', true); return; }
  try {
    const j = await api('/api/admin/test', { method: 'POST', body: JSON.stringify({ action: tile.action }) });
    if (j.ok === false) toast('Test fehlgeschlagen: ' + (j.error || 'Aktion abgelehnt'), true);
    else alert(`Aktion ausgelöst in ${j.ms} ms`);
  } catch (e) { toast('Test fehlgeschlagen: ' + e.message, true); }
};

$$('#colsStep .sb, #rowsStep .sb').forEach((b) => {
  b.onclick = () => {
    const page = currentPage();
    if (!page || page.type === 'mixer') return;
    const key = b.parentElement.id === 'colsStep' ? 'cols' : 'rows';
    const d = Number(b.dataset.d);
    page[key] = Math.max(3, Math.min(8, (page[key] || 5) + d));
    touch(); renderEditor(); renderInspector();
  };
});

let recActive = false;
let recField = 'keys';
let recButton = null;
function stopRec() {
  recActive = false;
  if (recButton) { recButton.classList.remove('on'); recButton.textContent = 'aufnehmen'; }
  recButton = null;
}
function bindRecorder(btnId, fieldId) {
  const btn = $('#' + btnId);
  if (!btn) return;
  btn.onclick = () => {
    if (recActive && recField === fieldId) { stopRec(); return; }
    stopRec();
    recActive = true; recField = fieldId; recButton = btn;
    btn.classList.add('on'); btn.textContent = 'drücken…';
    toast('Tastenkombination drücken');
  };
}
bindRecorder('recKey', 'keys');
bindRecorder('recThen', 'thenKeys');
window.addEventListener('keydown', (e) => {
  if (!recActive) return;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Win');
  let k = e.key;
  if (k === ' ') k = 'Space';
  else if (k === 'Escape') k = 'Esc';
  else if (k.startsWith('Arrow')) k = k.slice(5);
  else if (k.length === 1) k = k.toUpperCase();
  const combo = [...mods, k].join('+');
  const f = $('#' + recField);
  if (f) { f.value = combo; f.dispatchEvent(new Event('input', { bubbles: true })); }
  stopRec();
}, true);

$('#atype').onchange = () => { toggleFields(); applyInspector(true); };
$('#stateSrc').onchange = () => applyInspector(true);
$('#mkey').onchange = () => applyInspector(true);
function populateMicApps(selected) { const sel = $('#micAppSelect'); if (!sel) return; const presets = [{ v: 'Discord', l: 'Discord' }, { v: 'obs64', l: 'OBS Studio' }, { v: 'ms-teams', l: 'Microsoft Teams' }, { v: 'Spotify', l: 'Spotify' }, { v: 'chrome', l: 'Google Chrome' }, { v: 'msedge', l: 'Microsoft Edge' }, { v: 'firefox', l: 'Firefox' }]; const seen = new Set(presets.map((p) => p.v.toLowerCase())); for (const m of (state.layout?.mixer || [])) { const v = String(m.id || m.name || '').trim(); if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); presets.push({ v, l: m.name || v }); } } for (const app of (installedApps || [])) { const base = String(app.path || '').split(/[\\/]/).pop().replace(/\.exe$/i, '').trim(); const v = (base && !base.includes('!')) ? base : String(app.name || '').trim(); if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); presets.push({ v, l: app.name || v }); } } sel.innerHTML = '<option value="">Systemweit (alle Apps)</option>' + presets.map((p) => `<option value="${esc(p.v)}">${esc(p.l)}</option>`).join('') + '<option value="__custom__">Eigener Prozessname …</option>'; const cur = String(selected || '').trim(); if (!cur) { sel.value = ''; if ($('#micApp')) $('#micApp').value = ''; } else if ([...sel.options].some((o) => o.value.toLowerCase() === cur.toLowerCase())) { sel.value = [...sel.options].find((o) => o.value.toLowerCase() === cur.toLowerCase()).value; if ($('#micApp')) $('#micApp').value = ''; } else { sel.value = '__custom__'; if ($('#micApp')) $('#micApp').value = cur; } } $('#vdir').onchange = () => applyInspector(true); if ($('#micAppSelect')) $('#micAppSelect').onchange = () => { toggleFields(); applyInspector(true); }; if ($('#micScope')) $('#micScope').onchange = () => { toggleFields(); applyInspector(true); }; if ($('#micApp')) $('#micApp').oninput = () => applyInspector(false); if ($('#micKeys')) $('#micKeys').oninput = () => applyInspector(false); async function refreshDiscordStatus() { try { const st = await api('/api/admin/discord/status'); const b = $('#dcStatusBadge'); if (b) { b.textContent = st.authorized ? '● Live-Sync aktiv' : (st.connected ? '○ nicht autorisiert' : '○ nicht verbunden'); b.style.color = st.authorized ? 'var(--ok)' : 'var(--dim)'; b.style.borderColor = st.authorized ? 'rgba(52,211,153,.45)' : 'var(--line)'; } if (st.configured) { if ($('#dcClientId')) { if (st.clientId) $('#dcClientId').value = st.clientId; $('#dcClientId').disabled = true; } if ($('#dcClientSecret')) { $('#dcClientSecret').value = ''; $('#dcClientSecret').placeholder = 'Gespeichert (nicht sichtbar)'; $('#dcClientSecret').disabled = true; } } else { if ($('#dcClientId') && st.clientId && !$('#dcClientId').value) $('#dcClientId').value = st.clientId; if ($('#dcClientId')) $('#dcClientId').disabled = false; if ($('#dcClientSecret')) $('#dcClientSecret').disabled = false; } if ($('#dcDisconnectBtn')) $('#dcDisconnectBtn').classList.toggle('hidden', !st.authorized); if ($('#dcConnectBtn')) $('#dcConnectBtn').textContent = st.authorized ? 'Neu verbinden' : (st.configured ? 'Verbinden (gespeichert)' : 'Mit Discord verbinden'); if ($('#dcMsg')) $('#dcMsg').textContent = st.error || (st.authorized ? 'Synchronisiert Mute & Deafen live in beide Richtungen.' : (st.configured ? 'Gespeichert — Verbinden nutzt gespeicherte Zugangsdaten.' : '')); } catch {} } if ($('#dcConnectBtn')) $('#dcConnectBtn').onclick = async () => { const btn = $('#dcConnectBtn'), msg = $('#dcMsg'); btn.disabled = true; if (msg) msg.textContent = 'Warte auf Bestätigung in Discord …'; try { let st = await api('/api/admin/discord/status'); if (st.configured) { try { await api('/api/admin/discord/connect-stored', { method: 'POST', body: '{}' }); } catch (e) { await api('/api/admin/discord/connect', { method: 'POST', body: JSON.stringify({ clientId: ($('#dcClientId')?.value || '').trim(), clientSecret: ($('#dcClientSecret')?.value || '').trim() }) }); } } else { await api('/api/admin/discord/connect', { method: 'POST', body: JSON.stringify({ clientId: ($('#dcClientId')?.value || '').trim(), clientSecret: ($('#dcClientSecret')?.value || '').trim() }) }); } toast('Discord Live-Sync aktiv!'); await refreshDiscordStatus(); } catch (e) { if (msg) msg.textContent = 'Fehler: ' + (e.message || e); toast('Discord: ' + (e.message || e), true); } finally { btn.disabled = false; } }; if ($('#dcDisconnectBtn')) $('#dcDisconnectBtn').onclick = async () => { await api('/api/admin/discord/disconnect', { method: 'POST', body: '{}' }); toast('Discord getrennt'); await refreshDiscordStatus(); }; if ($('#micPresetDiscord')) $('#micPresetDiscord').onclick = () => { if ($('#micKeys')) { $('#micKeys').value = 'Ctrl+Shift+M'; applyInspector(true); } };
$('#spreset').onchange = () => applyInspector(true);
$('#pageTarget').onchange = () => applyInspector(true);
if ($('#pathVal')) {
  $('#pathVal').oninput = () => applyInspector(false);
  $('#pathVal').onchange = () => applyInspector(true, true);
}
if ($('#pathCheck')) {
  $('#pathCheck').onclick = () => {
    const v = ($('#pathVal')?.value || '').trim();
    if (!isAbsPath(v)) { toast('Bitte absoluten Pfad angeben (z. B. D:\\Projekte)', true); $('#pathVal')?.focus(); return; }
    applyInspector(true, true);
    toast('Pfad gültig: ' + v);
  };
}
if ($('#pageOpen')) {
  $('#pageOpen').onclick = () => {
    const a = currentTile()?.action;
    if (!a || a.type !== 'page' || !a.page) { toast('Keine Zielseite hinterlegt', true); return; }
    if (navTo(a.page, true)) toast('Ordner geöffnet: ' + (pageById(a.page)?.name || 'Seite'));
  };
}
$('#keys').oninput = () => applyInspector(false);
$('#target').oninput = () => applyInspector(false);
$('#openArgs').oninput = () => applyInspector(false);
$('#thenKeys').oninput = () => applyInspector(false);
$('#thenDelay').oninput = () => applyInspector(false);
$('#cmd').oninput = () => applyInspector(false);
$('#cmdMode').onchange = () => applyInspector(true);
  if ($('#scanApps')) $('#scanApps').onclick = scanApps;
if ($('#appSearch')) $('#appSearch').oninput = () => { state.appQ = $('#appSearch').value || ''; renderAppList(); }; const extBtn = $('#extractTargetBtn'); if (extBtn) extBtn.onclick = extractTargetExe;

$$('.lib-tabs .chip').forEach((c) => {
  c.onclick = () => {
    state.libTab = c.dataset.libt;
    $$('.lib-tabs .chip').forEach((x) => x.classList.toggle('on', x === c));
    renderLogoGrid();
    if (state.libTab === 'brand' && state.apps === null && !state.scanning && !state.brandAutoScan) {
      state.brandAutoScan = true;
      scanApps(true);
    } else if (!state.brandAll && state.installedBrands === null) {
      /* noch kein Scan: Filter leer, Hinweis im Grid */
    }
  };
});
if ($('#brandAll')) $('#brandAll').onchange = () => { state.brandAll = $('#brandAll').checked; renderLogoGrid(); };
$('#logoSearch').oninput = () => { state.logoQ = $('#logoSearch').value.trim(); renderLogoGrid(); };
if ($('#webAdd')) $('#webAdd').onclick = addCustomSite;
const pcAppsScanBtn = document.getElementById('pcAppsScan');
if (pcAppsScanBtn) pcAppsScanBtn.addEventListener('click', scanPcApps);
const pcAppsFgBtn = document.getElementById('pcAppsForeground');
if (pcAppsFgBtn) pcAppsFgBtn.addEventListener('click', pickForegroundApp);
['#webUrl', '#webName'].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSite(); } });
});
watchLogoGrid();
window.addEventListener('resize', sizeLogoGrid);

$('#newCode').onclick = async () => {
  try {
    const j = await api('/api/pair/request', { method: 'POST' }); state.code = j.code; state.codeUntil = Date.now() + 120000; showCode(j.code); if (state.codeTimer) clearInterval(state.codeTimer); state.codeTimer = setInterval(() => { const left = Math.max(0, Math.ceil((state.codeUntil - Date.now()) / 1000)); const ttl = $('#codeTtl'); if (ttl) ttl.textContent = left > 0 ? left + ' s' : 'abgelaufen'; if (left <= 0) { state.code = null; showCode(null); } }, 1000); return;
    state.code = j.code;
    showCode(j.code);
    setTimeout(() => { if (state.code === j.code) { state.code = null; showCode(null); } }, 120000);
  } catch (e) { toast('Code erzeugen fehlgeschlagen: ' + e.message, true); }
};
$('#latBtn').onclick = () => measureLatency(true);

if ($('#radius')) $('#radius').oninput = () => {
  state.design.radius = Number($('#radius').value) || 16;
  $('#radiusVal').textContent = state.design.radius;
  applyDesign();
  touchSettings();
};

$$('.rail-it[data-tab]').forEach((it) => {
  it.onclick = () => setTab(it.dataset.tab);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.tab === 'conn') loadPairs();
});

document.addEventListener('keydown', (e) => {
  if (tplOpen || recActive) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const el = e.target instanceof Element ? e.target : null;
  if (el && el.closest('input, select, textarea, [contenteditable="true"]')) return;
  const i = Number(e.key);
  if (!Number.isInteger(i) || i < 1 || i > TABS.length) return;
  e.preventDefault();
  setTab(TABS[i - 1]);
});

boot();
