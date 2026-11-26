#!/usr/bin/env node
// Novora publish: SHA-256 + size + Ed25519-signed manifest for the static update server.
// Node 22 only (crypto.generateKeyPairSync('ed25519')), no npm dependencies.
// Writes latest.json / beta.json and the matching .sig next to it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT = 'Novora';

const USAGE = `Novora update publisher

Usage:
  node tools/publish.mjs --help
  node tools/publish.mjs --gen-keys <dir> [--force]
  node tools/publish.mjs --version <v> --pc-zip <file> [options]

Key generation:
  --gen-keys <dir>    erzeugt <dir>/ed25519.pem (PKCS8) + <dir>/ed25519.pub.pem (SPKI)
  --force             vorhandene Keys ueberschreiben

Publish:
  --version <v>       neue PC-Version, z.B. 0.3.1 (muss > vorhandener Manifest-Version sein)
  --channel <name>    stable -> latest.json | beta -> beta.json            [stable]
  --pc-zip <file>     Windows-Paket (ZIP mit app\\server.mjs)
  --apk <file>        optional: Android-APK
  --android-version   optional: Android versionName (Default: bisherige Version)
  --android-code      optional: Android versionCode   (Default: bisheriger Wert, sonst 1)
  --min-pc <v>        optional: minSupported.pc        (Default: bisheriger Wert, sonst 0.0.0)
  --min-android <n>   optional: minSupported.android   (Default: bisheriger Wert, sonst 0)
  --out <dir>         Zielverzeichnis fuer Manifest + downloads/          [updates]
  --key <priv.pem>    Ed25519 PKCS8 Private Key                           [ed25519.pem]
  --base-url <url>    oeffentliche Basis-URL, Paket-URL = <base>/downloads/<datei>
  --notes <text>      Changelog fuer den Update-Dialog
  --no-copy           Pakete nicht nach <out>/downloads/ kopieren

Exit-Codes: 0 = ok, 1 = Fehler (u.a. Downgrade, fehlende Datei, kaputter Key).
`;

class PublishError extends Error {}

function die(msg) {
  throw new PublishError(msg);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--force') { out.force = true; continue; }
    if (a === '--no-copy') { out.noCopy = true; continue; }
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) die(`Wert fehlt fuer --${key}`);
    i++;
    if (key === 'gen-keys') out.genKeys = value;
    else if (key === 'version') out.version = value;
    else if (key === 'channel') out.channel = value;
    else if (key === 'pc-zip') out.pcZip = value;
    else if (key === 'apk') out.apk = value;
    else if (key === 'android-version') out.androidVersion = value;
    else if (key === 'android-code') out.androidCode = value;
    else if (key === 'min-pc') out.minPc = value;
    else if (key === 'min-android') out.minAndroid = value;
    else if (key === 'out') out.out = value;
    else if (key === 'key') out.key = value;
    else if (key === 'base-url') out.baseUrl = value;
    else if (key === 'notes') out.notes = value;
    else die(`Unbekannte Option --${key}`);
  }
  return out;
}

// Numeric semver compare, tolerant of 1.2 vs 1.2.0 and -suffix.
export function compareVersions(a, b) {
  const parse = (v) => String(v).split('-')[0].split('.').map((n) => {
    const x = Number.parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  const x = parse(a);
  const y = parse(b);
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function rawPublicKeyBase64(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI: 302a300506032b6570032100 || 32-byte key
  const raw = der.subarray(der.length - 32);
  if (raw.length !== 32) die('unerwartetes Public-Key-Format');
  return raw.toString('base64');
}

function genKeys(dir, force) {
  fs.mkdirSync(dir, { recursive: true });
  const privPath = path.join(dir, 'ed25519.pem');
  const pubPath = path.join(dir, 'ed25519.pub.pem');
  for (const p of [privPath, pubPath]) {
    if (fs.existsSync(p) && !force) die(`${p} existiert bereits (mit --force ueberschreiben)`);
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  try { fs.chmodSync(privPath, 0o600); } catch { /* Windows: best effort */ }
  const b64 = rawPublicKeyBase64(publicKey);
  console.log(`private: ${privPath}`);
  console.log(`public:  ${pubPath}`);
  console.log(`pubkey (raw, base64): ${b64}`);
  return { privPath, pubPath, b64 };
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function signFile(manifestPath, bytes, privateKey) {
  const sig = crypto.sign(null, bytes, privateKey).toString('base64');
  // self-check before touching the website copy
  if (!crypto.verify(null, bytes, crypto.createPublicKey(privateKey), Buffer.from(sig, 'base64'))) {
    die('Selbstpruefung der Signatur fehlgeschlagen');
  }
  const tmp = `${manifestPath}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, manifestPath);
  const sigPath = `${manifestPath}.sig`;
  const tmpSig = `${sigPath}.tmp`;
  fs.writeFileSync(tmpSig, Buffer.from(`${sig}\n`, 'utf8'));
  fs.renameSync(tmpSig, sigPath);
  return sigPath;
}

function publish(opts) {
  const channel = (opts.channel || 'stable').toLowerCase();
  if (channel !== 'stable' && channel !== 'beta') die(`ungueltiger --channel: ${channel}`);
  if (!opts.version) die('--version fehlt');
  if (!/^\d+\.\d+\.\d+/.test(opts.version)) die(`ungueltige Version: ${opts.version}`);
  const pcZip = path.resolve(opts.pcZip || '');
  if (!opts.pcZip || !fs.existsSync(pcZip) || !fs.statSync(pcZip).isFile()) {
    die('--pc-zip fehlt oder ist keine Datei');
  }
  if (opts.apk && (!fs.existsSync(opts.apk) || !fs.statSync(opts.apk).isFile())) {
    die(`--apk nicht gefunden: ${opts.apk}`);
  }

  const outDir = path.resolve(opts.out || 'updates');
  fs.mkdirSync(outDir, { recursive: true });
  const manifestName = channel === 'beta' ? 'beta.json' : 'latest.json';
  const manifestPath = path.join(outDir, manifestName);

  let previous = null;
  if (fs.existsSync(manifestPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      die(`${manifestPath} ist kein gueltiges JSON (nicht ueberschrieben)`);
    }
    const oldVersion = previous && previous.pc && previous.pc.version;
    if (oldVersion && compareVersions(opts.version, oldVersion) <= 0) {
      die(`Downgrade verweigert: ${opts.version} <= vorhandene ${oldVersion}`);
    }
  }

  const keyPath = path.resolve(opts.key || 'ed25519.pem');
  if (!fs.existsSync(keyPath)) die(`Key nicht gefunden: ${keyPath} (erst --gen-keys)`);
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));

  const downloadsDir = path.join(outDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const copyIn = (src) => {
    const dest = path.join(downloadsDir, path.basename(src));
    const copied = !opts.noCopy && path.resolve(src) !== path.resolve(dest);
    if (copied) fs.copyFileSync(src, dest);
    // Return what actually exists on disk: nothing is written with --no-copy,
    // so hash/stat the source instead of a missing destination.
    return copied ? dest : src;
  };

  const pcFile = copyIn(pcZip);
  const baseUrl = opts.baseUrl ? String(opts.baseUrl).replace(/\/+$/, '') : '';
  const pcUrl = baseUrl ? `${baseUrl}/downloads/${path.basename(pcZip)}` : path.basename(pcZip);

  const manifest = {
    product: PRODUCT,
    channel,
    generated: new Date().toISOString(),
    minSupported: {
      pc: opts.minPc || (previous && previous.minSupported && previous.minSupported.pc) || '0.0.0',
      android: opts.minAndroid !== undefined
        ? Number(opts.minAndroid)
        : (previous && previous.minSupported && previous.minSupported.android) ?? 0
    },
    pc: {
      version: opts.version,
      url: pcUrl,
      sha256: sha256(pcFile),
      size: fs.statSync(pcFile).size,
      notes: opts.notes || ''
    }
  };

  let android = null;
  if (opts.apk) {
    const apkFile = copyIn(path.resolve(opts.apk));
    const prevAndroid = previous && previous.android;
    android = {
      version: opts.androidVersion || (prevAndroid && prevAndroid.version) || opts.version,
      versionCode: opts.androidCode !== undefined
        ? Number(opts.androidCode)
        : (prevAndroid && prevAndroid.versionCode) || 1,
      url: baseUrl ? `${baseUrl}/downloads/${path.basename(apkFile)}` : path.basename(apkFile),
      sha256: sha256(apkFile),
      size: fs.statSync(apkFile).size,
      notes: opts.notes || ''
    };
  } else if (previous && previous.android) {
    android = previous.android; // keep the last published APK untouched
  }
  if (android) manifest.android = android;

  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const sigPath = signFile(manifestPath, bytes, privateKey);

  console.log(JSON.stringify({
    ok: true,
    manifest: manifestPath,
    signature: sigPath,
    channel,
    version: manifest.pc.version,
    sha256: manifest.pc.sha256,
    size: manifest.pc.size,
    downloads: downloadsDir
  }, null, 2));
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(USAGE); process.exit(0); }
  if (opts.genKeys) { genKeys(path.resolve(opts.genKeys), !!opts.force); process.exit(0); }
  publish(opts);
  process.exit(0);
} catch (err) {
  console.error(`publish: ${err instanceof PublishError ? err.message : err.stack || err}`);
  process.exit(1);
}
