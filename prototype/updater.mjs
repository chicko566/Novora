#!/usr/bin/env node
// Novora PC updater. Runs BEFORE the server (called by the launcher, also usable by hand):
//   node updater.mjs --manifest <url|pfad> --app <dir> --pubkey <pfad|base64> [options]
//
// Checks manifest signature (Ed25519, mandatory), version, SHA-256, unpacks into
// <org>/.update and swaps <org>/app atomically with rollback. Never destroys a
// working installation.
//
// Exit codes: 0 = up to date or updated, 2 = update available but not applied
// (offline, --dry-run, bad signature/SHA, 404), 1 = hard error (bad manifest ...).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MANIFEST_TIMEOUT_MS = 5000;
const PACKAGE_TIMEOUT_MS = 120000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;

const USAGE = `Novora updater

Usage:
  node updater.mjs --manifest <url|pfad> --app <dir> --pubkey <pfad|base64> [options]

Options:
  --manifest <url|path>  latest.json (HTTPS) oder lokaler Pfad
  --app <dir>            App-Verzeichnis (<org>/app), wird ersetzt
  --org <dir>            Organisationsordner (Default: Elternordner von --app)
  --pubkey <path|b64>    Ed25519 Public Key (PEM-Datei oder roher 32-Byte-Base64)
  --current <version>    lokale Version (Default: <app>/version.txt, <app>/package.json)
  --channel <stable|beta>  erwarteter Kanal (nur Protokoll)
  --dry-run              nur pruefen, nichts installieren
  --allow-http           HTTP erlauben (nur Tests; Standard ist HTTPS-Pflicht)
  --help                 diese Hilfe

Exit: 0 aktuell/aktualisiert, 2 Update verfuegbar aber nicht eingespielt, 1 harter Fehler.
`;

class NotApplied extends Error {}
class HardError extends Error {}
class SecurityError extends HardError {}

const sleepDir = (p) => path.resolve(p);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--allow-http') { out.allowHttp = true; continue; }
    if (!a.startsWith('--')) throw new HardError(`unerwartetes Argument: ${a}`);
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new HardError(`Wert fehlt fuer --${key}`);
    i++;
    if (key === 'manifest') out.manifest = value;
    else if (key === 'app') out.app = value;
    else if (key === 'org') out.org = value;
    else if (key === 'pubkey') out.pubkey = value;
    else if (key === 'current') out.current = value;
    else if (key === 'channel') out.channel = value;
    else throw new HardError(`unbekannte Option --${key}`);
  }
  return out;
}

function makeLogger(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return (level, message) => {
    const line = `${new Date().toISOString()} ${level} ${message}`;
    try { fs.appendFileSync(file, `${line}\n`); } catch { /* logging must never break an update */ }
    console.log(line);
  };
}

// Strip query/fragment so no download tokens end up in the log.
function safeUrl(target) {
  try {
    const u = new URL(target);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return path.basename(String(target));
  }
}

function loadPublicKey(value) {
  if (!value) throw new HardError('--pubkey fehlt');
  let text = value;
  try {
    if (fs.existsSync(value) && fs.statSync(value).isFile()) text = fs.readFileSync(value, 'utf8');
  } catch { /* not a path: treat as inline key */ }
  if (text.includes('BEGIN PUBLIC KEY')) {
    try { return crypto.createPublicKey(text); } catch (e) { throw new HardError(`Public Key unlesbar: ${e.message}`); }
  }
  const raw = Buffer.from(text.replace(/\s+/g, ''), 'base64');
  if (raw.length === 32) {
    const prefix = Buffer.from('302a300506032b6570032100', 'hex');
    try {
      return crypto.createPublicKey({ key: Buffer.concat([prefix, raw]), format: 'der', type: 'spki' });
    } catch (e) { throw new HardError(`Public Key ungueltig: ${e.message}`); }
  }
  if (raw.length === 44) {
    try { return crypto.createPublicKey({ key: raw, format: 'der', type: 'spki' }); } catch { /* fallthrough */ }
  }
  throw new HardError('--pubkey ist weder PEM, Datei noch 32-Byte-Base64');
}

function assertHttpAllowed(target, allowHttp) {
  if (!/^https?:\/\//i.test(target)) return;
  if (new URL(target).protocol === 'http:' && !allowHttp) {
    throw new NotApplied('HTTPS erforderlich (HTTP nur mit --allow-http)');
  }
}

async function readSmall(target, { timeout = MANIFEST_TIMEOUT_MS, maxBytes = MAX_MANIFEST_BYTES, allowHttp = false } = {}) {
  if (/^https?:\/\//i.test(target)) {
    assertHttpAllowed(target, allowHttp);
    let res;
    try {
      res = await fetch(target, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
    } catch (e) {
      throw new NotApplied(`nicht erreichbar: ${safeUrl(target)} (${e.name || 'Fehler'})`);
    }
    if (!res.ok) throw new NotApplied(`HTTP ${res.status} fuer ${safeUrl(target)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new NotApplied('Antwort zu gross');
    return buf;
  }
  let p = target;
  if (/^file:\/\//i.test(p)) p = fileURLToPath(p);
  p = path.resolve(p);
  if (!fs.existsSync(p)) throw new NotApplied(`Datei fehlt: ${p}`);
  const size = fs.statSync(p).size;
  if (size > maxBytes) throw new NotApplied('Datei zu gross');
  return fs.readFileSync(p);
}

function signatureUrl(manifestTarget) {
  if (/^https?:\/\//i.test(manifestTarget)) {
    const u = new URL(manifestTarget);
    u.pathname += '.sig';
    u.search = '';
    return u.toString();
  }
  return `${manifestTarget}.sig`;
}

function resolvePackageUrl(packageTarget, manifestTarget) {
  if (/^https?:\/\//i.test(packageTarget)) return packageTarget;
  if (/^https?:\/\//i.test(manifestTarget)) return new URL(packageTarget, manifestTarget).toString();
  let baseDir;
  if (/^file:\/\//i.test(manifestTarget)) baseDir = path.dirname(fileURLToPath(manifestTarget));
  else baseDir = path.dirname(path.resolve(manifestTarget));
  return path.resolve(baseDir, packageTarget);
}

async function downloadPackage(target, dest, { allowHttp, log }) {
  if (/^https?:\/\//i.test(target)) {
    assertHttpAllowed(target, allowHttp);
    let res;
    try {
      res = await fetch(target, { signal: AbortSignal.timeout(PACKAGE_TIMEOUT_MS), redirect: 'follow' });
    } catch (e) {
      throw new NotApplied(`Download nicht erreichbar: ${safeUrl(target)} (${e.name || 'Fehler'})`);
    }
    if (!res.ok) throw new NotApplied(`Download HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > MAX_PACKAGE_BYTES) throw new NotApplied('Paket zu gross');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PACKAGE_BYTES) throw new NotApplied('Paket zu gross');
    fs.writeFileSync(dest, buf);
    log('info', `download ${buf.length} bytes von ${safeUrl(target)}`);
    return buf;
  }
  let p = target;
  if (/^file:\/\//i.test(p)) p = fileURLToPath(p);
  p = path.resolve(p);
  if (!fs.existsSync(p)) throw new NotApplied(`Paket fehlt: ${p}`);
  const size = fs.statSync(p).size;
  if (size > MAX_PACKAGE_BYTES) throw new NotApplied('Paket zu gross');
  fs.copyFileSync(p, dest);
  log('info', `copy ${size} bytes aus ${p}`);
  return fs.readFileSync(dest);
}

function hasTar() {
  try {
    const r = spawnSync('tar', ['--version'], { encoding: 'utf8', timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Reject absolute paths and `..` segments before extraction (zip-slip guard).
function assertArchivePaths(file) {
  const r = spawnSync('tar', ['-tf', file], { encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return; // archive listing unavailable -> post-extract check decides
  for (const rawLine of r.stdout.split(/\r?\n/)) {
    const name = rawLine.trim();
    if (!name) continue;
    const normalized = name.replace(/\\/g, '/');
    if (path.isAbsolute(name) || /^[a-zA-Z]:[\\/]/.test(name)) {
      throw new SecurityError(`absoluter Pfad im Archiv: ${name}`);
    }
    if (normalized.split('/').includes('..')) {
      throw new SecurityError(`Pfad-Traversal im Archiv: ${name}`);
    }
  }
}

function powershellExpand(archive, dest) {
  const q = (s) => String(s).replace(/'/g, "''");
  const script = `Expand-Archive -LiteralPath '${q(archive)}' -DestinationPath '${q(dest)}' -Force`;
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    timeout: 180000
  });
}

function extractArchive(file, dest, log) {
  fs.mkdirSync(dest, { recursive: true });
  const lower = file.toLowerCase();
  const tarOk = hasTar();
  if (tarOk) assertArchivePaths(file);

  if (lower.endsWith('.zip')) {
    if (tarOk) {
      const r = spawnSync('tar', ['-xf', file, '-C', dest], { encoding: 'utf8', timeout: 180000 });
      if (r.status === 0) return;
      log('warn', `tar.exe konnte ZIP nicht entpacken (${(r.stderr || '').trim().slice(0, 160)}), Fallback Expand-Archive`);
    }
    const p = powershellExpand(file, dest);
    if (p.status !== 0) {
      throw new NotApplied(`ZIP entpacken fehlgeschlagen: ${(p.stderr || p.stdout || '').trim().slice(0, 300)}`);
    }
    return;
  }
  if (/\.(tar\.gz|tgz)$/.test(lower)) {
    if (!tarOk) throw new HardError('tar.exe fehlt (fuer tar.gz noetig)');
    const r = spawnSync('tar', ['-xzf', file, '-C', dest], { encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) throw new NotApplied(`tar.gz entpacken fehlgeschlagen: ${(r.stderr || '').trim().slice(0, 300)}`);
    return;
  }
  throw new NotApplied(`unbekanntes Paketformat: ${path.basename(file)}`);
}

function checkExtractedTree(root) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, path.resolve(full));
      if (!rel || rel === '.') continue;
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new SecurityError(`Datei ausserhalb des Zielordners: ${rel}`);
      }
      if (entry.isSymbolicLink()) throw new SecurityError(`Symlink im Paket: ${rel}`);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
}

function findServerDir(root, depth = 0) {
  if (!fs.existsSync(root)) return null;
  if (fs.existsSync(path.join(root, 'server.mjs'))) return root;
  if (depth >= 3) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const hit = findServerDir(path.join(root, entry.name), depth + 1);
    if (hit) return hit;
  }
  return null;
}

function readCurrentVersion(appDir, override) {
  if (override) return String(override);
  const versionFile = path.join(appDir, 'version.txt');
  if (fs.existsSync(versionFile)) {
    const v = fs.readFileSync(versionFile, 'utf8').trim();
    if (v) return v;
  }
  const pkgFile = path.join(appDir, 'package.json');
  if (fs.existsSync(pkgFile)) {
    try {
      const v = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
      if (v) return String(v);
    } catch { /* ignore */ }
  }
  return '0.0.0';
}

function compareVersions(a, b) {
  const parse = (v) => String(v).split('-')[0].split('.').map((n) => {
    const x = Number.parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function swapApp(appDir, orgDir, newAppSrc, log) {
  const appOld = path.join(orgDir, 'app.old');
  const staging = path.join(orgDir, '.update', 'newapp');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(newAppSrc, staging, { recursive: true });
  if (!fs.existsSync(path.join(staging, 'server.mjs'))) throw new NotApplied('Paket ohne app/server.mjs');

  const hadApp = fs.existsSync(appDir);
  if (hadApp) {
    fs.rmSync(appOld, { recursive: true, force: true });
    fs.renameSync(appDir, appOld);
  }
  try {
    try {
      fs.renameSync(staging, appDir);
    } catch (e) {
      // cross-volume or a stale handle: copy instead of failing the update
      if (e.code === 'EXDEV' || e.code === 'EPERM') {
        fs.cpSync(staging, appDir, { recursive: true });
        fs.rmSync(staging, { recursive: true, force: true });
      } else {
        throw e;
      }
    }
    if (!fs.existsSync(path.join(appDir, 'server.mjs'))) throw new Error('neue app ohne server.mjs');
  } catch (e) {
    fs.rmSync(appDir, { recursive: true, force: true });
    if (hadApp && fs.existsSync(appOld)) fs.renameSync(appOld, appDir);
    throw new HardError(`Austausch fehlgeschlagen, Rollback: ${e.message}`);
  }
  if (hadApp) {
    fs.rmSync(appOld, { recursive: true, force: true });
    log('info', 'app.old entfernt (Update erfolgreich)');
  }
}

async function run(opts, log) {
  if (!opts.manifest) throw new HardError('--manifest fehlt');
  if (!opts.app) throw new HardError('--app fehlt');
  if (!opts.pubkey) throw new HardError('--pubkey fehlt');

  const appDir = sleepDir(opts.app);
  const orgDir = sleepDir(opts.org || path.dirname(appDir));
  const workDir = path.join(orgDir, '.update');

  // Load + verify manifest.
  const manifestBytes = await readSmall(opts.manifest, { allowHttp: opts.allowHttp });
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (e) {
    throw new HardError(`Manifest ist kein JSON: ${e.message}`);
  }
  if (!manifest || typeof manifest !== 'object') throw new HardError('Manifest leer/ungueltig');

  const sigRaw = await readSmall(signatureUrl(opts.manifest), { allowHttp: opts.allowHttp });
  const sig = Buffer.from(sigRaw.toString('utf8').trim(), 'base64');
  if (sig.length !== 64) throw new NotApplied('Signatur ungueltig (keine 64-Byte-Ed25519-Signatur)');
  const publicKey = loadPublicKey(opts.pubkey);
  if (!crypto.verify(null, manifestBytes, publicKey, sig)) {
    throw new NotApplied('Manifest-Signatur falsch - Update abgelehnt');
  }
  log('info', `Signatur ok (${safeUrl(opts.manifest)})`);

  if (opts.channel && manifest.channel && manifest.channel !== opts.channel) {
    log('warn', `Kanal im Manifest ${manifest.channel}, erwartet ${opts.channel}`);
  }

  const remote = manifest.pc;
  if (!remote || typeof remote !== 'object' || !remote.version || !remote.url || !remote.sha256) {
    throw new HardError('Manifest ohne pc.version/pc.url/pc.sha256');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(remote.sha256))) throw new HardError('pc.sha256 ungueltig');

  const current = readCurrentVersion(appDir, opts.current);
  const cmp = compareVersions(remote.version, current);
  log('info', `Version lokal ${current}, Remote ${remote.version}`);
  if (cmp <= 0) {
    log('info', 'bereits aktuell');
    return 0;
  }
  if (opts.dryRun) {
    log('info', `Update ${remote.version} verfuegbar (--dry-run, nicht installiert)`);
    return 2;
  }

  const pkgUrl = resolvePackageUrl(String(remote.url), opts.manifest);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const urlPath = /^https?:\/\//i.test(pkgUrl) ? new URL(pkgUrl).pathname : pkgUrl;
  let ext = path.extname(urlPath).toLowerCase();
  if (path.basename(urlPath).toLowerCase().endsWith('.tar.gz')) ext = '.tar.gz';
  const archive = path.join(workDir, `package${ext || '.zip'}`);
  const buf = await downloadPackage(pkgUrl, archive, { allowHttp: opts.allowHttp, log });

  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  if (digest !== String(remote.sha256).toLowerCase()) {
    throw new NotApplied(`SHA-256 falsch (erwartet ${remote.sha256}, erhalten ${digest})`);
  }
  if (remote.size && buf.length !== Number(remote.size)) {
    log('warn', `Groesse weicht ab (${buf.length} != ${remote.size})`);
  }

  const extractDir = path.join(workDir, 'new');
  extractArchive(archive, extractDir, log);
  checkExtractedTree(extractDir);
  const serverDir = findServerDir(extractDir);
  if (!serverDir) throw new NotApplied('Paket enthaelt kein server.mjs (Struktur ungueltig)');

  swapApp(appDir, orgDir, serverDir, log);
  log('info', `Update auf ${remote.version} installiert`);
  return 0;
}

const opts = {};
try {
  Object.assign(opts, parseArgs(process.argv.slice(2)));
  if (opts.help) { process.stdout.write(USAGE); process.exit(0); }

  const appDir = path.resolve(opts.app || 'app');
  const orgDir = path.resolve(opts.org || path.dirname(appDir));
  const log = makeLogger(path.join(orgDir, 'debug', 'update.log'));
  const code = await run(opts, log);
  log('info', `exit ${code}`);
  process.exit(code);
} catch (err) {
  try {
    const appDir = path.resolve(opts.app || 'app');
    const orgDir = path.resolve(opts.org || path.dirname(appDir));
    const log = makeLogger(path.join(orgDir, 'debug', 'update.log'));
    const code = err instanceof NotApplied ? 2 : 1;
    log(code === 2 ? 'warn' : 'error', err.message);
    log('info', `exit ${code}`);
    process.exit(code);
  } catch {
    console.error(`updater: ${err && err.message ? err.message : err}`);
    process.exit(err instanceof NotApplied ? 2 : 1);
  }
}
