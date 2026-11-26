// Windows application icons for Novora (Novora / StreamDeck).
//
// Thin Node wrapper around desktop/icons/novora-icons.cpp (dist/tools/novora-icons.exe):
// lists installed apps, reports the foreground window and caches extracted EXE
// icons as PNG under %APPDATA%\Novora\icons.
//
// ES module. Only node:fs, node:path, node:crypto, node:child_process.
// One icon per helper call, spawn with an argument array (no shell), bounded
// timeouts, no network and no upload anywhere.
//
//   const icons = createAppIcons();
//   const apps = await icons.listInstalled();          // { ok, apps: [{name,path,source}] }
//   const fg   = await icons.foreground();             // { ok, path, title, process, pid }
//   const icon = await icons.extractExe('C:\\Windows\\System32\\notepad.exe');
//   // -> { ok, id, pngPath, sha256, width, height, size, cached }
//   const fgIcon = await icons.extractForeground(128);
//   icons.iconPath(icon.id);                            // absolute PNG path or null
//   icons.cleanup(500);                                 // prune old cache files

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_TIMEOUT = 20000;
const LIST_TIMEOUT = 40000;
const FOREGROUND_TIMEOUT = 8000;
const MIN_SIZE = 16;
const MAX_SIZE = 1024;
const DEFAULT_CACHE_LIMIT = 500;

// This file's directory without importing node:url (keeps the import list small).
function moduleDir() {
  const raw = new URL(import.meta.url).pathname;
  const decoded = decodeURIComponent(raw);
  const local = /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
  return path.dirname(local);
}

const HERE = moduleDir();
const ROOT = path.resolve(HERE, '..', '..');

function helperPath() {
  if (process.env.NOVORA_ICONS_EXE) return process.env.NOVORA_ICONS_EXE;
  // Development: <project>/dist/tools/novora-icons.exe
  // Installed:   <install>/tools/novora-icons.exe (see installer/build.ps1)
  const candidates = [
    path.join(ROOT, 'dist', 'tools', 'novora-icons.exe'),
    path.join(ROOT, 'tools', 'novora-icons.exe'),
    path.join(path.dirname(process.execPath), '..', 'tools', 'novora-icons.exe'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Novora', 'tools', 'novora-icons.exe') : '',
    path.join(HERE, 'novora-icons.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* try next */ }
  }
  return candidates[0];
}

function appDataDir() {
  if (process.env.APPDATA) return process.env.APPDATA;
  if (process.env.USERPROFILE) return path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  return path.join(ROOT, '.cache');
}

function cacheDir() {
  return path.join(appDataDir(), 'Novora', 'icons');
}

function ensureCacheDir() {
  const dir = cacheDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

function fail(error, message) {
  return { ok: false, error, message: String(message == null ? '' : message).slice(0, 500) };
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function statSafe(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function readMeta(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// PNG IHDR: 8-byte signature, then width/height as big-endian uint32.
function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Runs the helper and resolves { ok:true, value } with parsed JSON, or
// { ok:false, error, message }. Never rejects, never uses a shell.
function runHelper(args, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let child;
    let timer = null;
    let hardTimer = null;

    // Idempotent: the first result wins, later calls (close after a hard
    // timeout) are ignored.
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      resolve(result);
    };

    try {
      child = spawn(helperPath(), args, {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve(fail('spawn_failed', err && err.message));
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      // kill() is not guaranteed to work (suspended/hung process): settle
      // anyway so the serialised queue cannot stall forever.
      hardTimer = setTimeout(
        () => finish(fail('timeout', `novora-icons antwortet nicht innerhalb von ${timeoutMs} ms`)),
        2000
      );
    }, timeoutMs);

    let out = '';
    let errText = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.length > 8 * 1024 * 1024) {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      errText += chunk;
      if (errText.length > 64 * 1024) errText = errText.slice(0, 64 * 1024);
    });

    child.on('error', (err) => finish(fail('spawn_failed', err && err.message)));
    child.on('close', (code) => {
      if (timedOut) {
        finish(fail('timeout', `novora-icons antwortet nicht innerhalb von ${timeoutMs} ms`));
        return;
      }
      const text = out.trim();
      if (!text) {
        finish(fail('no_output', errText.trim() || `Exitcode ${code}`));
        return;
      }
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        finish(fail('bad_json', text.slice(0, 300)));
        return;
      }
      if (value && value.ok === false) {
        finish(fail(value.error || 'helper_failed', value.message || `Exitcode ${code}`));
        return;
      }
      finish({ ok: true, value });
    });
  });
}

function normalizeSize(size) {
  const n = Number(size);
  if (!Number.isInteger(n)) return null;
  if (n < MIN_SIZE || n > MAX_SIZE) return null;
  return n;
}

// Serialises helper spawns: one icon per call, no parallel storms.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function listInstalled() {
  const res = await runHelper(['--list'], LIST_TIMEOUT);
  if (!res.ok) return res;
  if (!Array.isArray(res.value)) return fail('bad_output', '--list lieferte kein JSON-Array');
  const apps = res.value
    .filter((a) => a && typeof a.name === 'string' && typeof a.path === 'string')
    .map((a) => ({ name: a.name, path: a.path, source: String(a.source || '') }));
  return { ok: true, apps };
}

export async function foreground() {
  const res = await runHelper(['--foreground'], FOREGROUND_TIMEOUT);
  if (!res.ok) return res;
  const v = res.value || {};
  if (typeof v.path !== 'string' || !v.path) return fail('bad_output', '--foreground ohne path');
  return {
    ok: true,
    path: v.path,
    title: typeof v.title === 'string' ? v.title : '',
    process: typeof v.process === 'string' ? v.process : '',
    pid: Number(v.pid) || 0,
  };
}

async function extractExeLocked(exePath, size) {
  if (typeof exePath !== 'string' || !exePath.trim())
    return fail('bad_argument', 'exePath muss ein nicht-leerer String sein');
  const px = normalizeSize(size);
  if (px === null) return fail('bad_argument', `size muss ganzzahlig ${MIN_SIZE}..${MAX_SIZE} sein`);

  const dir = ensureCacheDir();
  if (!dir) return fail('cache_unavailable', `Cache-Ordner nicht beschreibbar: ${cacheDir()}`);

  const st = statSafe(exePath);
  const id = sha256Hex(`${exePath.toLowerCase()}|${st ? st.mtimeMs : 0}|${st ? st.size : 0}|${px}`);
  const pngPath = path.join(dir, `${id}.png`);
  const metaPath = path.join(dir, `${id}.json`);

  // A cache hit needs more than matching metadata: the PNG must still exist
  // with real content, otherwise a truncated/zero-byte file sticks forever.
  if (fs.existsSync(pngPath)) {
    const meta = readMeta(metaPath);
    const pngStat = statSafe(pngPath);
    if (
      meta &&
      meta.id === id &&
      Number(meta.width) > 0 &&
      Number(meta.height) > 0 &&
      pngStat &&
      pngStat.size > 8
    ) {
      const recordedSha = String(meta.sha256 || '');
      let contentOk = true;
      if (recordedSha) {
        try {
          contentOk = sha256Hex(fs.readFileSync(pngPath)) === recordedSha;
        } catch {
          contentOk = false;
        }
      }
      if (contentOk) {
        return {
          ok: true,
          id,
          pngPath,
          sha256: recordedSha,
          width: Number(meta.width),
          height: Number(meta.height),
          size: px,
          cached: true,
        };
      }
      // Hash mismatch: drop the broken PNG so the extraction below rebuilds it.
      try {
        fs.rmSync(pngPath, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  const tmp = path.join(dir, `${id}.${process.pid}.${Date.now()}.tmp.png`);
  let res = await runHelper(['--exe', exePath, '--out', tmp, '--size', String(px)], DEFAULT_TIMEOUT);
  if (!res.ok) {
    const uwpMatch = /^shell:AppsFolder\\([^!\\]+)!/i.exec(exePath.trim());
    if (uwpMatch) {
      res = await runHelper(['--uwp', uwpMatch[1], '--out', tmp, '--size', String(px)], DEFAULT_TIMEOUT);
    }
  }
  if (!res.ok) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return res;
  }

  let buf;
  try {
    buf = fs.readFileSync(tmp);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return fail('read_failed', err && err.message);
  }

  const dims = pngSize(buf);
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return fail('bad_png', 'Helfer lieferte keine gueltige PNG-Datei');
  }

  try {
    fs.renameSync(tmp, pngPath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return fail('write_failed', err && err.message);
  }

  const meta = {
    id,
    exePath,
    size: px,
    sha256: sha256Hex(buf),
    width: dims.width,
    height: dims.height,
    mtimeMs: st ? st.mtimeMs : null,
    exeBytes: st ? st.size : null,
    createdAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch {
    /* metadata is optional, the PNG is the cache hit */
  }

  return {
    ok: true,
    id,
    pngPath,
    sha256: meta.sha256,
    width: meta.width,
    height: meta.height,
    size: px,
    cached: false,
  };
}

export async function extractExe(exePath, size = 256) {
  return enqueue(() => extractExeLocked(exePath, size));
}

export async function extractForeground(size = 256) {
  const fg = await foreground();
  if (!fg.ok) return fg;
  const icon = await extractExe(fg.path, size);
  if (!icon.ok) return { ...icon, exePath: fg.path, title: fg.title };
  return { ...icon, exePath: fg.path, title: fg.title, process: fg.process };
}

export function iconPath(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return null;
  const file = path.join(cacheDir(), `${id}.png`);
  return fs.existsSync(file) ? file : null;
}

export function cleanup(limit = DEFAULT_CACHE_LIMIT) {
  const max = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_CACHE_LIMIT;
  const dir = cacheDir();
  if (!fs.existsSync(dir)) return { ok: true, removed: 0, kept: 0 };

  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return fail('read_failed', err && err.message);
  }

  const pngs = [];
  let removed = 0;
  for (const name of names) {
    const full = path.join(dir, name);
    if (name.endsWith('.tmp.png')) {
      try {
        fs.rmSync(full, { force: true });
        removed += 1;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!name.endsWith('.png')) continue;
    const st = statSafe(full);
    if (!st) continue;
    pngs.push({ name, full, mtime: st.mtimeMs });
  }

  pngs.sort((a, b) => b.mtime - a.mtime);
  const keep = new Set(pngs.slice(0, max).map((e) => e.name.replace(/\.png$/, '')));

  for (const entry of pngs) {
    if (keep.has(entry.name.replace(/\.png$/, ''))) continue;
    try {
      fs.rmSync(entry.full, { force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }

  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.replace(/\.json$/, '');
    if (keep.has(id)) continue;
    try {
      fs.rmSync(path.join(dir, name), { force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }

  return { ok: true, removed, kept: keep.size };
}

export default {
  listInstalled,
  foreground,
  extractExe,
  extractForeground,
  iconPath,
  cleanup,
  cacheDir,
};
