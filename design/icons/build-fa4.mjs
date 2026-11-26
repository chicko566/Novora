// Baut iconset.js + brandset.js aus Font Awesome 4.7.0.
// Font Awesome 4.7.0 - Icons: SIL OFL 1.1, Code: MIT, https://fontawesome.com/v4/
//
// Datenquelle: cdnjs (CSS + SVG-Font). Zuordnung Klassenname -> Glyph laeuft
// ueber den Unicode-Codepoint, weil glyph-name nicht bei jedem Glyph gesetzt ist.
//
// WICHTIG: FA4-Glyphen liegen im Koordinatensystem 1792x1792 (Em-Box, Baseline
// bei y=1536). Die UI rendert mit viewBox="0 0 24 24", deshalb wird jeder Pfad
// mit <g transform="scale(24/1792) translate(0,128)"> umgerechnet; das translate
// zentriert die 1536 hohe Icon-Box in der 1792er Em-Box.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_WEB = path.join(ROOT, 'prototype', 'web');
const OUT_DESIGN = path.join(HERE, 'novora-icons');

const CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
const SVG_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.svg';

const LICENSE = 'Font Awesome 4.7.0 - Icons: SIL OFL 1.1, Code: MIT, https://fontawesome.com/v4/';
const HEAD = '// GENERIERT aus Font Awesome 4.7.0 - nicht haendisch pflegen.\n' +
  '// ' + LICENSE + '\n' +
  '// Generator: design/icons/build-fa4.mjs\n';

const css = await fetch(CSS_URL).then((r) => {
  if (!r.ok) throw new Error('CSS ' + r.status);
  return r.text();
});
const fontSvg = await fetch(SVG_URL).then((r) => {
  if (!r.ok) throw new Error('SVG ' + r.status);
  return r.text();
});

// glyph-Tag -> { code: <codepoint>, d: <pfaddaten> }
const byCode = new Map();
for (const tag of fontSvg.matchAll(/<glyph\b[^>]*\/?>/g)) {
  const t = tag[0];
  const u = /\bunicode="([^"]*)"/.exec(t);
  const d = /\bd="([^"]+)"/.exec(t);
  if (!u || !d) continue;
  let raw = u[1];
  let code = NaN;
  const ent = /^&#x([0-9a-fA-F]+);$/.exec(raw);
  if (ent) code = parseInt(ent[1], 16);
  else if (/^&amp;$/.test(raw)) continue;
  else if (raw.length === 1) code = raw.codePointAt(0);
  if (!Number.isFinite(code)) continue;
  if (!byCode.has(code)) byCode.set(code, d[1]);
}

// Klassenname -> codepoint (Aliase wie fa-remove zeigen auf denselben Codepoint)
const codeByName = new Map();
for (const m of css.matchAll(/\.fa-([a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-f]{4,6})"/g)) {
  const name = m[1];
  const code = parseInt(m[2], 16);
  if (!codeByName.has(name)) codeByName.set(name, code);
}

const SCALE = 24 / 1792;
const pathOf = (faName) => {
  const code = codeByName.get(faName);
  if (code === undefined) return null;
  return byCode.get(code) || null;
};
const svgOf = (faName) => {
  const d = pathOf(faName);
  if (!d) return null;
  return `<g transform="scale(${SCALE.toFixed(10)}) translate(0,128)"><path fill="currentColor" stroke="none" d="${d}"/></g>`;
};

// Schlüssel der UI -> Font-Awesome-4.7-Klassenname (fa-<name>)
const MAP = {
  mic: 'microphone', 'mic-off': 'microphone-slash', volume: 'volume-up', 'volume-low': 'volume-down',
  'volume-mute': 'volume-off', play: 'play', pause: 'pause', next: 'step-forward', prev: 'step-backward',
  stop: 'stop', record: 'circle', equalizer: 'signal', mixer: 'sliders', music: 'music', podcast: 'podcast',
  radio: 'rss', stream: 'video-camera', video: 'film', 'voice-chat': 'comments', 'video-call': 'video-camera',
  chat: 'comment', mail: 'envelope', calendar: 'calendar', bell: 'bell', contacts: 'users',
  settings: 'cog', power: 'power-off', restart: 'refresh', sleep: 'moon-o', lock: 'lock',
  monitor: 'desktop', keyboard: 'keyboard-o', headset: 'headphones', camera: 'camera', screenshot: 'crop',
  network: 'sitemap', cpu: 'hdd-o', printer: 'print', clipboard: 'clipboard', search: 'search',
  star: 'star', bolt: 'bolt', folder: 'folder', file: 'file-o', files: 'files-o', terminal: 'terminal',
  code: 'code', image: 'picture-o', notes: 'file-text-o', link: 'link', text: 'font', grid: 'th',
  app: 'cube', tool: 'wrench', store: 'shopping-cart', browser: 'globe', games: 'gamepad',
  gamepad: 'gamepad', editor: 'pencil', warning: 'exclamation-triangle', error: 'times-circle',
  info: 'info-circle', check: 'check', close: 'times', plus: 'plus', minus: 'minus',
  'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right', 'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down'
};

const LABELS = {
  mic: ['Mikrofon', 'Microphone'], 'mic-off': ['Mikrofon stumm', 'Mic muted'], volume: ['Lautstärke', 'Volume'],
  'volume-low': ['Leise', 'Quiet'], 'volume-mute': ['Stumm', 'Mute'], play: ['Play', 'Play'], pause: ['Pause', 'Pause'],
  next: ['Weiter', 'Next'], prev: ['Zurück', 'Previous'], stop: ['Stop', 'Stop'], record: ['Aufnahme', 'Record'],
  equalizer: ['Equalizer', 'Equalizer'], mixer: ['Mixer', 'Mixer'], music: ['Musik', 'Music'],
  podcast: ['Podcast', 'Podcast'], radio: ['Radio', 'Radio'], stream: ['Stream', 'Stream'], video: ['Video', 'Video'],
  'voice-chat': ['Sprach-Chat', 'Voice chat'], 'video-call': ['Video-Call', 'Video call'], chat: ['Chat', 'Chat'],
  mail: ['Mail', 'Mail'], calendar: ['Kalender', 'Calendar'], bell: ['Hinweis', 'Bell'], contacts: ['Kontakte', 'Contacts'],
  settings: ['Einstellungen', 'Settings'], power: ['Power', 'Power'], restart: ['Neustart', 'Restart'],
  sleep: ['Standby', 'Sleep'], lock: ['Sperren', 'Lock'], monitor: ['Monitor', 'Monitor'],
  keyboard: ['Tastatur', 'Keyboard'], headset: ['Headset', 'Headset'], camera: ['Kamera', 'Camera'],
  screenshot: ['Screenshot', 'Screenshot'], network: ['Netzwerk', 'Network'], cpu: ['System', 'System'],
  printer: ['Drucken', 'Print'], clipboard: ['Zwischenablage', 'Clipboard'], search: ['Suchen', 'Search'],
  star: ['Favorit', 'Star'], bolt: ['Schnell', 'Bolt'], folder: ['Ordner', 'Folder'], file: ['Datei', 'File'],
  files: ['Dateien', 'Files'], terminal: ['Terminal', 'Terminal'], code: ['Code', 'Code'], image: ['Bild', 'Image'],
  notes: ['Notizen', 'Notes'], link: ['Link', 'Link'], text: ['Text', 'Text'], grid: ['Raster', 'Grid'],
  app: ['App', 'App'], tool: ['Werkzeug', 'Tool'], store: ['Shop', 'Store'], browser: ['Browser', 'Browser'],
  games: ['Spiele', 'Games'], gamepad: ['Gamepad', 'Gamepad'], editor: ['Editor', 'Editor'],
  warning: ['Warnung', 'Warning'], error: ['Fehler', 'Error'], info: ['Info', 'Info'], check: ['OK', 'OK'],
  close: ['Schließen', 'Close'], plus: ['Hinzufügen', 'Add'], minus: ['Entfernen', 'Remove'],
  'arrow-left': ['Links', 'Left'], 'arrow-right': ['Rechts', 'Right'], 'arrow-up': ['Oben', 'Up'], 'arrow-down': ['Unten', 'Down']
};

const CAT = {
  medien: ['mic', 'mic-off', 'volume', 'volume-low', 'volume-mute', 'play', 'pause', 'next', 'prev', 'stop', 'record', 'equalizer', 'mixer', 'music', 'podcast', 'radio', 'stream', 'video'],
  kommunikation: ['voice-chat', 'video-call', 'chat', 'mail', 'calendar', 'bell', 'contacts'],
  system: ['settings', 'power', 'restart', 'sleep', 'lock', 'monitor', 'keyboard', 'headset', 'camera', 'screenshot', 'network', 'cpu', 'printer', 'clipboard'],
  dateien: ['search', 'star', 'bolt', 'folder', 'file', 'files', 'terminal', 'code', 'image', 'notes', 'link', 'text', 'grid', 'app', 'tool', 'store', 'browser', 'games', 'gamepad', 'editor', 'warning', 'error', 'info', 'check', 'close', 'plus', 'minus', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down']
};
const catOf = {};
for (const [c, keys] of Object.entries(CAT)) for (const k of keys) catOf[k] = c;

const out = {};
const missing = [];
for (const [key, faName] of Object.entries(MAP)) {
  const svg = svgOf(faName);
  if (!svg) { missing.push(key + '->' + faName); continue; }
  const [de, en] = LABELS[key] || [key, key];
  out[key] = { label: de, label_en: en, cat: catOf[key] || 'system', svg };
}

// Marken: nur Font Awesome 4.7 Brand-Glyphen, Schluessel = FA-Klassenname
const BRAND_MAP = {
  spotify: 'spotify', 'youtube-play': 'youtube-play', steam: 'steam', twitch: 'twitch',
  github: 'github', git: 'git', chrome: 'chrome', firefox: 'firefox', windows: 'windows',
  apple: 'apple', android: 'android', slack: 'slack', reddit: 'reddit', whatsapp: 'whatsapp',
  telegram: 'telegram', instagram: 'instagram', soundcloud: 'soundcloud', wordpress: 'wordpress',
  dropbox: 'dropbox'
};
const brandsOut = {};
const brandsMissing = [];
for (const [key, faName] of Object.entries(BRAND_MAP)) {
  const svg = svgOf(faName);
  if (!svg) { brandsMissing.push(key); continue; }
  brandsOut[key] = svg;
}

const iconsJs = HEAD + 'window.NOVORA_ICONS = ' + JSON.stringify(out, null, 1) + ';\n';
const brandsJs = HEAD + 'window.NOVORA_BRANDS = ' + JSON.stringify(brandsOut, null, 1) + ';\n';

fs.mkdirSync(OUT_WEB, { recursive: true });
fs.mkdirSync(OUT_DESIGN, { recursive: true });
fs.writeFileSync(path.join(OUT_WEB, 'iconset.js'), iconsJs, 'utf8');
fs.writeFileSync(path.join(OUT_DESIGN, 'iconset-fa4.js'), iconsJs, 'utf8');
fs.writeFileSync(path.join(OUT_WEB, 'brandset.js'), brandsJs, 'utf8');
fs.writeFileSync(path.join(OUT_DESIGN, 'brandset.js'), brandsJs, 'utf8');

console.log('icons', Object.keys(out).length, 'missing', missing.join(',') || '-');
console.log('brands', Object.keys(brandsOut).length, 'missing', brandsMissing.join(',') || '-');
