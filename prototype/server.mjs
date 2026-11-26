// Entry point only: wiring of store, auth, actions, discovery and routes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  VERSION, json, readBody, clientIp, isLocal, clampInt, str,
  RateLimiter, LatencyStats, SseHub
} from './lib/protocol.mjs';
import { createAuth, publicDevices } from './lib/auth.mjs';
import { createActions } from './lib/actions.mjs';
import { createDiscovery, listInterfaces } from './lib/discovery.mjs';
import { loadData, saveData } from './lib/store.mjs';
import { createAudio } from './lib/audio.mjs';
import { createDiscordRpc } from './lib/discord-rpc.mjs';
import * as appicons from './lib/appicons.mjs';
import { listApps } from './lib/apps.mjs';
import {
  getStatus as licenseStatus,
  activate as licenseActivate,
  deactivate as licenseDeactivate,
  checkNow as licenseCheckNow,
  ensureStarted as licenseEnsureStarted
} from './lib/license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, 'web');

const PORT = Number(process.env.NOVORA_PORT || 47830);
const DISC_PORT = Number(process.env.NOVORA_DISCOVERY || 47831);

const db = loadData();
const save = () => saveData(db);

// Lizenz frueh laden: die Pruefung ist lokal (Ed25519), der Heartbeat laeuft daneben.
await licenseEnsureStarted();

const audio = createAudio({ scriptPath: path.join(__dirname, 'audio', 'volume.ps1') });

const autoTries = new Map();

function isPrivateAddress(ip) {
  const a = String(ip || '').replace('::ffff:', '');
  if (a === '::1' || a === '127.0.0.1') return true;
  if (a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd')) return true;
  const m = a.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (!m) return false;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return x === 10 || x === 127 || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31);
}

const AUDIO_NAMES = {
  spotify: 'Spotify', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', discord: 'Discord',
  steam: 'Steam', obs64: 'OBS', code: 'VS Code', teams: 'Teams', figma: 'Figma', blender: 'Blender', vlc: 'VLC'
};
const IGNORED = /^(textinputhost|system sounds|audiodg)$/i;
const AUDIO_ON = process.env.NOVORA_AUDIO !== 'off';
let mixerCache = { at: 0, apps: null };
let mixerLoading = false;

function refreshMixer() {
  if (!AUDIO_ON || mixerLoading) return;
  mixerLoading = true;
  audio.list().then((r) => {
    const sessions = (r.sessions || []).filter((s) => s.process && !IGNORED.test(s.process));
    const apps = sessions.map((s) => ({
      id: String(s.process).toLowerCase(),
      name: AUDIO_NAMES[String(s.process).toLowerCase()] || s.name || s.process,
      vol: clampInt(s.volume, 0, 100, 100),
      muted: !!s.muted,
      pid: s.pid
    }));
    if (apps.length) {
      mixerCache = { at: Date.now(), apps };
      push('mixer', { apps });
    }
  }).catch(() => {}).finally(() => { mixerLoading = false; });
}

function liveMixer() {
  if (!AUDIO_ON) return null;
  if (mixerCache.apps && Date.now() - mixerCache.at < 2000) return mixerCache.apps;
  refreshMixer();
  return mixerCache.apps;
}
function invalidateMixer() { mixerCache = { at: 0, apps: null }; }

const hub = new SseHub();
const push = (event, payload) => hub.broadcast(event, payload);

// Unauthenticated pairing clients (no token yet) wait here for `pair` events.
const pairClients = new Map(); // requestId -> Set<res>
const pairLine = (requestId, status) =>
  `event: pair\ndata: ${JSON.stringify({ requestId, status })}\n\n`;

function sendPair(requestId, status) {
  const waiting = pairClients.get(requestId);
  if (!waiting) return;
  const line = pairLine(requestId, status);
  for (const res of waiting) {
    try { res.write(line); } catch { waiting.delete(res); }
  }
  if (status === 'pending') return;
  // Terminal state: the stream has done its job.
  for (const res of waiting) {
    try { res.end(); } catch {}
  }
  pairClients.delete(requestId);
}

function openPairStream(req, res, requestId) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'access-control-allow-origin': '*'
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ requestId })}\n\n`);
  const current = pairClients.get(requestId) || new Set();
  current.add(res);
  pairClients.set(requestId, current);
  const cleanup = () => {
    const set = pairClients.get(requestId);
    if (!set) return;
    set.delete(res);
    if (!set.size) pairClients.delete(requestId);
  };
  req.on('close', cleanup);
}

const auth = createAuth({
  db,
  save,
  onChange: () => push('devices', publicDevices(db.devices)),
  onPair: (requestId, status) => sendPair(requestId, status)
});

const discord = createDiscordRpc({
  onVoice: ({ mute, deaf }) => {
    db.state.mic = !mute;
    db.state.deaf = !!deaf;
    push('state', { mic: db.state.mic, deaf: db.state.deaf, micApp: 'Discord' });
  }
});

const actions = createActions({
  db,
  push,
  audio: AUDIO_ON ? audio : null,
  discord,
  workerPath: path.join(__dirname, 'worker.ps1')
});

const discovery = createDiscovery({
  getName: () => db.name,
  getPort: () => PORT,
  discoveryPort: DISC_PORT,
  version: VERSION
});

const limiter = new RateLimiter({ limit: 30, windowMs: 1000 });
const stats = new LatencyStats(1000);

// ---------- validation helpers for admin writes ----------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Keep unknown scalar fields (e.g. tile.color) so newer UI features survive a save.
const RESERVED = new Set(['id', 'name', 'cols', 'rows', 'tiles', 'type', 'action']);
function copyScalars(src, out, max = 24) {
  let n = 0;
  for (const [key, value] of Object.entries(src)) {
    if (n >= max) break;
    if (RESERVED.has(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else continue;
    n += 1;
  }
  return out;
}

function cleanPages(pages) {
  return pages.slice(0, 64).filter(isObj).map((page) => {
    const out = copyScalars(page, {
      id: str(page.id, 40) || `page-${Math.random().toString(36).slice(2, 8)}`,
      name: str(page.name, 60) || 'Seite',
      cols: clampInt(page.cols, 3, 8, 5),
      rows: clampInt(page.rows, 3, 8, 4)
    });
    if (page.type === 'mixer') out.type = 'mixer';
    // Folder pages are opened from a tile on the top page, not listed as top-level.
    out.folder = page.type === 'mixer' ? false : page.folder === true;
    if (Array.isArray(page.tiles)) {
      out.tiles = page.tiles.slice(0, 256).filter(isObj).map((tile) => {
        const t = copyScalars(tile, {
          key: clampInt(tile.key, 0, 255, 0),
          logo: str(tile.logo, 40) || 'tool'
        });
        if (isObj(tile.action)) t.action = tile.action;
        if (typeof tile.state === 'string') t.state = str(tile.state, 20);
        // Monogram tiles: short letter kept explicit (logo may be 'letter').
        if (typeof tile.letter === 'string') t.letter = str(tile.letter, 2);
        return t;
      });
    }
    return out;
  });
}

function cleanMixer(apps) {
  return apps.slice(0, 64).filter(isObj).map((app) => ({
    id: str(app.id, 40) || 'app',
    name: str(app.name, 60) || 'App',
    vol: clampInt(app.vol, 0, 100, 50),
    muted: app.muted === true
  }));
}

// ---------- installed apps (Get-StartApps) ----------
const APPS_TTL = 60000;
let appsCache = { at: 0, apps: null };
let appsInflight = null;

const DROP_NAME_RE = /entfernen|uninstall|deinstallieren|deinstall/i;
const DROP_APPID_RE = /(unins000|uninstall|uninst)\.exe$/i;
const DRIVE_PATH_RE = /^[A-Za-z]:\\/;
const DROP_SHELL = new Set(['ausführen', 'run', 'ausführen...']);

// uwp / shell / exe -- informational only, nothing is filtered on this.
function appKind(appid) {
  if (appid.startsWith('{') || /^shell:/i.test(appid)) return 'shell';
  if (!appid.includes('\\') && !/\.exe$/i.test(appid) && !appid.startsWith('{')) return 'uwp';
  return 'exe';
}

function fetchStartApps() {
  if (appsInflight) return appsInflight;
  appsInflight = new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'],
      { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: 'apps lookup failed' });
        let parsed;
        try {
          const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
          parsed = text ? JSON.parse(text) : [];
        } catch {
          return resolve({ ok: false, error: 'apps parse failed' });
        }
        const seen = new Set();
        const apps = (Array.isArray(parsed) ? parsed : [parsed])
          .filter((a) => a && typeof a.Name === 'string' && typeof a.AppID === 'string')
          .map((a) => ({ name: a.Name.slice(0, 160), appid: a.AppID.slice(0, 300) }))
          // Drop uninstallers and developer folders -- they are not launchable apps.
          .filter((a) => !DROP_NAME_RE.test(a.name))
          .filter((a) => !DROP_APPID_RE.test(a.appid))
          .filter((a) => !DRIVE_PATH_RE.test(a.appid))
          .filter((a) => !DROP_SHELL.has(a.name.trim().toLowerCase()))
          // Informational only, never filtered on: uwp / shell / exe.
          .map((a) => ({ ...a, kind: appKind(a.appid) }))
          .filter((a) => {
            const key = `${a.name.toLowerCase()}|${a.appid.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 500);
        return resolve({ ok: true, apps });
      }
    );
  }).finally(() => { appsInflight = null; });
  return appsInflight;
}

// ---------- static files ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive'
};

function serveStatic(res, pathname) {
  let rel = pathname === '/' || pathname === '/app'
    ? 'app.html'
    : pathname === '/pc'
      ? 'pc.html'
      : pathname === '/activate'
        ? 'activate.html'
        : pathname.replace(/^\/+/, '');
  try { rel = decodeURIComponent(rel); } catch {}
  if (!rel || rel.includes('\0')) return json(res, 400, { ok: false, error: 'bad path' });

  const full = path.normalize(path.join(WEB, rel));
  if (full !== WEB && !full.startsWith(WEB + path.sep)) {
    return json(res, 400, { ok: false, error: 'bad path' });
  }

  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    };
    if (ext === '.apk') headers['content-disposition'] = 'attachment; filename="Novora.apk"';
    res.writeHead(200, headers);
    res.end(buf);
  });
}

// ---------- license gate ----------
const LICENSE_ALLOWED = new Set([
  '/activate',
  '/activate.html',
  '/activate.js',
  '/style.css',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/api/info'
]);

function sendLicensePage(res) {
  const body = '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="dark"><title>Novora – Lizenz nötig</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#080A0F;color:#E6EDF3;font:15px/1.5 "Segoe UI",system-ui,sans-serif;padding:24px}' +
    'main{max-width:440px;background:#11141B;border:1px solid #232833;border-radius:16px;padding:28px}' +
    'h1{margin:0 0 10px;font-size:20px}p{margin:0 0 14px;color:#9AA3B2}' +
    'a{display:inline-block;padding:10px 16px;border-radius:10px;background:#22D3EE;color:#06121A;' +
    'font-weight:600;text-decoration:none}small{display:block;margin-top:14px;color:#8B96A5}</style>' +
    '</head><body><main><h1>Lizenz auf dem PC aktivieren</h1>' +
    '<p>Novora ist auf diesem PC noch nicht lizenziert. Öffne die Aktivierung am PC und gib dort deinen Lizenzschlüssel ein.</p>' +
    '<a href="/activate">Zur Aktivierung</a>' +
    '<small>Die Handy-App startet erst, wenn der PC lizenziert ist.</small>' +
    '</main></body></html>';
  res.writeHead(402, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

// true = Anfrage wurde abgefangen. Status wird pro Anfrage neu gelesen.
function licenseGate(res, p) {
  if (licenseStatus().licensed) return false;
  if (LICENSE_ALLOWED.has(p) || p.startsWith('/assets/') || p.startsWith('/downloads/') || p.startsWith('/api/license/local/')) return false;
  if (p === '/pc' || p === '/pc.html') {
    res.writeHead(302, { location: '/activate', 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  if (p === '/app' || p === '/') {
    sendLicensePage(res);
    return true;
  }
  if (p.startsWith('/api/')) {
    json(res, 402, { ok: false, error: 'license_required' });
    return true;
  }
  sendLicensePage(res);
  return true;
}

// ---------- routes ----------
async function route(req, res, url, ip) {
  const p = url.pathname;

  // --- public ---
  if (p === '/api/info' && req.method === 'GET') {
    return json(res, 200, {
      name: db.name,
      version: VERSION,
      port: PORT,
      host: os.hostname(),
      discoveryPort: DISC_PORT
    });
  }

  // --- license (localhost only) ---
  if (p.startsWith('/api/license/local/')) {
    if (!isLocal(ip)) return json(res, 403, { ok: false, error: 'localhost only' });

    if (p === '/api/license/local/status' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...licenseStatus() });
    }

    if (p === '/api/license/local/activate' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      const key = str(body.key, 120).trim();
      if (!key) return json(res, 400, { ok: false, error: 'invalid_key', message: 'Bitte Lizenzschlüssel eingeben.' });
      const result = await licenseActivate(key);
      if (!result.ok) return json(res, result.httpStatus || 400, result);
      return json(res, 200, result);
    }

    if (p === '/api/license/local/deactivate' && req.method === 'POST') {
      const result = await licenseDeactivate();
      return json(res, 200, result);
    }

    if (p === '/api/license/local/check' && req.method === 'POST') {
      return json(res, 200, { ok: true, status: await licenseCheckNow() });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  }

  // Gate: ohne Lizenz nur Aktivierung und statische Mindestseiten.
  if (licenseGate(res, p)) return;

  if (p === '/api/pair/request' && req.method === 'POST') {
    if (!isLocal(ip) && !auth.find(req, url)) return json(res, 403, { ok: false, error: 'local only' });
    return json(res, 200, auth.requestCode());
  }

  if (p === '/api/pair/claim' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__error) return json(res, 413, { ok: false, error: body.__error });
    const result = auth.claim(ip, body.code, body.device);
    if (result.ok) return json(res, 200, result);
    if (result.error === 'locked') return json(res, 429, result);
    return json(res, 403, result);
  }

  // Automatisches Koppeln im privaten Netz (abschaltbar im PC-Editor)
  if (p === '/api/pair/auto' && req.method === 'POST') {
    if (db.settings.autoPair === false) return json(res, 403, { ok: false, error: 'auto pairing off' });
    if (!isPrivateAddress(ip)) return json(res, 403, { ok: false, error: 'private network only' });
    const tries = autoTries.get(ip) || { n: 0, ts: Date.now() };
    if (Date.now() - tries.ts > 60000) { tries.n = 0; tries.ts = Date.now(); }
    tries.n += 1;
    autoTries.set(ip, tries);
    if (tries.n > 12) return json(res, 429, { ok: false, error: 'too many pairing attempts' });

    const body = await readBody(req);
    if (body.__error) return json(res, 413, { ok: false, error: body.__error });
    const name = (str(body.device, 40) || 'Gerät').trim() || 'Gerät';
    const hwid = (str(body.hwid, 64) || '').trim();

    // Known device (paired before, not removed) -> straight in.
    const known = hwid && db.devices.some((d) => d.hwid === hwid);
    // Approval can be turned off; then this is the old auto-pair behaviour.
    if (known || db.settings.requireApproval === false) {
      const issued = auth.link(hwid, name);
      return json(res, 200, { ok: true, auto: true, token: issued.token, device: issued.device });
    }

    // Unknown device: PC must confirm once. No token yet.
    const request = auth.requestPair({ device: name, hwid, ip });
    return json(res, 200, { ok: true, pending: true, requestId: request.requestId, pcName: db.name });
  }

  // Status of a pending request (works without a token: the phone has none yet).
  if (p === '/api/pair/status' && req.method === 'GET') {
    return json(res, 200, auth.pairStatus(url.searchParams.get('id') || ''));
  }

  // SSE stream for the waiting phone so it does not have to poll.
  if (p === '/api/pair/events' && req.method === 'GET') {
    const requestId = url.searchParams.get('id') || '';
    if (!requestId) return json(res, 400, { ok: false, error: 'id required' });
    return openPairStream(req, res, requestId);
  }

  // --- authenticated app api ---
  if (p.startsWith('/api/') && !p.startsWith('/api/pair') && !p.startsWith('/api/admin')) {
    const device = auth.find(req, url);
    if (!device) return json(res, 401, { ok: false, error: 'unauthorized' });

    if (p === '/api/layout' && req.method === 'GET') {
      return json(res, 200, {
        profile: db.profile,
        pages: db.pages,
        state: db.state,
        settings: db.settings,
        name: db.name
      });
    }

    if (p === '/api/ping' && req.method === 'GET') {
      return json(res, 200, { ts: Date.now(), server: performance.now() });
    }

    if (p === '/api/press' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      const page = db.pages.find((x) => x.id === body.page);
      if (!page) return json(res, 200, { ok: false, error: 'unknown page' });
      const tile = (page.tiles || []).find((t) => t.key === Number(body.key));
      if (!tile) return json(res, 200, { ok: false, error: 'unknown tile' });
      return json(res, 200, await actions.execute(tile.action));
    }

    if (p === '/api/grid' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      const page = db.pages.find((x) => x.id === body.page);
      if (!page) return json(res, 404, { ok: false, error: 'unknown page' });
      page.cols = clampInt(body.cols, 3, 8, page.cols || 5);
      page.rows = clampInt(body.rows, 3, 8, page.rows || 4);
      save();
      push('layout', { pages: db.pages });
      return json(res, 200, { ok: true, page });
    }

    if (p === '/api/mixer') {
      if (req.method === 'GET') {
        const live = liveMixer();
        return json(res, 200, { apps: live || db.mixer, master: db.state.volume, live: !!live });
      }

      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });

      let applied = false;
      if (AUDIO_ON && (body.id || body.pid)) {
        const target = body.pid ? { pid: body.pid } : { process: String(body.id) };
        if (typeof body.vol === 'number') {
          const r = await audio.setVolume(target, clampInt(body.vol, 0, 100, 50));
          applied = r?.ok !== false;
        }
        if (typeof body.muted === 'boolean') {
          const r = await audio.setMuted(target, body.muted);
          applied = r?.ok !== false;
        }
      }

      const app = db.mixer.find((x) => x.id === body.id);
      if (app) {
        if (typeof body.vol === 'number') app.vol = clampInt(body.vol, 0, 100, app.vol);
        if (typeof body.muted === 'boolean') app.muted = body.muted;
        save();
      }
      invalidateMixer();
      refreshMixer();
      const apps = liveMixer() || db.mixer;
      push('mixer', { apps });
      return json(res, 200, { ok: true, applied, apps });
    }

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'access-control-allow-origin': '*'
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ name: db.name })}\n\n`);
      const client = hub.add(res, device.id);
      const cleanup = () => hub.remove(client);
      req.on('close', cleanup);
      res.on('close', cleanup);
      return;
    }

    return json(res, 404, { ok: false, error: 'not found' });
  }

  // --- pc admin (localhost only) ---
  if (p.startsWith('/api/admin')) {
    if (!isLocal(ip)) return json(res, 403, { ok: false, error: 'localhost only' });

    if (p === '/api/admin/overview' && req.method === 'GET') {
      return json(res, 200, {
        name: db.name,
        version: VERSION,
        port: PORT,
        discoveryPort: DISC_PORT,
        nets: listInterfaces().map(({ name, ip, mask }) => ({ iface: name, ip, mask })),
        devices: publicDevices(db.devices),
        latencyClients: hub.size
      });
    }

    if (p === '/api/admin/net' && req.method === 'GET') {
      return json(res, 200, {
        interfaces: listInterfaces(),
        port: PORT,
        discoveryPort: DISC_PORT
      });
    }

    if (p === '/api/admin/discord/status' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...discord.status() });
    }

    if (p === '/api/admin/discord/connect' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      try {
        const st = await discord.authorize({ clientId: body.clientId, clientSecret: body.clientSecret });
        return json(res, 200, { ok: true, ...st });
      } catch (e) {
        return json(res, 400, { ok: false, error: e?.message || 'Discord-Verbindung fehlgeschlagen' });
      }
    }

    if (p === '/api/admin/discord/connect-stored' && req.method === 'POST') {
      try {
        const st = await discord.connect();
        return json(res, 200, { ok: true, ...st });
      } catch (e) {
        return json(res, 400, { ok: false, error: e?.message || 'Discord-Verbindung fehlgeschlagen' });
      }
    }

    if (p === '/api/admin/discord/disconnect' && req.method === 'POST') {
      discord.disconnect();
      return json(res, 200, { ok: true, ...discord.status() });
    }

    if (p === '/api/admin/stats' && req.method === 'GET') {
      return json(res, 200, stats.stats());
    }

    if (p === '/api/admin/apps' && req.method === 'GET') {
      if (appsCache.apps && Date.now() - appsCache.at < APPS_TTL) {
        return json(res, 200, { ok: true, apps: appsCache.apps, cached: true });
      }
      const result = await fetchStartApps();
      if (!result.ok) return json(res, 503, { ok: false, error: result.error });
      appsCache = { at: Date.now(), apps: result.apps };
      return json(res, 200, { ok: true, apps: result.apps });
    }

    if (p === '/api/admin/installed-apps' && req.method === 'GET') {
      const result = await listApps({ refresh: url.searchParams.get('refresh') === '1' });
      if (!result || !result.ok) {
        return json(res, 503, { ok: false, error: result?.error || 'app scan failed' });
      }
      return json(res, 200, { ok: true, apps: result.apps });
    }

    // --- installed app icons (novora-icons.exe, cache under %APPDATA%\Novora\icons) ---
    if (p === '/api/admin/appicons/list' && req.method === 'GET') {
      const result = await appicons.listInstalled();
      if (!result.ok) return json(res, 503, { ok: false, error: result.error, message: result.message });
      return json(res, 200, { ok: true, apps: result.apps });
    }

    if (p === '/api/admin/appicons/foreground' && req.method === 'POST') {
      const icon = await appicons.extractForeground(256);
      if (!icon.ok) return json(res, 502, { ok: false, error: icon.error, message: icon.message });
      const app = {
        name: path.basename(icon.exePath || '') || 'Aktives Fenster',
        path: icon.exePath,
        title: icon.title || '',
        process: icon.process || '',
        id: icon.id,
        png: `/assets/appicons/${icon.id}.png`,
        sha256: icon.sha256,
        width: icon.width,
        height: icon.height
      };
      return json(res, 200, { ok: true, app });
    }

    if (p === '/api/admin/appicons/extract' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      const exePath = str(body.path, 1024).trim();
      const prefPath = str(body.iconPath, 1024).trim();
      if (!exePath && !prefPath) return json(res, 400, { ok: false, error: 'path required' });
      let icon = prefPath ? await appicons.extractExe(prefPath, 256) : null;
      if ((!icon || !icon.ok) && exePath && exePath !== prefPath) {
        icon = await appicons.extractExe(exePath, 256);
      }
      if (!icon || !icon.ok) {
        return json(res, 502, { ok: false, error: icon?.error || 'extract_failed', message: icon?.message || '' });
      }
      return json(res, 200, {
        ok: true,
        id: icon.id,
        png: `/assets/appicons/${icon.id}.png`,
        sha256: icon.sha256,
        width: icon.width,
        height: icon.height,
        path: exePath || prefPath
      });
    }

    if (p === '/api/admin/layout' && req.method === 'GET') {
      return json(res, 200, {
        pages: db.pages,
        mixer: db.mixer,
        state: db.state,
        settings: db.settings
      });
    }

    if (p === '/api/admin/save' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      if (Array.isArray(body.pages)) db.pages = cleanPages(body.pages);
      if (Array.isArray(body.mixer)) db.mixer = cleanMixer(body.mixer);
      if (isObj(body.settings)) db.settings = { ...db.settings, ...body.settings };
      save();
      push('layout', { pages: db.pages });
      push('mixer', { apps: db.mixer });
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/revoke' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      if (typeof body.id !== 'string') return json(res, 400, { ok: false, error: 'invalid id' });
      auth.revoke(body.id);
      hub.closeDevice(body.id);
      return json(res, 200, { ok: true, devices: publicDevices(db.devices) });
    }

    // --- pairing approval (PC confirms a new device once) ---
    if (p === '/api/admin/pair/requests' && req.method === 'GET') {
      return json(res, 200, { ok: true, requests: auth.listPairs() });
    }

    if (p === '/api/admin/pair/allow' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      if (typeof body.id !== 'string') return json(res, 400, { ok: false, error: 'invalid id' });
      const result = auth.allowPair(body.id);
      if (!result.ok) return json(res, result.error === 'unknown request' ? 404 : 409, result);
      return json(res, 200, { ok: true, device: result.device });
    }

    if (p === '/api/admin/pair/deny' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      if (typeof body.id !== 'string') return json(res, 400, { ok: false, error: 'invalid id' });
      const result = auth.denyPair(body.id);
      if (!result.ok) return json(res, result.error === 'unknown request' ? 404 : 409, result);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/test' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.__error) return json(res, 413, { ok: false, error: body.__error });
      const action = isObj(body.action) ? body.action : { type: 'volume', dir: 'up' };
      return json(res, 200, await actions.execute(action));
    }

    return json(res, 404, { ok: false, error: 'not found' });
  }

  // --- local EXE icon cache ---
  if (p.startsWith('/assets/appicons/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const id = p.slice('/assets/appicons/'.length).replace(/\.png$/i, '');
    const file = appicons.iconPath(id);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end('not found');
    }
    return fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(buf);
    });
  }

  if (p === '/api/discord/callback' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('<!doctype html><meta charset="utf-8"><body style="background:#0D1117;color:#E9EFF7;font-family:sans-serif;padding:40px;text-align:center"><h2>Discord verbunden</h2><p>Du kannst dieses Fenster jetzt schließen.</p></body>');
  }

  // --- static ---
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, p);
  return json(res, 405, { ok: false, error: 'method not allowed' });
}

// ---------- http server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = clientIp(req);

  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (url.pathname.startsWith('/api/')) {
    // 30 requests per second per IP is plenty for UI and pairing flows.
    if (!limiter.allow(ip)) return json(res, 429, { ok: false, error: 'rate limited' });
    if (url.pathname !== '/api/events') {
      const t0 = performance.now();
      res.on('finish', () => stats.push(performance.now() - t0));
    }
  }

  try {
    await route(req, res, url, ip);
  } catch (err) {
    console.error(`[http] ${req.method} ${url.pathname} failed: ${err.message}`);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'internal error' });
    else res.end();
  }
});

server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {}
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = listInterfaces().map((i) => i.ip);
  console.log(`Novora ${VERSION} – ${db.name}`);
  console.log(`  PC-Editor : http://127.0.0.1:${PORT}/pc`);
  console.log(`  Handy     : ${ips.map((ip) => `http://${ip}:${PORT}/app`).join('  |  ') || `http://127.0.0.1:${PORT}/app`}`);
  console.log(`  Discovery : UDP ${DISC_PORT}`);
  discovery.announce();
  actions.warm();
  audio.warm();
  discord.start();
  setTimeout(refreshMixer, 400);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[server] shutting down');
  hub.closeAll();
  discovery.stop();
  actions.stop();
  audio.stop();
  discord.stop();
  save();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
