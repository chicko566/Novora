'use strict';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && isFinite(v);

const APP_VERSION = '0.2.0';
const RING_LEN = 283;

const state = {
  token: localStorage.getItem('sp_token') || '',
  info: null, layout: null, page: null, mixer: null,
  st: { mic: false, volume: 62, recording: false },
  lang: localStorage.getItem('sp_lang') || 'de',
  palette: localStorage.getItem('sp_pal') || 'graphite',
  lat: null, es: null, online: true,
  lastEventAt: 0, watchdog: null, licenseRequired: false, lastError: '',
  retryTimer: null, retryDelay: 1000, gridTimer: null,
  dragIds: new Set(), saveTimers: {}, pending: {}, suppressClick: 0, mixerHold: new Map(),
  confirmPower: null,
  history: [], opts: Object.assign({ gap: 8, radius: 16, numbers: true, swipe: true, haptics: true, osd: true, fullscreen: false, bg: '#06090D', gradient: true },
    JSON.parse(localStorage.getItem('sp_opts') || '{}'))
};

/* ---------- Texte ---------- */
const T = {
  de: {
    connect: 'Verbinden', connected: 'Verbunden', disconnect: 'Trennen', pair: 'Koppeln', pairTitle: 'PC koppeln',
    codeLabel: 'Kopplungscode', codeHint: 'Code im PC-Editor erzeugen (/pc) und hier eingeben.',
    codeInvalid: 'Code ungültig oder abgelaufen', codeMissing: 'Bitte 6 Ziffern eingeben', pairFailed: 'Koppeln fehlgeschlagen',
    thisPc: 'Dieser PC', status: 'Status', paired: 'gekoppelt', notPaired: 'nicht gekoppelt',
    connecting: 'Verbindung wird hergestellt…', retry: 'Erneut versuchen', connection: 'Verbindung',
    autoPairing: 'Automatisches Koppeln läuft …', autoFailed: 'Automatisches Koppeln ist am PC aus. Code eingeben.',
  scan: 'QR-Code scannen', scanHint: 'QR-Code aus dem PC-Editor in den Rahmen halten.', scanClose: 'Schließen',
  scanStarting: 'Kamera wird geöffnet …', scanNoCam: 'Kamera nicht verfügbar – IP manuell eingeben',
  scanBadQr: 'Kein Novora-QR – weiter scannen',
    settings: 'Einstellungen', language: 'Sprache', palette: 'Palette',
    back: 'Zurück', pages: 'Seiten', tileLabel: 'Taste',
    actOpen: 'Programm öffnen', actHotkey: 'Tastenkürzel', actMedia: 'Mediensteuerung',
    actVolume: 'Lautstärke', actMic: 'Mikrofon', actRecord: 'Aufnahme',
    actSystem: 'Systemaktion', actPage: 'Seite öffnen',
    palGraphite: 'Graphit', palViolet: 'Violett', palSage: 'Salbei',
    grid: 'Raster dieser Seite', cols: 'Spalten', rows: 'Zeilen', preview: 'Vorschau',
    gap: 'Tastenabstand', radiusOpt: 'Ecken', numbers: 'Zahlen', swipe: 'Wischen', haptics: 'Vibration', osd: 'Lautstärke-OSD', fullscreen: 'Vollbild', background: 'Hintergrund', gradient: 'Verlauf', off: 'Aus',
    previewNote: 'Tasten bleiben quadratisch und werden nie gequetscht.',
    close: 'Schließen', version: 'Version', mixer: 'Mixer', master: 'Master', sessions: 'Sessions',
    mute: 'Stummschalten', unmute: 'Ton an', appVolume: 'Lautstärke',
    mixerHint: 'Regler ziehen – sofort am PC hörbar. Werte kommen live über SSE.',
    offlineBanner: 'Offline – keine Verbindung zum PC. Neuer Versuch läuft…',
    licenseBanner: 'Lizenz auf dem PC aktivieren',
    on: 'an', muted: 'stumm', recording: 'Aufnahme läuft', idle: 'bereit',
    live: 'live', pressFailed: 'Tastendruck fehlgeschlagen',
    host: 'Host', pairNote: 'Nur Geräte im gleichen Netz. Nach dem Koppeln erscheinen die Tasten.',
    powerConfirm: 'Nochmal drücken', powerShutdown: 'Herunterfahren', powerRestart: 'Neustart',
    powerLogoff: 'Abmelden', powerLock: 'Sperren', powerScreenOff: 'Bildschirm aus',
    powerSleep: 'Energiesparen', powerHibernate: 'Ruhezustand',
    rotateHold: 'Gerät quer halten', rotateHint: 'Novora läuft auf dem Handy nur im Querformat.'
  },
  en: {
    connect: 'Connect', connected: 'Connected', disconnect: 'Disconnect', pair: 'Pair', pairTitle: 'Pair PC',
    codeLabel: 'Pairing code', codeHint: 'Generate the code in the PC editor (/pc) and enter it here.',
    codeInvalid: 'Code invalid or expired', codeMissing: 'Enter 6 digits', pairFailed: 'Pairing failed',
    thisPc: 'This PC', status: 'Status', paired: 'paired', notPaired: 'not paired',
    connecting: 'Connecting…', retry: 'Try again', connection: 'Connection',
    autoPairing: 'Automatic pairing…', autoFailed: 'Auto pairing is off on the PC. Enter the code.',
  scan: 'Scan QR code', scanHint: 'Hold the QR code from the PC editor inside the frame.', scanClose: 'Close',
  scanStarting: 'Opening camera…', scanNoCam: 'Camera not available – enter the IP manually',
  scanBadQr: 'Not a Novora QR code – keep scanning',
    settings: 'Settings', language: 'Language', palette: 'Palette',
    back: 'Back', pages: 'Pages', tileLabel: 'Key',
    actOpen: 'Open app', actHotkey: 'Hotkey', actMedia: 'Media control',
    actVolume: 'Volume', actMic: 'Microphone', actRecord: 'Recording',
    actSystem: 'System action', actPage: 'Open page',
    palGraphite: 'Graphite', palViolet: 'Violet', palSage: 'Sage',
    grid: 'Grid of this page', cols: 'Columns', rows: 'Rows', preview: 'Preview',
    gap: 'Tile gap', radiusOpt: 'Corners', numbers: 'Numbers', swipe: 'Swipe', haptics: 'Vibration', osd: 'Volume OSD', fullscreen: 'Fullscreen', background: 'Background', gradient: 'Gradient', off: 'Off',
    previewNote: 'Keys stay square and are never squeezed.',
    close: 'Close', version: 'Version', mixer: 'Mixer', master: 'Master', sessions: 'sessions',
    mute: 'Mute', unmute: 'Unmute', appVolume: 'Volume',
    mixerHint: 'Drag a slider – audible on the PC immediately. Values arrive live via SSE.',
    offlineBanner: 'Offline – no connection to the PC. Retrying…',
    licenseBanner: 'Activate the license on the PC',
    on: 'on', muted: 'muted', recording: 'Recording', idle: 'idle',
    live: 'live', pressFailed: 'Key press failed',
    host: 'Host', pairNote: 'Same network only. Keys appear after pairing.',
    powerConfirm: 'Press again', powerShutdown: 'Shut down', powerRestart: 'Restart',
    powerLogoff: 'Sign out', powerLock: 'Lock', powerScreenOff: 'Screen off',
    powerSleep: 'Sleep', powerHibernate: 'Hibernate',
    rotateHold: 'Hold the device sideways', rotateHint: 'On phones Novora only runs in landscape.'
  }
};
const t = (k) => (T[state.lang] || T.de)[k] || k;

/* Statische Texte aus app.html (Sheet-Titel, Tooltips, Nav-Label) ueber t(). */
function applyStaticTexts() {
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((n) => {
    const v = t(n.dataset.i18nTitle);
    n.title = v;
    n.setAttribute('aria-label', v);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
}

/* ---------- Icons (eigener Satz, markenfrei) ---------- */
// Alle Glyphen kommen aus /iconset.js (design/icons/novora-icons). Keine Fremd-Logos.
const LEGACY_ALIAS = {
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

const L = {};
for (const [key, d] of Object.entries(window.NOVORA_ICONS || {})) {
  L['nv-' + key] = { svg: d.svg, label: d.label, cat: d.cat };
}
// Alte Kacheln/Daten weiter bedienen: Kurz- und Fremd-Keys zeigen auf neutrale Glyphen.
for (const [old, neu] of Object.entries(LEGACY_ALIAS)) {
  if (L['nv-' + neu]) L[old] = L['nv-' + neu];
}
L.tool = L.tool || L['nv-tool'];
L.system = L.system || L['nv-settings'];
L.browser = L.browser || L['nv-browser'];
L.volume = L.volume || L['nv-volume'];
L.mic = L.mic || L['nv-mic'];
L.home = L.home || L['nv-grid'];


function normalizeLogo(k) {
  if (!k) return k;
  if (k === 'letter' || String(k).startsWith('nv-')) return k;
  const t = LEGACY_ALIAS[k];
  return t ? 'nv-' + t : 'nv-app';
}

const LOGO_TITLES = {
  mic: { de: 'Mikrofon', en: 'Microphone' }, volume: { de: 'Lautstärke', en: 'Volume' },
  play: { de: 'Wiedergabe', en: 'Play/Pause' }, prev: { de: 'Zurück', en: 'Previous' },
  next: { de: 'Weiter', en: 'Next' }, mute: { de: 'Stumm', en: 'Mute' },
  rec: { de: 'Aufnahme', en: 'Recording' }, browser: { de: 'Browser', en: 'Browser' },
  tool: { de: 'Werkzeug', en: 'Tool' }, timer: { de: 'Kalender', en: 'Calendar' },
  menu: { de: 'Raster', en: 'Grid' }, system: { de: 'System', en: 'System' }
};

/* Monogramm-Farben (stabil aus den Zeichen gehasht) */
const MONO_COLORS = ['#22D3EE', '#A78BFA', '#4ADE80', '#FBBF24', '#F87171', '#60A5FA', '#F472B6'];
function letterColor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}
function isLightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 168;
}

/* ---------- API ---------- */
/* 402 bzw. {ok:false,error:"license_required"} heisst: der PC ist da, aber
   die Lizenz fehlt. Kein Reconnect-Spam, sondern Hinweis im Banner. */
async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(path, {
      cache: 'no-store',
      ...opts,
      headers: { 'content-type': 'application/json', 'x-token': state.token, ...(opts.headers || {}) }
    });
  } catch (e) {
    state.lastError = 'net ' + ((e && e.message) || e);
    updateDiag();
    throw e;
  }
  if (r.status === 402) { setLicense(false); throw new Error('license_required'); }
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) {
    state.lastError = 'http ' + r.status;
    updateDiag();
    throw new Error('http ' + r.status);
  }
  const data = await r.json();
  if (data && data.ok === false && data.error === 'license_required') {
    setLicense(false);
    throw new Error('license_required');
  }
  setLicense(true);
  return data;
}

function toast(msg, bad) {
  const n = el('div', 'toast' + (bad ? ' bad' : ''));
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}

/* ---------- Basis ---------- */
function applyPalette(p) {
  state.palette = p;
  localStorage.setItem('sp_pal', p);
  if (p === 'graphite') document.documentElement.removeAttribute('data-pal');
  else document.documentElement.setAttribute('data-pal', p);
}

function setOnline(v) {
  state.online = !!v;
  syncBanner();
}

/* Banner zeigt entweder die Lizenz-Aufforderung oder Offline. Die Lizenz
   hat Vorrang: der PC antwortet ja, nur die Lizenz fehlt. */
function syncBanner() {
  const lic = !!state.licenseRequired;
  const show = !!state.token && (lic || !state.online);
  const b = $('#banner');
  if (b) {
    b.classList.toggle('show', show);
    b.textContent = lic ? t('licenseBanner') : (show ? t('offlineBanner') : '');
  }
  const p = $('#lat');
  if (p) p.classList.toggle('stale', lic || !state.online);
  updateDiag();
}

function setLicense(ok) {
  const v = !ok;
  if (state.licenseRequired === v) return;
  state.licenseRequired = v;
  syncBanner();
}

/* Diagnose haengt still am Fenster, keine eigene Seite. */
function updateDiag() {
  const es = state.es;
  window.__novoraDiag = {
    version: APP_VERSION,
    ip: location.host,
    online: !!state.online,
    sse: !es ? 'none' : (es.readyState === 1 ? 'open' : (es.readyState === 2 ? 'closed' : 'connecting')),
    lastEventAt: state.lastEventAt || 0,
    latency: state.lat,
    lastError: state.lastError || '',
    lastAction: (window.__novoraDiag && window.__novoraDiag.lastAction) || null
  };
}

function rootPage() {
  const pages = state.layout?.pages || [];
  return pages.find((p) => p.type === 'home' || p.id === 'home') || pages[0] || null;
}

/* Home und Mixer sind immer Hauptseiten (nie Ordner), auch bei alten data.json-Dateien.
   Nur explizit als Ordner markierte normale Seiten liegen unterhalb der Hauptebene. */
function isFolderPage(p) {
  if (!p || p.type === 'mixer' || p.type === 'home' || p.id === 'mixer' || p.id === 'home') return false;
  return p.folder === true;
}

function topPages() {
  return (state.layout?.pages || []).filter((p) => !isFolderPage(p));
}

function currentPage() {
  if (!state.layout) return null;
  const pages = state.layout.pages || [];
  return pages.find((p) => p.id === state.page) || rootPage() || pages[0] || null;
}

function navigateTo(id) {
  if (!id || !state.layout) return;
  const target = state.layout.pages.find((p) => p.id === id);
  if (!target) return;
  if (state.page === id) return;
  /* Nur Ordner sind eine Ebene tiefer: sie bekommen einen Back-Eintrag.
     Top-Level-Seiten (Home/Mixer) stapeln nie History. */
  if (state.page && isFolderPage(target)) state.history.push(state.page);
  else state.history.length = 0;
  state.page = id;
  render();
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return /Tablet|SM-X|SM-T/i.test(ua) ? 'Android-Tablet' : 'Android-Handy';
  return 'Browser';
}

function hwid() {
  let h = localStorage.getItem('sp_hwid');
  if (!h) {
    h = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    localStorage.setItem('sp_hwid', h);
  }
  return h;
}

async function autoPair() {
  try {
    const r = await fetch('/api/pair/auto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceName(), hwid: hwid() })
    });
    if (!r.ok) return false;
    const j = await r.json();
    if (!j.token) return false;
    state.token = j.token;
    localStorage.setItem('sp_token', j.token);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Koppeln per Code (manuell + QR) ---------- */
async function claimCode(raw) {
  const code = String(raw || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return false;
  try {
    const r = await fetch('/api/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, device: deviceName() })
    });
    if (!r.ok) return false;
    const j = await r.json();
    state.token = j.token;
    localStorage.setItem('sp_token', j.token);
    await boot();
    render();
    return true;
  } catch {
    return false;
  }
}

/* ---------- QR-Scanner (jsQR + getUserMedia) ---------- */
let scanSession = null;

/*
 * Kopplungs-QR: novora://pair?ip=…&port=…&code=123456
 * `secret` wird nur als Alias akzeptiert, wenn er selbst genau 6 Ziffern ist
 * (künftige QR-Variante); der Wert wird nie geloggt oder angezeigt.
 */
function parsePairUrl(text) {
  if (!text) return null;
  let u = null;
  try { u = new URL(String(text).trim()); } catch { return null; }
  if (!/^novora:$/i.test(u.protocol)) return null;
  const ip = (u.searchParams.get('ip') || '').trim();
  const port = (u.searchParams.get('port') || '47830').trim();
  let code = (u.searchParams.get('code') || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) {
    const secret = (u.searchParams.get('secret') || '').trim();
    code = /^\d{6}$/.test(secret) ? secret : '';
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
  if (!/^\d{1,5}$/.test(port)) return null;
  if (code.length !== 6) return null;
  return { ip, port, code };
}

function stopScan() {
  const s = scanSession;
  scanSession = null;
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  if (s.stream) { try { s.stream.getTracks().forEach((tr) => tr.stop()); } catch {} }
  if (s.root) s.root.remove();
}

async function applyPair(p) {
  const here = (location.hostname || '').toLowerCase();
  const same = !here || here === p.ip || here === 'localhost' || here === '127.0.0.1';
  if (!same && String(location.port || '80') !== p.port) {
    location.href = `http://${p.ip}:${p.port}/app?pair=${encodeURIComponent(p.code)}`;
    return;
  }
  if (state.token && state.layout) { render(); return; }
  const inp = document.getElementById('code');
  if (inp) { inp.value = p.code; inp.dispatchEvent(new Event('input')); }
  if (!(await claimCode(p.code))) toast(t('codeInvalid'), true);
}

function hasNativeScanner() {
  try {
    const n = window.NovoraNative;
    return !!(n && typeof n.hasScanner === 'function' && n.hasScanner() && typeof n.scanQr === 'function');
  } catch { return false; }
}

function openScan() {
  if (hasNativeScanner()) {
    try { window.NovoraNative.scanQr(); return; } catch {}
  }
  stopScan();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast(t('scanNoCam'), true);
    return;
  }
  const root = el('div', 'scan-layer');
  root.innerHTML = '<div class="scan-box"><video autoplay playsinline muted></video>' +
    '<div class="scan-frame"></div><div class="scan-hint"></div>' +
    '<button class="btn scan-close" type="button"></button></div>';
  root.querySelector('.scan-hint').textContent = t('scanHint');
  const closeBtn = root.querySelector('.scan-close');
  closeBtn.textContent = t('scanClose');
  document.body.appendChild(root);
  const video = root.querySelector('video');
  const session = scanSession = { root };
  closeBtn.onclick = () => stopScan();

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  }).then((stream) => {
    if (scanSession !== session) { stream.getTracks().forEach((tr) => tr.stop()); return; }
    session.stream = stream;
    video.srcObject = stream;
    const played = video.play();
    if (played && played.catch) played.catch(() => {});
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let misses = 0;
    const tick = () => {
      if (scanSession !== session) return;
      if (ctx && video.readyState >= 2 && video.videoWidth) {
        const w = Math.min(video.videoWidth, 640);
        const h = Math.max(1, Math.round(video.videoHeight * (w / video.videoWidth)));
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        let hit = null;
        try {
          const img = ctx.getImageData(0, 0, w, h);
          hit = typeof window.jsQR === 'function' ? window.jsQR(img.data, w, h) : null;
        } catch {}
        if (hit && hit.data) {
          const p = parsePairUrl(hit.data);
          if (p) { stopScan(); applyPair(p); return; }
          if (++misses % 8 === 1) toast(t('scanBadQr'));
        }
      }
      session.timer = setTimeout(tick, 200);
    };
    tick();
  }).catch(() => {
    stopScan();
    toast(t('scanNoCam'), true);
  });
}

/* Rückrufe der nativen Kamera (Android-WebView, siehe MainActivity.java) */
if (!window.onNativeScan) {
  window.onNativeScan = (txt) => {
    const p = parsePairUrl(txt);
    if (p) { applyPair(p); return; }
    toast(t('scanBadQr'), true);
  };
}
if (!window.onNativeScanFailure) {
  window.onNativeScanFailure = (msg) => toast(msg || t('scanNoCam'), true);
}

/* ---------- Rendern ---------- */
function render() {
  applyPalette(state.palette);
  updateOrientation();
  applyStaticTexts();
  document.documentElement.lang = state.lang;
  document.documentElement.style.setProperty('--r-tile', `${state.opts.radius}px`);
  applyBg();
  const bb = document.getElementById('backBtn');
  if (bb) bb.classList.toggle('hidden', !state.history || state.history.length === 0);
  const view = $('#view');
  view.innerHTML = '';
  const page = currentPage();
  if (page) state.page = page.id;
  const linked = !!(state.token && state.layout);

  /* Host + Seitenname sind Daten; Status-/Rollen-Texte laufen ueber t(). */
  const subHost = state.info ? state.info.name : t('thisPc');
  const subPage = page ? (page.type === 'mixer' ? t('mixer') : page.name) : '';
  $('#sub').textContent = !state.info ? t('connecting')
    : (!state.token ? `${subHost} · ${t('notPaired')}` : `${subHost}${subPage ? ` · ${subPage}` : ''}`);
  const cb = $('#connectBtn');
  cb.classList.toggle('linked', linked);
  cb.querySelector('span').textContent = linked ? (state.info ? state.info.name : t('connected')) : t('connect');
  cb.title = linked ? t('settings') : t('connect');
  $('#lat').classList.toggle('hidden', !linked);
  $('#tabs').classList.toggle('hidden', !linked);

  if (!linked) { $('#tabs').innerHTML = ''; renderConnect(view); setOnline(state.online); return; }
  if (page && page.type === 'mixer') renderMixer(view); else renderGrid(view);
  renderBar();
  setOnline(state.online);
}

function applyBg() {
  const bg = state.opts.bg || '#06090D';
  document.body.style.background = state.opts.gradient
    ? `radial-gradient(900px 520px at 20% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%), ${bg}`
    : bg;
}

function goBack() {
  if (!state.history || !state.history.length) return;
  state.page = state.history.pop();
  render();
}

/* ---------- Seiten wischen (nur oberste Seiten, keine Ordner) ---------- */
function switchPage(dir) {
  if (rotateBlocked()) return;
  /* In einem Ordner: rechts wischen = zurueck, links wischen = nichts. */
  if (isFolderPage(currentPage())) {
    if (dir < 0) goBack();
    return;
  }
  const pages = topPages();
  if (pages.length < 2) return;
  const i = pages.findIndex((p) => p.id === state.page);
  if (i < 0) return;
  const next = pages[(i + dir + pages.length) % pages.length];
  if (!next || next.id === state.page) return;
  /* Top-Level-Wechsel ist kein Abstieg: keine History aufbauen, damit der
     Back-Button versteckt bleibt. */
  state.history.length = 0;
  state.page = next.id;
  render();
  const view = $('#view');
  view.classList.remove('slide-left', 'slide-right');
  void view.offsetWidth;
  view.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
  setTimeout(() => view.classList.remove('slide-left', 'slide-right'), 280);
  if (state.opts.haptics && navigator.vibrate) { try { navigator.vibrate(8); } catch {} }
}

function initSwipe() {
  const surface = $('#app') || document.body;
  const isControl = (t) => !!(t && t.closest && t.closest('input,textarea,.mtrack,.mbtn,button'));
  let tsx = 0, tsy = 0, tlx = 0, tly = 0, tst = 0, tActive = false;

  /* Native Touch-Events fuer Android-WebView & Smartphones (immun gegen pointercancel). */
  surface.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) { tActive = false; return; }
    if (isControl(e.target)) { tActive = false; return; }
    const pt = e.touches[0];
    tActive = true;
    tsx = tlx = pt.clientX;
    tsy = tly = pt.clientY;
    tst = performance.now();
  }, { passive: true });
  surface.addEventListener('touchmove', (e) => {
    if (!tActive || !e.touches || !e.touches.length) return;
    tlx = e.touches[0].clientX;
    tly = e.touches[0].clientY;
  }, { passive: true });
  surface.addEventListener('touchend', () => {
    if (!tActive) return;
    tActive = false;
    if (!state.opts.swipe) return;
    const dx = tlx - tsx;
    const dy = tly - tsy;
    const dt = performance.now() - tst;
    if (dt < 1000 && Math.abs(dx) >= 32 && Math.abs(dx) > Math.abs(dy) * 1.1) {
      suppressNextClick();
      switchPage(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  surface.addEventListener('touchcancel', () => { tActive = false; }, { passive: true });

  /* Maus-Drag am Desktop. */
  let sx = 0, sy = 0, lx = 0, ly = 0, st = 0, pid = null, active = false;
  surface.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (isControl(e.target)) return;
    active = true; pid = e.pointerId;
    sx = lx = e.clientX; sy = ly = e.clientY; st = performance.now();
  }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pid) return;
    lx = e.clientX; ly = e.clientY;
  }, { passive: true });
  const finishMouse = (e) => {
    if (!active || e.pointerId !== pid) return;
    active = false;
    lx = e.clientX; ly = e.clientY;
    if (!state.opts.swipe) return;
    const dx = lx - sx;
    const dy = ly - sy;
    const dt = performance.now() - st;
    if (dt < 900 && Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.1) {
      suppressNextClick();
      switchPage(dx < 0 ? 1 : -1);
    }
  };
  window.addEventListener('pointerup', finishMouse, { passive: true });
  window.addEventListener('pointercancel', () => { active = false; }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (!state.layout) return;
    if (e.key === 'ArrowRight') switchPage(1);
    else if (e.key === 'ArrowLeft') switchPage(-1);
  });
}

/* Nach einem Wisch darf der folgende Klick keine Taste ausloesen. */
function suppressNextClick() {
  state.suppressClick = Date.now() + 450;
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, true), 500);
}

function renderConnect(view) {
  const info = state.info;
  const linked = !!(state.token && state.layout);
  const card = el('div', 'card');
  card.append(el('h3', null, t('thisPc')));
  const row = el('div', 'row');
  row.innerHTML = `<i class="dot${linked ? '' : ' off'}"></i><div><b>${esc(info ? info.name : 'PC')}</b>` +
    `<span class="sub">${esc(info ? info.host : location.hostname)} · ${esc(location.host)}</span></div>` +
    `<span class="val">${linked ? t('paired') : t('notPaired')}</span>`;
  card.append(row);
  const meta = el('div', 'row');
  meta.append(el('span', 'sub', `${esc(t('host'))}: ${esc(info ? info.host : '–')} · ${esc(t('version'))} ${esc(info ? info.version : '–')}`));
  card.append(meta);
  view.append(card);

  if (state.pairing) {
    const c = el('div', 'card');
    c.append(el('h3', null, t('autoPairing')));
    c.append(el('div', 'note', t('connecting')));
    view.append(c);
    return;
  }

  if (state.token && !state.layout) {
    const c = el('div', 'card');
    c.append(el('h3', null, t('connecting')));
    c.append(el('div', 'note', t('offlineBanner')));
    const b = el('button', 'btn', t('retry'));
    b.style.marginTop = '10px';
    b.onclick = async () => { await boot(); render(); };
    c.append(b);
    view.append(c);
    return;
  }

  if (linked) {
    const c = el('div', 'card');
    c.append(el('h3', null, t('connection')));
    const p = el('div', 'row');
    p.innerHTML = `<i class="dot"></i><div><b>${esc(info ? info.name : 'PC')}</b>` +
      `<span class="sub">${esc(t('paired'))} · ${esc(location.host)}</span></div>` +
      `<span class="val">${state.lat != null ? state.lat + ' ms' : ''}</span>`;
    c.append(p);
    const d = el('button', 'btn danger', t('disconnect'));
    d.style.marginTop = '10px';
    d.onclick = logout;
    c.append(d);
    view.append(c);
    return;
  }

  const c = el('div', 'card');
  c.append(el('h3', null, t('pairTitle')));
  if (state.pairFailed) c.append(el('div', 'note', t('autoFailed')));
  const inp = el('input', 'codeinput');
  inp.id = 'code';
  inp.type = 'text';
  inp.inputMode = 'numeric';
  inp.autocomplete = 'one-time-code';
  inp.maxLength = 6;
  inp.placeholder = '000000';
  inp.setAttribute('aria-label', t('codeLabel'));
  const pairBtn = el('button', 'btn', t('pair'));
  pairBtn.type = 'button';
  pairBtn.disabled = true;
  pairBtn.style.marginTop = '10px';
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, 6);
    pairBtn.disabled = inp.value.length !== 6;
  });
  const submit = async () => {
    const code = inp.value.trim();
    if (code.length !== 6) return toast(t('codeMissing'), true);
    pairBtn.disabled = true;
    const ok = await claimCode(code);
    if (!ok) { inp.value = ''; pairBtn.disabled = true; toast(t('codeInvalid'), true); }
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !pairBtn.disabled) submit(); });
  pairBtn.onclick = submit;
  const scanBtn = el('button', 'btn', t('scan'));
  scanBtn.type = 'button';
  scanBtn.style.marginTop = '10px';
  scanBtn.onclick = openScan;
  c.append(inp, el('div', 'note', t('codeHint')), pairBtn, scanBtn, el('div', 'note', t('pairNote')));
  view.append(c);
}

/* ---------- Raster (1:1 wie im PC-Editor: page.cols x page.rows) ---------- */
function gridDims(page) {
  const cols = clamp(Number(page?.cols) || 5, 1, 12);
  const rows = clamp(Number(page?.rows) || 4, 1, 12);
  return { cols, rows, total: cols * rows };
}

function renderGrid(view) {
  const page = currentPage();
  if (!page) return;
  const g = el('div', 'grid');
  g.id = 'grid';
  g.style.gap = `${state.opts.gap}px`;
  g.classList.toggle('no-num', !state.opts.numbers);
  view.append(g);
  buildTiles(g, page);
  fitGrid(g, page);
  requestAnimationFrame(() => fitGrid(g, page));
  watchGrid();
}

function buildTiles(g, page) {
  g.innerHTML = '';
  const { cols, rows } = gridDims(page, g);
  const tiles = page.tiles || [];
  const byKey = new Map();
  for (const tile of tiles) byKey.set(Number(tile.key), tile);
  for (let i = 0; i < cols * rows; i++) {
    const tile = byKey.get(i);
    if (!tile) {
      g.insertAdjacentHTML('beforeend', '<div class="tile blank" aria-hidden="true"></div>');
      continue;
    }
    g.append(buildTile(tile, page.id));
  }
  syncGridState();
}

/* Bild-Logos: lokale extrahierte EXE-Icons (/assets/appicons/<id>.png) zulassen. */
function tileImgUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!s) return '';
  if (/^\/assets\/appicons\/[a-f0-9_-]+\.png$/i.test(s)) return s;
  if (/^data:image\/png;base64,/i.test(s)) return s;
  return '';
}

function paintTileArt(node, tile, d, letter) {
  node.classList.remove('has-brand', 'has-applogo', 'has-appicon');
  if (letter) {
    const text = String(tile.letter || tile.label || '?').trim().slice(0, 2).toUpperCase() || '?';
    const color = tile.color || letterColor(text);
    node.style.setProperty('--mono', color);
    if (isLightColor(color)) node.classList.add('dark');
    node.dataset.title = String(tile.label || tile.letter || text);
    node.innerHTML = `<b class="mono">${esc(text)}</b>`;
    return;
  }
  const sym = d || L.tool;
  if (sym) {
    node.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${sym.svg}</svg>`;
  } else {
    node.innerHTML = '';
  }
  if (tile.color) {
    node.style.setProperty('--accent', tile.color);
    const ic = node.querySelector('svg.ic');
    if (ic) ic.style.stroke = tile.color;
    node.dataset.tint = '';
    node.style.setProperty('--tint', tile.color);
  }
}

/* Screenreader-Name: Kachelname -> Ziel/Hotkey/Seitenname -> Icon-Label -> Aktionstyp. */
function tileAriaLabel(tile, d) {
  const lbl = String(tile.label || '').trim();
  if (lbl) return lbl;
  const a = tile.action || {};
  if (a.type === 'open' && a.target) {
    const s = String(a.target).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
    if (s) return s;
    return t('actOpen');
  }
  if (a.type === 'hotkey' && a.keys) return String(a.keys);
  if (a.type === 'page' && a.page) {
    const p = (state.layout?.pages || []).find((x) => x.id === a.page);
    return p && p.name ? p.name : t('actPage');
  }
  if (d && d.label) return String(d.label);
  if (a.type) return t('act' + a.type.charAt(0).toUpperCase() + a.type.slice(1));
  return t('tileLabel');
}

function buildTile(tile, pageId) {
  if (tile && tile.logo) tile.logo = normalizeLogo(tile.logo);
  const letter = tile.logo === 'letter';
  const d = letter ? null : (L[tile.logo] || L.tool);
  const node = el('div', 'tile' + (letter ? ' letter' : '') + (d?.brand ? ' app' : '') + (d?.light ? ' light' : ''));
  if (d?.brand) {
    node.style.setProperty('--brand', d.brand);
    node.style.setProperty('--brand2', d.brand2 || d.brand);
  }
  node.dataset.key = String(tile.key);
  node.dataset.state = tile.state || (tile.action?.type === 'mic' ? 'mic' : '');
  node.dataset.logo = tile.logo || 'tool';
  const paint = () => paintTileArt(node, tile, d, letter);
  const appIconSrc = tile.appIcon
    ? `/assets/appicons/${encodeURIComponent(String(tile.appIcon))}.png`
    : tileImgUrl(tile.img);
  if (appIconSrc) {
    /* Echtes EXE-/App-Logo: <img> zentriert; faellt bei Ladefehler auf Symbol zurueck. */
    node.classList.add('has-appicon');
    node.dataset.img = appIconSrc;
    if (tile.label) node.dataset.title = String(tile.label);
    const im = el('img', 'tile-img');
    im.alt = '';
    im.loading = 'lazy';
    im.decoding = 'async';
    im.draggable = false;
    im.addEventListener('error', () => {
      im.remove();
      node.classList.remove('has-appicon');
      delete node.dataset.img;
      paint();
      syncTile(node);
    }, { once: true });
    im.src = appIconSrc;
    node.append(im);
  } else {
    paint();
  }
  if (tile.state === 'volume') node.insertAdjacentHTML('beforeend', ringMarkup(0) + '<b class="num">0</b>');
  const fire = () => {
    if (Date.now() < state.suppressClick) return;
    press(pageId, tile.key);
  };
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.setAttribute('aria-label', tileAriaLabel(tile, d));
  node.addEventListener('click', fire);
  node.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    if (ev.repeat) return;
    ev.preventDefault();
    fire();
  });
  syncTile(node);
  return node;
}

function ringMarkup(v) {
  return `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="45"/>` +
    `<circle class="arc" cx="50" cy="50" r="45" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${(RING_LEN * (1 - clamp(v, 0, 100) / 100)).toFixed(1)}"/></svg>`;
}

function tileTitle(logo, s) {
  const base = (LOGO_TITLES[logo] || {})[state.lang] || LOGO_TITLES[logo]?.de || logo;
  if (s === 'mic') return `${base} · ${state.st.mic ? t('on') : t('muted')}`;
  if (s === 'volume') return `${base} ${clamp(Number(state.st.volume) || 0, 0, 100)} %`;
  if (s === 'recording') return `${base} · ${state.st.recording ? t('recording') : t('idle')}`;
  return base;
}

function syncTile(node) {
  const s = node.dataset.state;
  const logo = node.dataset.logo;
  if (s === 'mic') {
    const on = !!state.st.mic;
    node.classList.toggle('on', on);
    node.classList.toggle('muted', !on);
    const ic = node.querySelector('svg.ic');
    if (ic && (logo === 'nv-mic' || logo === 'mic' || logo === 'nv-mic-off') && L['nv-mic'] && L['nv-mic-off']) {
      ic.innerHTML = on ? L['nv-mic'].svg : L['nv-mic-off'].svg;
    } else if (node.classList.contains('has-appicon')) {
      let mb = node.querySelector('.mic-badge');
      if (!on && !mb && L['nv-mic-off']) {
        mb = el('span', 'mic-badge', `<svg viewBox="0 0 24 24" aria-hidden="true">${L['nv-mic-off'].svg}</svg>`);
        node.append(mb);
      } else if (on && mb) {
        mb.remove();
      }
    }
  } else if (s === 'volume') {
    const v = clamp(Number(state.st.volume) || 0, 0, 100);
    node.classList.add('on');
    const arc = node.querySelector('.arc');
    if (arc) arc.style.strokeDashoffset = String(RING_LEN * (1 - v / 100));
    node.style.setProperty('--vol', (v / 100).toFixed(2));
    const num = node.querySelector('.num');
    if (num) num.textContent = String(Math.round(v));
  } else if (s === 'recording') {
    const rec = !!state.st.recording;
    node.classList.toggle('warn', rec);
    const badge = node.querySelector('.badge');
    if (rec && !badge) node.insertAdjacentHTML('afterbegin', '<span class="badge"></span>');
    else if (!rec && badge) badge.remove();
  }
  node.title = node.dataset.title || tileTitle(logo, s);
}

function syncGridState() {
  document.querySelectorAll('.tile[data-state]').forEach((n) => { if (n.dataset.state) syncTile(n); });
}

function fitGrid(g, page) {
  if (!g || !g.isConnected) return;
  const { cols, rows } = gridDims(page, g);
  const cs = getComputedStyle(g);
  const availW = g.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const availH = g.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  if (!(availW > 0) || !(availH > 0)) return;
  const baseGap = clamp(Number(state.opts.gap) || 8, 6, 18);
  let size = Math.floor(Math.min(
    (availW - (cols - 1) * baseGap) / cols,
    (availH - (rows - 1) * baseGap) / rows
  ));
  size = clamp(size, 16, 360);
  const colGap = baseGap;
  const rowGap = baseGap;
  const s = size;
  g.style.setProperty('--tile-size', `${s}px`);
  g.style.gap = `${rowGap}px ${colGap}px`;
  g.style.gridTemplateColumns = `repeat(${cols}, ${s}px)`;
  g.style.gridTemplateRows = `repeat(${rows}, ${s}px)`;
  g.style.justifyContent = 'center';
  g.style.alignContent = 'center';
  g.classList.toggle('tiny', s < 58);
  refreshPill();
}

let gridObserver = null;
function watchGrid() {
  if (!('ResizeObserver' in window)) return;
  if (!gridObserver) {
    gridObserver = new ResizeObserver(() => {
      const g = document.getElementById('grid');
      const p = currentPage();
      if (g && p && !rotateBlocked()) fitGrid(g, p);
    });
  }
  gridObserver.disconnect();
  gridObserver.observe($('#view'));
}

/* Nach resize/orientationchange: Spalten neu berechnen, Zellen neu bauen. */
let refitRaf = 0;
function refit() {
  updateOrientation();
  if (rotateBlocked()) return;          // Hochformat-Handy: Raster ruht
  if (refitRaf) return;
  refitRaf = requestAnimationFrame(() => {
    refitRaf = 0;
    const g = document.getElementById('grid');
    const page = currentPage();
    if (!g || !g.isConnected || !page || page.type === 'mixer') return;
    const { cols, rows } = gridDims(page, g);
    if (g.children.length !== cols * rows) buildTiles(g, page);
    fitGrid(g, page);
  });
}

/* System-Presets: riskante brauchen zwei Drucke, unkritische nur OSD-Feedback. */
const POWER_RISKY = { shutdown: 'powerShutdown', restart: 'powerRestart', logoff: 'powerLogoff' };
const POWER_SOFT = { lock: 'powerLock', screenoff: 'powerScreenOff', sleep: 'powerSleep', hibernate: 'powerHibernate' };
const POWER_CONFIRM_MS = 4000;

async function press(pageId, key) {
  if (rotateBlocked()) return;
  maybeFullscreen();
  const page = state.layout?.pages.find((p) => p.id === pageId);
  const tile = page?.tiles?.find((x) => Number(x.key) === Number(key));
  if (tile?.action?.type === 'page' && tile.action.page) {
    navigateTo(tile.action.page);
    return;
  }
  const sys = tile?.action?.type === 'system' ? String(tile.action.preset || '') : null;
  if (sys && POWER_RISKY[sys]) {
    const now = Date.now();
    const c = state.confirmPower;
    const open = !!(c && c.until > now && c.page === pageId && c.key === Number(key));
    if (!open) {
      state.confirmPower = { page: pageId, key: Number(key), until: now + POWER_CONFIRM_MS };
      showOsd(t('powerConfirm'), t(POWER_RISKY[sys]));
      return;
    }
    state.confirmPower = null;
  } else {
    state.confirmPower = null;
  }
  if (sys && POWER_SOFT[sys] && state.opts.osd) showOsd('System', t(POWER_SOFT[sys]));
  if (state.opts.osd && tile) {
    if (tile.state === 'volume' || tile.action?.type === 'volume') {
      showOsd('Windows', clamp(Number(state.st.volume) || 0, 0, 100));
    } else if (tile.state === 'mic' || tile.action?.type === 'mic') {
      showOsd('Mikrofon', state.st.mic ? t('muted') : t('on'), !!state.st.mic);
    }
  }
  try {
    const r = await api('/api/press', { method: 'POST', body: JSON.stringify({ page: pageId, key: Number(key), phase: 'down' }) });
    window.__novoraDiag = window.__novoraDiag || {};
    window.__novoraDiag.lastAction = { page: pageId, key: Number(key), ok: r && r.ok, error: (r && r.error) || '', ms: (r && r.ms) || 0, at: Date.now() };
    if (r && r.ok === false) {
      showOsd('Fehler', r.error || 'unbekannt', true);
    } else if (tile && tile.action && tile.action.type !== 'volume' && tile.action.type !== 'mic' && tile.action.type !== 'system') {
      showOsd(tile.label || tileAriaLabel(tile), 'OK', false);
    }
  } catch (e) {
    /* 401/402 regelt api() selbst (Logout bzw. Lizenz-Banner), kein Druck-Toast. */
    if (e.message !== 'unauthorized' && e.message !== 'license_required') toast(t('pressFailed'), true);
  }
}

let osdTimer = null;
let lastFeedback = null; // { label, value, muted, until }

function paintBarFeedback() {
  const fb = document.getElementById('barFeedback');
  if (!fb) return;
  const now = Date.now();
  if (lastFeedback && lastFeedback.until > now) {
    const { label, value, muted } = lastFeedback;
    const numeric = typeof value === 'number';
    fb.className = 'bar-fb show' + (muted ? ' mute' : ' ok');
    fb.innerHTML = `<i class="fb-dot"></i><b>${esc(String(label))}</b>` +
      (numeric
        ? `<span class="fb-val">${Math.round(value)} %</span><span class="fb-bar"><i style="width:${clamp(value, 0, 100)}%"></i></span>`
        : `<span class="fb-val">${esc(String(value))}</span>`);
    return;
  }
  /* Dauerhafter Status-Hinweis, solange das Mikrofon stumm ist. */
  if (state.st && state.st.mic === false) {
    fb.className = 'bar-fb show mute';
    fb.innerHTML = `<i class="fb-dot"></i><b>Mikrofon</b><span class="fb-val">${esc(t('muted'))}</span>`;
    return;
  }
  fb.className = 'bar-fb';
  fb.innerHTML = '';
}

function showOsd(label, value, muted) {
  lastFeedback = { label, value, muted: !!muted, until: Date.now() + 2600 };
  paintBarFeedback();
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    lastFeedback = null;
    paintBarFeedback();
  }, 2650);
}

/* Echte Rastermasse: was das Grid tatsaechlich rendert (kein Fenster-Schaetzwert). */
function pillDims(page) {
  const g = document.getElementById('grid');
  if (g && g.isConnected) {
    const cs = getComputedStyle(g);
    const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length;
    const rows = (cs.gridTemplateRows || '').split(' ').filter(Boolean).length;
    if (cols > 0 && rows > 0) return { cols, rows };
    return gridDims(page, g);
  }
  return gridDims(page);
}

function barLabel(page) {
  if (!page) return '';
  if (page.type === 'mixer') return `${t('mixer')} · ${t('live')}`;
  const d = pillDims(page);
  return `${page.name} · ${d.cols} × ${d.rows}`;
}

/* Nach Resize/Refit ohne Neuaufbau: nur den Pill-Text nachziehen. */
function refreshPill() {
  const pill = document.querySelector('#tabs .pill');
  const page = currentPage();
  if (!pill || !page) return;
  const label = barLabel(page);
  if (pill.textContent !== label) pill.textContent = label;
}

function renderBar() {
  const nav = $('#tabs');
  if (!nav || !state.layout) return;
  nav.innerHTML = '';
  const page = currentPage();
  const pages = topPages();
  if (pages.length > 1) {
    const dots = el('div', 'dots');
    for (const p of pages) {
      const dot = el('span', 'pdot' + (p.id === page?.id ? ' on' : ''));
      dot.setAttribute('role', 'button');
      dot.tabIndex = 0;
      dot.title = p.type === 'mixer' ? t('mixer') : (p.name || p.id);
      dot.setAttribute('aria-label', dot.title);
      dot.onclick = () => navigateTo(p.id);
      dots.append(dot);
    }
    nav.append(dots);
  }
  const fb = el('div', 'bar-fb');
  fb.id = 'barFeedback';
  const label = barLabel(page);
  const pill = el('span', 'pill');
  pill.textContent = label;
  nav.append(fb, el('div', 'spacer'), pill);
  paintBarFeedback();
}

/* ---------- Mixer ---------- */
function renderMixer(view) {
  const card = el('div', 'card mixer');
  const head = el('div', 'mx-head');
  head.append(el('h3', null, t('mixer')));
  const tag = el('span', 'tag');
  tag.textContent = `${t('live')} · ${(state.mixer || []).length} ${t('sessions')}`;
  head.append(tag, el('div', 'spacer'));
  const master = el('span', 'pill');
  master.id = 'masterPill';
  head.append(master);
  card.append(head);

  const body = el('div', 'mx-body');
  const apps = state.mixer || [];
  if (!apps.length) body.append(el('div', 'note mx-empty', '–'));
  for (const app of apps) body.append(buildMixerRow(app));
  /* Hinweiszeile bleibt Anker: neue Apps werden davor angehaengt. */
  body.append(el('div', 'note mx-hint', t('mixerHint')));
  card.append(body);
  view.append(card);
  updateMaster();
}

function buildMixerRow(app) {
  const row = el('div', 'mrow');
  row.dataset.id = app.id;

  const lg = el('span', 'mlogo');
  const MIXER_ALIAS = {
    spotify: 'nv-music', vlc: 'nv-play', obs64: 'nv-stream', obs: 'nv-stream',
    chrome: 'nv-browser', msedge: 'nv-browser', firefox: 'nv-browser', brave: 'nv-browser', opera: 'nv-browser',
    discord: 'nv-voice-chat', teams: 'nv-video-call', 'ms-teams': 'nv-video-call', zoom: 'nv-video-call',
    code: 'nv-code', steam: 'nv-games', epicgameslauncher: 'nv-games', spotifyexe: 'nv-music'
  };
  const d = L[MIXER_ALIAS[app.id] || app.id] || L.system || L.tool;
  lg.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${d.svg}</svg>`;

  const name = el('div', 'mname');
  name.innerHTML = `${esc(app.name)}<small>${esc(t('appVolume'))}</small>`;

  const track = el('div', 'mtrack');
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-label', `${app.name} ${t('appVolume')}`);
  track.tabIndex = 0;
  track.innerHTML = '<i class="fill"></i><b class="knob"></b>';

  const val = el('span', 'mval');
  const mute = el('button', 'mbtn');
  mute.type = 'button';
  mute.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

  row.append(lg, name, track, val, mute);
  applyMixerRow(row, app);
  bindSlider(row, app, track);
  mute.onclick = () => {
    const next = !app.muted;
    app.muted = next;
    applyMixerRow(row, app);
    holdMixer(app);
    api('/api/mixer', { method: 'POST', body: JSON.stringify({ id: app.id, muted: next }) })
      .then((j) => { if (j.apps) applyMixer(j.apps); })
      .catch(() => { app.muted = !next; applyMixerRow(row, app); });
  };
  return row;
}

function applyMixerRow(row, app) {
  const vol = clamp(Number(app.vol) || 0, 0, 100);
  const shown = app.muted ? 0 : vol;
  const fill = row.querySelector('.fill');
  const knob = row.querySelector('.knob');
  const val = row.querySelector('.mval');
  const track = row.querySelector('.mtrack');
  const mute = row.querySelector('.mbtn');
  if (fill) fill.style.width = shown + '%';
  /* Knopf bleibt vollstaendig im eigenen Track: kein Ueberlauf, damit das
     Scrollverhalten der Liste (und damit die Nachbarzeilen) unberuehrt bleibt. */
  if (knob) knob.style.left = `clamp(8px, ${shown}%, calc(100% - 8px))`;
  if (val) val.textContent = app.muted ? '–' : vol + ' %';
  if (track) track.setAttribute('aria-valuenow', String(vol));
  if (mute) {
    mute.classList.toggle('off', !!app.muted);
    mute.title = app.muted ? t('unmute') : t('mute');
    mute.setAttribute('aria-pressed', app.muted ? 'true' : 'false');
  }
}

function bindSlider(row, app, track) {
  let dragging = false;
  const setFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    if (!r.width) return;
    const v = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 100);
    app.vol = v;
    if (app.muted) app.muted = false;
    applyMixerRow(row, app);
    holdMixer(app);
    queueVol(app.id, v, false);
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    state.dragIds.add(app.id);
    try { track.setPointerCapture(e.pointerId); } catch {}
    setFromEvent(e);
  });
  track.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    state.dragIds.delete(app.id);
    holdMixer(app);
    queueVol(app.id, app.vol, true);
    if (state.pendingRender && !state.dragIds.size) { state.pendingRender = false; render(); }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('lostpointercapture', end);
  track.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    let v = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = app.vol - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = app.vol + step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 100;
    if (v == null) return;
    e.preventDefault();
    app.vol = clamp(v, 0, 100);
    app.muted = false;
    applyMixerRow(row, app);
    queueVol(app.id, app.vol, true);
  });
}

function queueVol(id, vol, immediate) {
  state.pending[id] = vol;
  if (immediate) {
    clearTimeout(state.saveTimers[id]);
    delete state.saveTimers[id];
    return sendVol(id, vol);
  }
  if (state.saveTimers[id]) return;
  state.saveTimers[id] = setTimeout(() => {
    delete state.saveTimers[id];
    const v = state.pending[id];
    if (v != null) sendVol(id, v);
  }, 70);
}

async function sendVol(id, vol) {
  try {
    const j = await api('/api/mixer', { method: 'POST', body: JSON.stringify({ id, vol }) });
    if (j.apps) applyMixer(j.apps);
  } catch {}
}

function holdMixer(app, ms = 1800) {
  if (!app || !app.id) return;
  state.mixerHold.set(app.id, { vol: app.vol, muted: app.muted, until: Date.now() + ms });
}

/* SSE-Updates duerfen die Mixerliste NICHT neu aufbauen: bestehende App-Objekte
   bleiben (Slider-Closures zeigen darauf), Reihenfolge bleibt, Scrollposition
   bleibt. Neue Apps werden unten angehaengt, nie neu sortiert. */
function applyMixer(apps) {
  if (!Array.isArray(apps)) return;
  const now = Date.now();
  for (const [id, h] of state.mixerHold) if (h.until <= now) state.mixerHold.delete(id);

  const prev = state.mixer || [];
  const incoming = new Map();
  for (const a of apps) if (a && a.id != null) incoming.set(a.id, a);

  const next = [];
  for (const old of prev) {
    if (!incoming.has(old.id)) continue;          // App beendet -> Zeile faellt raus
    const inc = incoming.get(old.id);
    incoming.delete(old.id);
    const hold = state.mixerHold.get(old.id);
    const pinned = state.dragIds.has(old.id) || !!(hold && hold.until > now);
    if (typeof inc.name === 'string' && inc.name) old.name = inc.name;
    if (!pinned) { old.vol = inc.vol; old.muted = inc.muted; }
    next.push(old);
  }
  for (const inc of apps) {                       // neue Apps: unten anhaengen
    if (!inc || !incoming.has(inc.id)) continue;
    incoming.delete(inc.id);
    next.push({ ...inc });
  }
  state.mixer = next;
  syncMixerDom();
  updateMaster();
}

/* DOM mit state.mixer abgleichen: nur anhaengen/entfernen, niemals umsortieren,
   waehrend eines Drags nur die gezogene Zeile anfassen. */
function syncMixerDom() {
  const body = document.querySelector('.mx-body');
  const apps = state.mixer || [];
  const tag = document.querySelector('.mx-head .tag');
  if (tag) tag.textContent = `${t('live')} · ${apps.length} ${t('sessions')}`;
  if (!body) return;

  const rows = new Map();
  for (const r of body.querySelectorAll('.mrow')) rows.set(r.dataset.id, r);
  const keep = new Set(apps.map((a) => String(a.id)));
  for (const [id, r] of rows) if (!keep.has(id)) { r.remove(); rows.delete(id); }

  const hint = body.querySelector('.mx-hint');
  const empty = body.querySelector('.mx-empty');
  if (empty && apps.length) empty.remove();
  if (!empty && !apps.length) body.insertBefore(el('div', 'note mx-empty', '–'), hint || null);

  const dragging = state.dragIds.size > 0;
  const scrollTop = body.scrollTop;
  for (const app of apps) {
    const id = String(app.id);
    let row = rows.get(id);
    if (!row) {
      row = buildMixerRow(app);
      body.insertBefore(row, hint || null);
      rows.set(id, row);
    }
    if (dragging) continue;                        // waehrend Drag: andere Zeilen unberuehrt
    applyMixerRow(row, app);
  }
  if (body.scrollTop !== scrollTop) body.scrollTop = scrollTop;
}

function updateMaster() {
  const p = document.getElementById('masterPill');
  if (p) p.textContent = `${t('master')} ${Math.round(clamp(Number(state.st.volume) || 0, 0, 100))} %`;
}

/* ---------- Sheet ---------- */
const PALETTES = [['graphite', '#22D3EE', 'palGraphite'], ['violet', '#A78BFA', 'palViolet'], ['sage', '#4ADE80', 'palSage']];

function sheetRow(label, right) {
  const r = el('div', 'setrow');
  const l = el('span', 'sl');
  l.textContent = label;
  const rr = el('div', 'sr');
  if (right) rr.append(right);
  r.append(l, rr);
  return r;
}

function openSheet() {
  const s = $('#sheet');
  applyStaticTexts();
  s.classList.remove('hidden');
  s.setAttribute('aria-hidden', 'false');
  const b = $('#sheetBody');
  b.innerHTML = '';

  const seg = el('div', 'seg');
  for (const code of ['de', 'en']) {
    const btn = el('button', code === state.lang ? 'on' : '', code.toUpperCase());
    btn.type = 'button';
    btn.onclick = () => { state.lang = code; localStorage.setItem('sp_lang', code); openSheet(); render(); };
    seg.append(btn);
  }
  b.append(sheetRow(t('language'), seg));

  const presets = el('div', 'presets');
  for (const [id, color, key] of PALETTES) {
    const sw = el('button', 'preset' + (state.palette === id ? ' sel' : ''));
    sw.type = 'button';
    sw.style.background = color;
    sw.title = t(key);
    sw.setAttribute('aria-label', t(key));
    sw.onclick = () => { applyPalette(id); openSheet(); };
    presets.append(sw);
  }
  b.append(sheetRow(t('palette'), presets));
  b.append(sheetRow(t('background'), bgOpt()));
  b.append(sheetRow(t('gradient'), toggleOpt('gradient')));

  const page = currentPage();
  if (page && page.type !== 'mixer') {
    b.append(sheetRow(t('gap'), stepperOpt('gap', 3, 16, 1)));
    b.append(sheetRow(t('radiusOpt'), stepperOpt('radius', 6, 26, 2)));
    b.append(sheetRow(t('numbers'), toggleOpt('numbers')));
    b.append(sheetRow(t('swipe'), toggleOpt('swipe')));
    b.append(sheetRow(t('haptics'), toggleOpt('haptics')));
    b.append(sheetRow(t('osd'), toggleOpt('osd')));
    b.append(sheetRow(t('fullscreen'), fullscreenOpt()));
    const pv = el('div', 'pgrid');
    pv.id = 'pv';
    b.append(pv);
    b.append(el('div', 'note', t('previewNote')));
    renderPreview();
  }

  if (state.token) {
    const info = state.info;
    const st = el('div', 'setrow');
    st.innerHTML = `<i class="dot"></i><span class="sl">${esc(info ? info.name : 'PC')} · ${esc(location.host)}</span>` +
      `<span class="sr" style="color:var(--ok);font-size:10px;font-weight:600">${esc(t('paired'))}</span>`;
    b.append(st);

    const d = el('button', 'btn danger', t('disconnect'));
    d.type = 'button';
    d.style.marginTop = '12px';
    d.onclick = () => { closeSheet(); logout(); };
    b.append(d);
  }

  const v = el('div', 'verline');
  v.textContent = `App ${APP_VERSION} · ${t('version')} ${state.info ? state.info.version : '–'}`;
  b.append(v);

  const c = el('button', 'btn sec', t('close'));
  c.type = 'button';
  c.style.marginTop = '10px';
  c.onclick = closeSheet;
  b.append(c);

  s.onclick = (e) => { if (e.target === s) closeSheet(); };
}

function closeSheet() {
  const s = $('#sheet');
  s.classList.add('hidden');
  s.setAttribute('aria-hidden', 'true');
}


function bgOpt() {
  const box = el('div', 'presets');
  for (const c of ['#06090D', '#0B1020', '#101418', '#1A0F14', '#0F1A14', '#000000']) {
    const b = el('button', 'preset' + (state.opts.bg === c ? ' sel' : ''));
    b.type = 'button';
    b.style.background = c;
    b.title = c;
    b.onclick = () => { state.opts.bg = c; saveOpts(); openSheet(); render(); };
    box.append(b);
  }
  return box;
}

function saveOpts() {
  localStorage.setItem('sp_opts', JSON.stringify(state.opts));
}

function stepperOpt(key, min, max, step) {
  const st = el('div', 'stepper');
  const minus = el('button', null, '-');
  minus.type = 'button';
  const sv = el('span', 'sv', String(state.opts[key]));
  const plus = el('button', null, '+');
  plus.type = 'button';
  const set = (d) => {
    state.opts[key] = Math.max(min, Math.min(max, state.opts[key] + d * step));
    saveOpts(); openSheet(); render();
  };
  minus.onclick = () => set(-1);
  plus.onclick = () => set(1);
  st.append(minus, sv, plus);
  return st;
}

function toggleOpt(key) {
  const seg = el('div', 'seg');
  for (const on of [true, false]) {
    const b = el('button', state.opts[key] === on ? 'on' : '', on ? t('on') : t('off'));
    b.type = 'button';
    b.onclick = () => { state.opts[key] = on; saveOpts(); openSheet(); render(); };
    seg.append(b);
  }
  return seg;
}

function applyFullscreen(on) {
  try {
    if (on) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        const p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch { /* ignore */ }
}

/* Erstes Nutzer-Ereignis darf Vollbild anfordern – nur wenn aktiviert */
function maybeFullscreen() {
  if (!state.opts.fullscreen || state.fsAsked) return;
  state.fsAsked = true;
  if (document.fullscreenElement) return;
  applyFullscreen(true);
}

function fullscreenOpt() {
  const seg = el('div', 'seg');
  for (const on of [true, false]) {
    const b = el('button', state.opts.fullscreen === on ? 'on' : '', on ? t('on') : t('off'));
    b.type = 'button';
    b.onclick = () => {
      state.opts.fullscreen = on;
      saveOpts();
      applyFullscreen(on);
      openSheet();
    };
    seg.append(b);
  }
  return seg;
}

const portraitMQ = (typeof window.matchMedia === 'function') ? window.matchMedia('(orientation: portrait)') : null;
function isPortrait() {
  if (portraitMQ) return !!portraitMQ.matches;
  return window.innerHeight >= window.innerWidth;
}

/* Geraeteklasse am kuerzesten Bildschirmrand: Handy < 600 px, sonst Tablet. */
function screenShortSide() {
  const s = window.screen || {};
  const sw = Number(s.width) || 0;
  const sh = Number(s.height) || 0;
  if (sw > 0 && sh > 0) return Math.min(sw, sh);
  return Math.min(window.innerWidth || 1, window.innerHeight || 1);
}
function deviceKind() {
  return screenShortSide() < 600 ? 'phone' : 'tablet';
}
/* Hochformat ist erlaubt. Die Funktion bleibt als Haekchen fuer bestehende
   Aufrufer, blockiert aber nichts mehr. */
function rotateBlocked() {
  return false;
}

/* Lage und Geraeteklasse nur noch als Datenattribute fuer CSS. Der frueher
   blockierende Dreh-Hinweis bleibt versteckt; das Raster rechnet in beiden
   Lagen neu (gridDims liefert im Hochformat 3 Spalten). */
function updateOrientation() {
  const portrait = isPortrait();
  const device = deviceKind();
  const b = document.body;
  b.dataset.orient = portrait ? 'portrait' : 'landscape';
  b.dataset.device = device;
  b.dataset.rotate = 'off';
  const gate = document.getElementById('rotateGate');
  if (gate) {
    gate.classList.remove('show');
    gate.setAttribute('aria-hidden', 'true');
  }
}

function renderPreview() {
  const pv = document.getElementById('pv');
  const page = currentPage();
  if (!pv || !page) return;
  const { cols, rows } = gridDims(page, document.getElementById('grid'));
  pv.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  pv.innerHTML = '';
  for (let i = 0; i < cols * rows; i++) pv.append(el('i', i === 0 ? 'a' : ''));
}

/* ---------- SSE ----------
   Der Server schickt alle 20 s ein benanntes Event "heartbeat". Fehlt es
   laenger als 35 s, gilt die Leitung als still tot (onerror kommt bei
   eingefrorenen Sockets nicht) und wird neu aufgebaut. */
const SSE_STALE_MS = 35000;

function markEvent() {
  state.lastEventAt = Date.now();
  updateDiag();
}

function sseStale() {
  return !!state.es && !!state.lastEventAt && (Date.now() - state.lastEventAt > SSE_STALE_MS);
}

/* Idempotent: alter EventSource wird immer zuerst geschlossen. */
function connectSSE() {
  if (!state.token || state.licenseRequired) return;
  clearTimeout(state.retryTimer);
  state.retryTimer = null;
  if (state.es) { try { state.es.close(); } catch {} state.es = null; }
  let es;
  try {
    es = new EventSource(`/api/events?token=${encodeURIComponent(state.token)}`);
  } catch (e) {
    state.lastError = 'sse ' + ((e && e.message) || e);
    updateDiag();
    scheduleReconnect();
    return;
  }
  state.es = es;
  state.lastEventAt = Date.now();
  updateDiag();

  es.addEventListener('hello', () => { state.retryDelay = 1000; markEvent(); setOnline(true); });
  es.addEventListener('heartbeat', () => { markEvent(); setOnline(true); });
  es.addEventListener('state', (e) => {
    markEvent();
    try {
      const patch = JSON.parse(e.data);
      Object.assign(state.st, patch);
      syncGridState();
      updateMaster();
      if (patch.appMute && patch.appMute.app) {
        showOsd(patch.appMute.app + ' Ton', patch.appMute.muted ? t('muted') : t('on'), !!patch.appMute.muted);
      } else if (typeof patch.mic === 'boolean') {
        const lbl = patch.micApp ? (patch.micApp + ' Mikro') : 'Mikrofon';
        showOsd(lbl, patch.mic ? t('on') : t('muted'), !patch.mic);
      } else if (typeof patch.volume === 'number') {
        showOsd('Lautstärke', clamp(Number(patch.volume) || 0, 0, 100), false);
      }
    } catch {}
  });
  es.addEventListener('layout', (e) => {
    markEvent();
    try {
      const d = JSON.parse(e.data);
      if (state.layout && Array.isArray(d.pages)) state.layout.pages = d.pages;
      /* Waehrend ein Regler gezogen wird nicht neu rendern (sonst Sprung). */
      if (state.dragIds.size) { state.pendingRender = true; return; }
      render();
    } catch {}
  });
  es.addEventListener('mixer', (e) => {
    markEvent();
    try { applyMixer(JSON.parse(e.data).apps); } catch {}
  });
  es.addEventListener('page', (e) => {
    markEvent();
    try {
      const d = JSON.parse(e.data);
      const target = state.layout && d.id ? state.layout.pages.find((p) => p.id === d.id) : null;
      if (target) {
        if (state.page && state.page !== target.id && isFolderPage(target)) state.history.push(state.page);
        else state.history.length = 0;
        state.page = target.id; render();
      }
    } catch {}
  });
  es.onerror = () => {
    state.lastError = 'sse';
    setOnline(false);
    try { es.close(); } catch {}
    if (state.es === es) state.es = null;
    /* Watchdog-Fenster neu starten, damit nicht sofort erneut geschlossen wird. */
    state.lastEventAt = Date.now();
    updateDiag();
    scheduleReconnect();
  };
}

/* Exponentielles Warten mit Jitter, Deckel 15 s. Bei fehlender Lizenz kein
   Dauerfeuer: der 5-s-Ping prueft, ob die Lizenz inzwischen aktiv ist. */
function scheduleReconnect() {
  if (!state.token || state.licenseRequired) return;
  clearTimeout(state.retryTimer);
  const base = clamp(Number(state.retryDelay) || 1000, 500, 15000);
  const delay = Math.round(base * (0.75 + Math.random() * 0.5));
  state.retryDelay = Math.min(base * 2, 15000);
  state.retryTimer = setTimeout(() => { state.retryTimer = null; connectSSE(); }, delay);
}

/* Nach Rueckkehr aus dem Hintergrund/bfcache oder Netzwechsel: fehlende oder
   veraltete Leitung sofort ersetzen. */
function ensureSSE() {
  if (!state.token || state.licenseRequired) return;
  if (!state.es || sseStale()) connectSSE();
}

function startWatchdog() {
  if (state.watchdog) return;
  state.watchdog = setInterval(() => {
    if (!state.token || state.licenseRequired) return;
    if (!state.es || !state.lastEventAt) return;
    if (Date.now() - state.lastEventAt <= SSE_STALE_MS) return;
    state.lastError = 'sse stale';
    try { state.es.close(); } catch {}
    state.es = null;
    setOnline(false);
    state.lastEventAt = Date.now();
    updateDiag();
    scheduleReconnect();
  }, 10000);
}

/* ---------- Theme ---------- */
function applyTheme(s) {
  if (!s) return;
  const root = document.documentElement;
  if (s.accent) root.style.setProperty('--accent', String(s.accent));
  if (s.radius != null) root.style.setProperty('--r-tile', `${clamp(Number(s.radius), 0, 26)}px`);
  if (s.palette) {
    state.palette = s.palette;
    localStorage.setItem('sp_pal', s.palette);
    if (s.palette === 'graphite') root.removeAttribute('data-pal');
    else root.setAttribute('data-pal', s.palette);
  }
}

/* ---------- Boot / Ping ---------- */
async function boot() {
  try {
    state.info = await fetch('/api/info', { cache: 'no-store' }).then((r) => r.json());
  } catch { state.info = null; }
  if (!state.token) {
    state.pairing = true;
    state.pairFailed = false;
    const ok = await autoPair();
    state.pairing = false;
    if (!ok) { state.pairFailed = true; return; }
  }
  try {
    const l = await api('/api/layout');
    state.layout = l;
    state.autoRetried = false;
    state.st = { ...state.st, ...(l.state || {}) };
    applyTheme(l.settings);
    if (!state.page || !l.pages.some((p) => p.id === state.page)) {
      const first = rootPage() || l.pages[0];
      state.page = first ? first.id : null;
    }
    const m = await api('/api/mixer');
    state.mixer = m.apps || [];
    if (isNum(m.master)) state.st.volume = m.master;
    connectSSE();
    startWatchdog();
    setOnline(true);
  } catch (e) {
    if (e.message === 'license_required') {
      /* PC erreichbar, Lizenz fehlt: Banner zeigen, kein Reconnect-Sturm. */
      setOnline(true);
      updateDiag();
      return;
    }
    if (e.message === 'unauthorized' && !state.autoRetried) {
      state.autoRetried = true;
      if (await autoPair()) return boot();
    }
    if (e.message !== 'unauthorized') setOnline(false);
    updateDiag();
  }
}

async function pingLoop() {
  if (!state.token) return;
  const t0 = performance.now();
  try {
    await api('/api/ping');
  } catch (e) {
    updateDiag();
    if (e.message === 'license_required' || e.message === 'unauthorized') return;
    setOnline(false);
    return;
  }
  state.lat = Math.round(performance.now() - t0);
  state.lastError = '';
  setOnline(true);
  ensureSSE();
  const p = $('#lat');
  if (p) {
    p.textContent = `${state.lat} ms`;
    p.classList.toggle('ok', state.lat < 60);
  }
  updateDiag();
}

function logout() {
  state.token = '';
  localStorage.removeItem('sp_token');
  state.layout = null;
  state.mixer = null;
  state.page = null;
  state.dragIds.clear();
  clearTimeout(state.retryTimer);
  clearTimeout(state.gridTimer);
  if (state.es) { try { state.es.close(); } catch {} state.es = null; }
  state.online = true;
  render();
}

/* ---------- Init ---------- */
$('#gear').onclick = openSheet;
$('#connectBtn').onclick = () => { if (state.token && state.layout) openSheet(); else render(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopScan(); closeSheet(); } });
document.addEventListener('pointerdown', maybeFullscreen, { passive: true, capture: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') maybeFullscreen(); }, { passive: true });
window.addEventListener('resize', () => refit());
window.addEventListener('orientationchange', () => setTimeout(refit, 120));
if (portraitMQ) {
  if (portraitMQ.addEventListener) portraitMQ.addEventListener('change', refit);
  else if (portraitMQ.addListener) portraitMQ.addListener(refit);
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

/* Rueckkehr aus Hintergrund/bfcache oder Netzwechsel: Raster neu rechnen und
   eine fehlende oder still veraltete SSE-Leitung ersetzen. */
function refreshOnReturn() {
  updateOrientation();
  refit();
  if (!state.token) return;
  ensureSSE();
  pingLoop();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOnReturn(); });
window.addEventListener('pageshow', () => refreshOnReturn());
window.addEventListener('online', () => refreshOnReturn());
/* offline nur melden - der 5-s-Ping erkennt die Rueckkehr, kein Reconnect-Spam. */
window.addEventListener('offline', () => { state.lastError = 'offline'; setOnline(false); });
setInterval(pingLoop, 5000);
startWatchdog();

(async () => {
  applyPalette(state.palette);
  document.documentElement.lang = state.lang;
  initSwipe();
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });
  const bb = document.getElementById('backBtn');
  if (bb) bb.onclick = goBack;
  updateOrientation();
  await boot();
  render();
  updateOrientation();
  pingLoop();
  const pairParam = new URLSearchParams(location.search).get('pair');
  if (pairParam && !state.token) {
    try { history.replaceState(null, '', location.pathname); } catch {}
    if (!(await claimCode(pairParam))) toast(t('codeInvalid'), true);
  }
})();
