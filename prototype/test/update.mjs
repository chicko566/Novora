// Standalone update-pipeline test (no framework, no npm deps).
// Covers: publish.mjs (keys + signed manifest), updater.mjs (up-to-date, update,
// wrong signature, wrong SHA, 404, zip-slip) and the rollback guarantees.
// Run from anywhere:  node prototype\test\update.mjs
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTOTYPE = path.dirname(HERE);
const REPO = path.dirname(PROTOTYPE);
const UPDATER = path.join(PROTOTYPE, 'updater.mjs');
const PUBLISH = path.join(REPO, 'tools', 'publish.mjs');
const NODE = process.execPath;
const PORT = 47841;
const NEW_VERSION = '0.3.2';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'novora-update-'));
const ORG = path.join(TMP, 'org');
const APP = path.join(ORG, 'app');
const SERVE = path.join(TMP, 'serve');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function spawnNode(args, cwd = REPO) {
  const r = spawnSync(NODE, args, { cwd, encoding: 'utf8', timeout: 240000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}

// The test server lives in this process: spawnSync would block its event loop,
// so updater runs must be asynchronous.
function spawnNodeAsync(args, cwd = REPO) {
  return new Promise((resolve) => {
    const child = spawn(NODE, args, { cwd });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', (error) => resolve({ code: -1, out: String(error), error }));
  });
}

function spawnTool(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 180000, ...opts });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}

function haveTar() {
  return spawnTool('tar', ['--version']).code === 0;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function buildZip(dest, members) {
  // Windows bsdtar can write ZIP ("-a" picks the format from the extension).
  if (haveTar()) {
    const r = spawnTool('tar', ['-a', '-cf', dest, ...members], { cwd: PKG });
    if (r.code === 0 && fs.existsSync(dest)) return true;
  }
  const list = members.map((m) => `'${path.join(PKG, m).replace(/'/g, "''")}'`).join(',');
  const script = `Compress-Archive -Path ${list} -DestinationPath '${dest.replace(/'/g, "''")}' -Force`;
  const r = spawnTool('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  return r.code === 0 && fs.existsSync(dest);
}

function makeEvilZip(dest) {
  const q = (s) => String(s).replace(/'/g, "''");
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$z=[System.IO.Compression.ZipFile]::Open('${q(dest)}','Create')`,
    "$e=$z.CreateEntry('../evil.txt')",
    '$s=$e.Open()',
    '$w=New-Object System.IO.StreamWriter($s)',
    "$w.Write('pwn')",
    '$w.Dispose()',
    '$s.Dispose()',
    "$e2=$z.CreateEntry('app/server.mjs')",
    '$s2=$e2.Open()',
    '$w2=New-Object System.IO.StreamWriter($s2)',
    "$w2.Write('// EVIL')",
    '$w2.Dispose()',
    '$s2.Dispose()',
    '$z.Dispose()'
  ].join('; ');
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  const r = spawnTool('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc]);
  return r.code === 0 && fs.existsSync(dest);
}

function runUpdater(args) {
  return spawnNodeAsync([UPDATER, ...args]);
}

// Last meaningful log line, so a failing case explains itself.
function why(r) {
  const lines = String(r.out || '').trim().split(/\r?\n/).filter(Boolean);
  const line = lines.reverse().find((l) => !/\sexit\s[012]$/.test(l)) || '';
  return line.replace(/^\S+\s+(info|warn|error)\s+/, '').slice(0, 160);
}

function resetApp(version) {
  fs.rmSync(APP, { recursive: true, force: true });
  fs.rmSync(path.join(ORG, 'app.old'), { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  fs.writeFileSync(path.join(APP, 'server.mjs'), '// OLD BUILD\n');
  fs.writeFileSync(path.join(APP, 'version.txt'), `${version}\n`);
}

const appHasOld = () => fs.readFileSync(path.join(APP, 'server.mjs'), 'utf8').includes('OLD BUILD');
const appVersion = () => fs.readFileSync(path.join(APP, 'version.txt'), 'utf8').trim();

function signManifest(file, obj) {
  const bytes = Buffer.from(`${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.writeFileSync(file, bytes);
  const key = crypto.createPrivateKey(fs.readFileSync(PRIV_PATH));
  fs.writeFileSync(`${file}.sig`, `${crypto.sign(null, bytes, key).toString('base64')}\n`);
}

function resignCurrent() {
  const bytes = fs.readFileSync(path.join(SERVE, 'latest.json'));
  const key = crypto.createPrivateKey(fs.readFileSync(PRIV_PATH));
  fs.writeFileSync(path.join(SERVE, 'latest.json.sig'), `${crypto.sign(null, bytes, key).toString('base64')}\n`);
}

const PKG = path.join(TMP, 'pkg');
const KEY_DIR = path.join(TMP, 'keys');
const PRIV_PATH = path.join(KEY_DIR, 'ed25519.pem');
const PUB_PATH = path.join(KEY_DIR, 'ed25519.pub.pem');
const ZIP = path.join(TMP, 'novora-windows-x64.zip');
const PUBLISH_DIR = path.join(TMP, 'publish');
let manifestUrl = '';
let server = null;

async function main() {
  // 1. Package + keys + signed manifest through the real publish CLI.
  fs.mkdirSync(path.join(PKG, 'app'), { recursive: true });
  fs.mkdirSync(path.join(PKG, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(PKG, 'app', 'server.mjs'), '// NEW BUILD 0.3.2\n');
  fs.writeFileSync(path.join(PKG, 'app', 'version.txt'), `${NEW_VERSION}\n`);
  fs.writeFileSync(path.join(PKG, 'Novora.exe'), 'MZ dummy launcher');
  fs.writeFileSync(path.join(PKG, 'runtime', 'node.exe'), 'dummy runtime');
  record('package zip built', buildZip(ZIP, ['app', 'runtime', 'Novora.exe']));

  const keys = spawnNode([PUBLISH, '--gen-keys', KEY_DIR]);
  record('publish --gen-keys', keys.code === 0 && fs.existsSync(PRIV_PATH) && fs.existsSync(PUB_PATH),
    keys.code === 0 ? '' : keys.out.trim().split('\n').slice(-1)[0]);
  if (!fs.existsSync(PRIV_PATH)) throw new Error('keys missing, cannot continue');

  const pub = spawnNode([PUBLISH, '--version', NEW_VERSION, '--channel', 'stable', '--pc-zip', ZIP,
    '--out', PUBLISH_DIR, '--key', PRIV_PATH, '--base-url', `http://127.0.0.1:${PORT}`, '--notes', 'test build']);
  const hasManifest = fs.existsSync(path.join(PUBLISH_DIR, 'latest.json'));
  const hasSig = fs.existsSync(path.join(PUBLISH_DIR, 'latest.json.sig'));
  record('publish manifest + signature', pub.code === 0 && hasManifest && hasSig,
    pub.code === 0 ? '' : pub.out.trim().split('\n').slice(-1)[0]);

  const downgrade = spawnNode([PUBLISH, '--version', '0.0.1', '--pc-zip', ZIP, '--out', PUBLISH_DIR, '--key', PRIV_PATH]);
  const afterDowngrade = JSON.parse(fs.readFileSync(path.join(PUBLISH_DIR, 'latest.json'), 'utf8')).pc.version;
  record('publish refuses downgrade', downgrade.code === 1 && afterDowngrade === NEW_VERSION);

  fs.cpSync(PUBLISH_DIR, SERVE, { recursive: true });
  const base = JSON.parse(fs.readFileSync(path.join(SERVE, 'latest.json'), 'utf8'));
  manifestUrl = `http://127.0.0.1:${PORT}/latest.json`;

  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(SERVE, `.${urlPath}`);
    if (!file.startsWith(path.resolve(SERVE))) { res.writeHead(403); res.end('forbidden'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const args = ['--manifest', manifestUrl, '--app', APP, '--org', ORG, '--pubkey', PUB_PATH, '--allow-http'];

  // (a) already current -> 0, nothing changed
  resetApp(NEW_VERSION);
  let r = await runUpdater(args);
  record('(a) current version -> exit 0, untouched', r.code === 0 && appHasOld() && appVersion() === NEW_VERSION,
    `exit ${r.code}: ${why(r)}`);

  // (b) update available -> 0, app replaced, app.old removed
  resetApp('0.3.0');
  r = await runUpdater(args);
  const updated = !appHasOld() && appVersion() === NEW_VERSION
    && fs.existsSync(path.join(APP, 'server.mjs'))
    && !fs.existsSync(path.join(ORG, 'app.old'));
  const logged = fs.existsSync(path.join(ORG, 'debug', 'update.log'));
  record('(b) update applied, app.old cleaned, log written', r.code === 0 && updated && logged, `exit ${r.code}`);

  // (c) wrong signature -> 2, untouched
  resetApp('0.3.0');
  fs.writeFileSync(path.join(SERVE, 'latest.json.sig'), `${crypto.randomBytes(64).toString('base64')}\n`);
  r = await runUpdater(args);
  record('(c) bad signature -> exit 2, untouched', r.code === 2 && appHasOld(), `exit ${r.code}`);
  resignCurrent();

  // (d) correct signature, wrong SHA -> 2, untouched
  resetApp('0.3.0');
  const badSha = JSON.parse(JSON.stringify(base));
  badSha.pc.sha256 = '0'.repeat(64);
  signManifest(path.join(SERVE, 'latest.json'), badSha);
  r = await runUpdater(args);
  record('(d) bad sha256 -> exit 2, untouched', r.code === 2 && appHasOld(), `exit ${r.code}`);
  resignCurrent();

  // (e) manifest 404 -> 2, untouched
  resetApp('0.3.0');
  r = await runUpdater(['--manifest', `http://127.0.0.1:${PORT}/missing.json`, '--app', APP, '--org', ORG,
    '--pubkey', PUB_PATH, '--allow-http']);
  record('(e) manifest 404 -> exit 2, untouched', r.code === 2 && appHasOld(), `exit ${r.code}`);

  // (f) zip-slip archive -> 1/2, untouched, nothing escapes
  resetApp('0.3.0');
  const evilZip = path.join(TMP, 'evil.zip');
  const evilBuilt = makeEvilZip(evilZip);
  if (evilBuilt) {
    const slip = JSON.parse(JSON.stringify(base));
    slip.pc.version = '0.3.3';
    slip.pc.url = `http://127.0.0.1:${PORT}/downloads/evil.zip`;
    slip.pc.sha256 = sha256(evilZip);
    slip.pc.size = fs.statSync(evilZip).size;
    fs.copyFileSync(evilZip, path.join(SERVE, 'downloads', 'evil.zip'));
    signManifest(path.join(SERVE, 'latest.json'), slip);
    r = await runUpdater(args);
    const escaped = fs.existsSync(path.join(TMP, 'evil.txt')) || fs.existsSync(path.join(ORG, 'evil.txt'))
      || fs.existsSync(path.join(ORG, '.update', 'evil.txt'));
    record('(f) zip-slip -> exit 1/2, untouched, no escape',
      (r.code === 1 || r.code === 2) && appHasOld() && !escaped, `exit ${r.code}`);
  } else {
    record('(f) zip-slip -> exit 1/2, untouched, no escape', false, 'could not build evil zip');
  }
}

let fatal = null;
try {
  await main();
} catch (err) {
  fatal = err;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}

const passed = results.filter((x) => x.ok).length;
const total = results.length;
if (fatal) console.log(`fatal: ${fatal.message}`);
console.log(`update tests: ${passed}/${total} ok`);
const ok = !fatal && passed === total && total > 0;
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(ok ? 0 : 1);
