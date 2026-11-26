// Automatischer Smoke-Test für den Novora-Prototyp.
// Startet server.mjs als Kindprozess auf eigenen Ports (47850/47851) mit
// eigener Datendatei im Temp-Verzeichnis. Der Live-Server auf 47830 bleibt
// unberührt. Nur Node-Standardbibliothek, keine externen Pakete.
//
// Aufruf: node prototype/test/smoke.mjs
// Exit:   0 = alle Tests grün, 1 = mindestens ein Fehlschlag

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTOTYPE = path.resolve(__dirname, '..');
const SERVER = path.join(PROTOTYPE, 'server.mjs');

const PORT = 47850;
const DISC_PORT = 47851;
const LIVE_PORT = 47830; // nur als Hinweis, wird nie angesprochen
const BASE = `http://127.0.0.1:${PORT}`;
const GAP_MS = 40;          // Abstand zwischen API-Aufrufen (Limit: 30/s)
const START_TIMEOUT_MS = 5000;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novora-smoke-'));
const dataPath = path.join(tmpDir, 'data.json');

let child = null;
let token = '';
let stderrTail = '';
const results = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- HTTP-Client mit Taktung und 429-Wiederholung ----------
let nextSlot = 0;
async function api(pathname, { method = 'GET', body, auth, timeout = 5000 } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + GAP_MS;
    if (wait > 0) await sleep(wait);

    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers['x-token'] = auth;

    const res = await fetch(BASE + pathname, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* HTML/Leerbody */ }

    if (res.status === 429 && attempt < 2) {
      nextSlot = Date.now() + 350;
      continue;
    }
    return { status: res.status, json, text };
  }
  return { status: 0, json: null, text: '' };
}

// ---------- Test-Rahmen ----------
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t0);
    results.push({ name, ok: true });
    console.log(`ok    ${name}  (${ms} ms${detail ? `, ${detail}` : ''})`);
    return true;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    results.push({ name, ok: false, error: err.message });
    console.log(`FAIL  ${name}  (${ms} ms)  ->  ${err.message}`);
    return false;
  }
}

// ---------- Prozessverwaltung ----------
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(400, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function startServer() {
  const env = {
    ...process.env,
    NOVORA_PORT: String(PORT),
    NOVORA_DISCOVERY: String(DISC_PORT),
    NOVORA_DATA: dataPath,
  NOVORA_AUDIO: 'off'
  };
  const proc = spawn(process.execPath, [SERVER], {
    cwd: PROTOTYPE,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-1200);
  });
  return proc;
}

async function waitForServer(proc) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Server sofort beendet (Code ${proc.exitCode})${stderrTail ? `: ${stderrTail.trim()}` : ''}`);
    }
    try {
      const res = await fetch(`${BASE}/api/info`, { signal: AbortSignal.timeout(700) });
      if (res.ok) return await res.json();
    } catch { /* noch nicht bereit */ }
    await sleep(100);
  }
  throw new Error(`Server nicht erreichbar nach ${START_TIMEOUT_MS} ms${stderrTail ? `: ${stderrTail.trim()}` : ''}`);
}

function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    proc.once('exit', finish);
    try { proc.kill('SIGTERM'); } catch { /* schon weg */ }
    setTimeout(() => {
      if (proc.exitCode === null) {
        try { proc.kill('SIGKILL'); } catch { /* egal */ }
      }
      finish();
    }, 2500).unref?.();
  });
}

function cleanup() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Datei noch gesperrt */ }
}

// ---------- Tests ----------
async function run() {
  if (await portInUse(PORT)) {
    throw new Error(`Port ${PORT} ist bereits belegt – Test kann nicht starten`);
  }
  if (await portInUse(LIVE_PORT)) {
    console.log(`Hinweis: Live-Server auf ${LIVE_PORT} läuft, wird nicht angefasst.`);
  }

  child = startServer();
  const info = await waitForServer(child);

  // 1) Info-Form
  await test('Info-Form (/api/info)', async () => {
    assert(info && typeof info === 'object', 'Antwort ist kein Objekt');
    assert(typeof info.name === 'string' && info.name.length > 0, 'name fehlt');
    assert(typeof info.version === 'string' && /^\d+\.\d+\.\d+$/.test(info.version), 'version unbrauchbar');
    assert(info.port === PORT, `port ${info.port} != ${PORT}`);
    assert(info.discoveryPort === DISC_PORT, `discoveryPort ${info.discoveryPort} != ${DISC_PORT}`);
    assert(typeof info.host === 'string' && info.host.length > 0, 'host fehlt');
    return `v${info.version}, ${info.name}`;
  });

  // 2) Pairing: Code anfordern + einlösen
  let code = '';
  await test('Pairing-Code anfordern', async () => {
    const res = await api('/api/pair/request', { method: 'POST', body: {} });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(/^\d{6}$/.test(res.json?.code || ''), 'Code ist nicht 6-stellig');
    assert(res.json.expires === 120, `expires ${res.json.expires} != 120`);
    code = res.json.code;
    return `Code ${code}`;
  });

  await test('Pairing einlösen -> Token', async () => {
    const res = await api('/api/pair/claim', {
      method: 'POST',
      body: { code, device: 'Smoke-Test' }
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json.ok === true, `ok=${res.json.ok}`);
    assert(/^[0-9a-f]{64}$/.test(res.json.token || ''), 'Token ist nicht 64 Hex-Zeichen');
    assert(res.json.device && typeof res.json.device.id === 'string', 'device.id fehlt');
    assert(res.json.device.name === 'Smoke-Test', 'Gerätename nicht übernommen');
    token = res.json.token;
    return `Gerät ${res.json.device.id.slice(0, 8)}…`;
  });

  // 3) Layout
  let layoutBefore = null;
  await test('Layout (/api/layout)', async () => {
    const res = await api('/api/layout', { auth: token });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.json.pages) && res.json.pages.length >= 1, 'keine Seiten');
    assert(res.json.state && typeof res.json.state.mic === 'boolean', 'state.mic fehlt');
    layoutBefore = res.json;
    return `${res.json.pages.length} Seiten, mic=${res.json.state.mic}`;
  });

  // 4) Taste 0 = Mikrofon, zweiter Druck muss zurückschalten
  await test('Press Taste 0 (mic) -> ok', async () => {
    const res = await api('/api/press', {
      method: 'POST', auth: token, body: { page: 'home', key: 0 }
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json.ok === true, `ok=${res.json.ok} (${res.json.error || '-'})`);
    return `${res.json.ms} ms Serverzeit`;
  });

  await test('Press Taste 0 erneut -> Zustand wechselt', async () => {
    const after1 = await api('/api/layout', { auth: token });
    assert(after1.status === 200, `Layout nach Druck 1: HTTP ${after1.status}`);
    const flipped = after1.json.state.mic;
    assert(flipped !== layoutBefore.state.mic, 'mic-Zustand nach erstem Druck unverändert');

    const res = await api('/api/press', {
      method: 'POST', auth: token, body: { page: 'home', key: 0 }
    });
    assert(res.status === 200 && res.json.ok === true, 'zweiter Druck fehlgeschlagen');

    const after2 = await api('/api/layout', { auth: token });
    assert(after2.json.state.mic === layoutBefore.state.mic,
      `mic blieb ${after2.json.state.mic}, erwartet ${layoutBefore.state.mic}`);
    return `mic ${layoutBefore.state.mic} -> ${flipped} -> ${after2.json.state.mic}`;
  });

  // 5) Raster: gültig + Klemmung
  await test('Grid 6x5 gültig', async () => {
    const res = await api('/api/grid', {
      method: 'POST', auth: token, body: { page: 'home', cols: 6, rows: 5 }
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json.ok === true, `ok=${res.json.ok}`);
    assert(res.json.page.cols === 6 && res.json.page.rows === 5, `erhalten ${res.json.page.cols}x${res.json.page.rows}`);
    return '6x5 gespeichert';
  });

  await test('Grid-Klemmung auf 3..8', async () => {
    const res = await api('/api/grid', {
      method: 'POST', auth: token, body: { page: 'home', cols: 99, rows: 1 }
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json.ok === true, `ok=${res.json.ok}`);
    assert(res.json.page.cols === 8, `cols ${res.json.page.cols} != 8`);
    assert(res.json.page.rows === 3, `rows ${res.json.page.rows} != 3`);
    return '99x1 -> 8x3';
  });

  // 6) Mixer GET/POST
  let mixerBefore = null;
  await test('Mixer GET', async () => {
    const res = await api('/api/mixer', { auth: token });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.json.apps) && res.json.apps.length > 0, 'keine Apps');
    assert(typeof res.json.master === 'number', 'master fehlt');
    mixerBefore = res.json.apps[0];
    return `${res.json.apps.length} Apps, master=${res.json.master}`;
  });

  await test('Mixer POST (vol/muted)', async () => {
    const res = await api('/api/mixer', {
      method: 'POST', auth: token,
      body: { id: mixerBefore.id, vol: 33, muted: true }
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json.ok === true, `ok=${res.json.ok}`);
    const app = res.json.apps.find((a) => a.id === mixerBefore.id);
    assert(app && app.vol === 33 && app.muted === true, `Werte ${app?.vol}/${app?.muted} nicht übernommen`);

    const check = await api('/api/mixer', { auth: token });
    const persisted = check.json.apps.find((a) => a.id === mixerBefore.id);
    assert(persisted.vol === 33 && persisted.muted === true, 'Änderung nicht lesbar');
    return `${mixerBefore.id} -> 33 %, stumm`;
  });

  // 7) Ping
  await test('Ping (/api/ping)', async () => {
    const res = await api('/api/ping', { auth: token });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(typeof res.json.ts === 'number' && res.json.ts > 0, 'ts fehlt');
    assert(typeof res.json.server === 'number', 'server fehlt');
    return `ts ${res.json.ts}`;
  });

  // 8) Admin-Endpunkte von 127.0.0.1
  await test('Admin /net (127.0.0.1)', async () => {
    const res = await api('/api/admin/net');
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.json.interfaces), 'interfaces fehlt');
    assert(res.json.port === PORT && res.json.discoveryPort === DISC_PORT, 'Ports falsch');
    for (const iface of res.json.interfaces) {
      assert(typeof iface.name === 'string' && typeof iface.ip === 'string', 'Interface-Form unbrauchbar');
    }
    return `${res.json.interfaces.length} Interfaces`;
  });

  await test('Admin /stats (127.0.0.1)', async () => {
    const res = await api('/api/admin/stats');
    assert(res.status === 200, `HTTP ${res.status}`);
    const s = res.json;
    for (const key of ['p50', 'p95', 'p99', 'count']) {
      assert(typeof s[key] === 'number', `${key} fehlt`);
    }
    assert(s.p50 <= s.p95 && s.p95 <= s.p99, 'Perzentile nicht sortiert');
    return `p50 ${s.p50} ms, p95 ${s.p95} ms, n=${s.count}`;
  });

  // 9) Sicherheit: ungültiger Token, Code-Wiederverwendung, 404
  await test('Ungültiger Token -> 401', async () => {
    const res = await api('/api/layout', { auth: 'deadbeef'.repeat(8) });
    assert(res.status === 401, `HTTP ${res.status}, erwartet 401`);
    assert(res.json?.ok === false, 'ok-Flag fehlt');
    return 'abgelehnt';
  });

  await test('Code-Wiederverwendung -> 403', async () => {
    const res = await api('/api/pair/claim', {
      method: 'POST', body: { code, device: 'Zweiter Versuch' }
    });
    assert(res.status === 403, `HTTP ${res.status}, erwartet 403`);
    assert(res.json?.ok === false, 'ok-Flag fehlt');
    return 'Einmal-Code erkannt';
  });

  await test('Unbekannter Endpunkt -> 404', async () => {
    const res = await api('/api/gibtsnicht', { auth: token });
    assert(res.status === 404, `HTTP ${res.status}, erwartet 404`);
    return 'sauber 404';
  });

  // 10) Statische Auslieferung (nicht API-limitiert)
  await test('Handy-UI wird ausgeliefert (/app)', async () => {
    const res = await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(3000) });
    const html = await res.text();
    assert(res.status === 200, `HTTP ${res.status}`);
    assert((res.headers.get('content-type') || '').includes('text/html'), 'kein HTML');
    assert(/<html/i.test(html), 'HTML-Gerüst fehlt');
    return `${html.length} Bytes`;
  });

  // 10b) Installierte Apps & EXE-Icon-Extraktion
  await test('Installierte Apps (/api/admin/installed-apps)', async () => {
    const res = await api('/api/admin/installed-apps');
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.json?.ok === true, 'ok-Flag fehlt');
    assert(Array.isArray(res.json.apps), 'apps ist kein Array');
    if (res.json.apps.length > 0) {
      assert(typeof res.json.apps[0].path === 'string' && typeof res.json.apps[0].iconPath === 'string', 'path/iconPath fehlt');
    }
    return `${res.json.apps.length} Apps`;
  });

  await test('EXE-Icon extrahieren & ausliefern', async () => {
    const res = await api('/api/admin/appicons/extract', {
      method: 'POST',
      body: { path: 'C:\\Windows\\System32\\notepad.exe' }
    });
    assert(res.status === 200, `HTTP ${res.status} (${res.json?.error || ''})`);
    assert(res.json?.ok === true && /^[a-f0-9]{64}$/.test(res.json.id || ''), 'icon id ungueltig');
    const imgRes = await fetch(`${BASE}${res.json.png}`, { signal: AbortSignal.timeout(3000) });
    assert(imgRes.status === 200, `PNG HTTP ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    assert(buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47, 'kein gueltiger PNG-Header');
    return `${res.json.width}x${res.json.height} PNG (${buf.length} B)`;
  });

  await test('Isolierte Datendatei angelegt', async () => {
    assert(fs.existsSync(dataPath), 'Temp-Daten fehlen');
    const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert(Array.isArray(saved.devices) && saved.devices.length === 1, `devices=${saved.devices?.length}`);
    assert(saved.devices[0].hash && !('token' in saved.devices[0]), 'Token im Klartext gespeichert?');
    return 'Token nur als Hash';
  });
}

// ---------- Ablauf ----------
let exitCode = 1;
try {
  await run();
  const failed = results.filter((r) => !r.ok).length;
  exitCode = failed === 0 ? 0 : 1;
  console.log('');
  console.log(`${results.length - failed}/${results.length} Tests grün` +
    (failed ? `, ${failed} fehlgeschlagen` : ''));
  if (failed) {
    console.log('Fehlgeschlagen:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.error}`);
  }
} catch (err) {
  console.log(`FAIL  Start  ->  ${err.message}`);
  if (stderrTail) console.log(`Server-Log: ${stderrTail.trim()}`);
  exitCode = 1;
} finally {
  await stopServer(child);
  cleanup();
  if (child && child.exitCode === null) {
    // letzter Notausstieg, falls SIGKILL nicht griff
    try { child.kill('SIGKILL'); } catch { /* egal */ }
  }
}

process.exit(exitCode);
