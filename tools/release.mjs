#!/usr/bin/env node
// Novora release: the single path from source to release\<version>\.
// Node 22, no npm dependencies. Windows/PowerShell oriented.
//
// Usage:
//   node tools/release.mjs                 # build current package.json version
//   node tools/release.mjs --version 0.4.0 # set this version everywhere, then build
//   node tools/release.mjs --publish       # additionally write website/updates/latest.json
//   node tools/release.mjs --skip-builds   # version + package only (no build calls)
//   node tools/release.mjs --no-clean      # keep old build outputs
//   node tools/release.mjs --help
//
// Steps: version -> builds -> release/<v>/ copy -> SHA256SUMS + version.json -> cleanup.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, ...p);
const PKG = P('package.json');
const PROTOCOL = P('prototype', 'lib', 'protocol.mjs');
const ISS = P('installer', 'Novora.iss');
const MANIFEST = P('android', 'AndroidManifest.xml');
const LATEST = P('website', 'updates', 'latest.json');

const HELP = `Novora release tool (tools/release.mjs)

  --version <x.y.z>   Version setzen (package.json, protocol.mjs, Novora.iss,
                      AndroidManifest) und bauen
  --publish           zusaetzlich website/updates/latest.json schreiben
  --skip-builds       nur Versionen setzen, keine Builds aufrufen
  --android-manifest  android/AndroidManifest.xml mitschreiben (standard: aus)
  --no-clean          alte Build-Ausgaben nicht aufraeumen
  -h, --help          diese Hilfe

Ablauf: Version -> Builds (desktop, installer, android) -> release/<version>/
        -> SHA256SUMS + version.json -> Aufraeumen (nur nach Erfolg).
Ohne --publish wird kein Website-Manifest angefasst.`;

function log(m) { console.log(m); }
function die(m) { console.error('FEHLER: ' + m); process.exit(1); }

// ---------- args ----------
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { log(HELP); process.exit(0); }
const opt = { version: null, publish: false, skipBuilds: false, noClean: false, androidManifest: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--publish') opt.publish = true;
  else if (a === '--skip-builds') opt.skipBuilds = true;
  else if (a === '--android-manifest') opt.androidManifest = true;
  else if (a === '--no-clean') opt.noClean = true;
  else if (a === '--version') { opt.version = argv[++i]; if (!opt.version) die('--version braucht einen Wert'); }
  else die(`unbekannte Option: ${a} (Hilfe: --help)`);
}

// ---------- version ----------
const semver = /^\d+\.\d+\.\d+$/;
function readPkg() { return JSON.parse(readFileSync(PKG, 'utf8')); }
const pkg = readPkg();
const version = opt.version || pkg.version;
if (!version || !semver.test(version)) die(`ungueltige Version: ${version}`);
const [maj, min, pat] = version.split('.').map(Number);
const versionCode = maj * 10000 + min * 100 + pat;
// Android has its own version line (currently 0.1.x). Never label the APK with
// the PC version; read the manifest so the file name and manifest agree.
let androidVersion = version;
let androidCode = versionCode;
if (existsSync(MANIFEST)) {
  const mf = readFileSync(MANIFEST, 'utf8');
  androidVersion = (mf.match(/android:versionName\s*=\s*"([^"]+)"/) || [])[1] || version;
  androidCode = Number((mf.match(/android:versionCode\s*=\s*"(\d+)"/) || [])[1]) || versionCode;
}
log(`Novora release ${version}; Android ${androidVersion} (code ${androidCode})`);

// ---------- helpers ----------
function writeIfChanged(file, next) {
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (old === next) { log(`  = ${file}`); return false; }
  writeFileSync(file, next, 'utf8');
  log(`  * ${file}`);
  return true;
}
function mustRead(file) { if (!existsSync(file)) die(`fehlt: ${file}`); return readFileSync(file, 'utf8'); }
function replaceOnce(text, re, repl, label) {
  if (!re.test(text)) die(`Muster nicht gefunden (${label})`);
  return text.replace(re, repl);
}
function sh(cmd, args, label) {
  log(`-> ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.error) die(`${label}: ${r.error.message}`);
  if (r.status !== 0) die(`${label} beendete mit Code ${r.status}`);
}
function ps1(script, args = []) {
  sh('powershell', ['-ExecutionPolicy', 'Bypass', '-File', P(script), ...args], script);
}
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function human(n) { return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

// ---------- 1. set version ----------
log('Version setzen:');
const pkgNext = JSON.stringify({ ...pkg, version }, null, 2) + '\n';
writeIfChanged(PKG, pkgNext);

let proto = mustRead(PROTOCOL);
writeIfChanged(PROTOCOL, replaceOnce(proto, /(export\s+const\s+VERSION\s*=\s*['"])[^'"]+(['"])/, `$1${version}$2`, 'protocol.mjs VERSION'));

let iss = mustRead(ISS);
writeIfChanged(ISS, replaceOnce(iss, /(#define\s+MyAppVersion\s+")[^"]+(")/, `$1${version}$2`, 'Novora.iss MyAppVersion'));

if (opt.androidManifest && existsSync(MANIFEST)) {
  let mf = mustRead(MANIFEST);
  mf = replaceOnce(mf, /(android:versionName\s*=\s*")[^"]+(")/, `$1${version}$2`, 'AndroidManifest versionName');
  mf = replaceOnce(mf, /(android:versionCode\s*=\s*")\d+(")/, `$1${versionCode}$2`, 'AndroidManifest versionCode');
  writeIfChanged(MANIFEST, mf);
} else {
  log(`  - ${MANIFEST} unveraendert (nur mit --android-manifest; gehoert dem Android-Agenten)`);
}

// ---------- 2. builds ----------
const outExe = P('desktop', 'out', 'Novora.exe');
const setupExe = P('installer', 'out', `NovoraSetup-${version}.exe`);
const debugApk = P('android', 'Novora-debug.apk');

if (!opt.skipBuilds) {
  log('Builds:');
  ps1(join('desktop', 'native', 'build.ps1'));
  ps1(join('android', 'build-apk.ps1'));
  // The installer payload carries app/web/downloads/novora.apk. Refresh it
  // BEFORE the installer runs, otherwise Setup/ZIP ship the previous APK.
  const apkForWeb = P('prototype', 'web', 'downloads', 'novora.apk');
  if (existsSync(debugApk)) {
    mkdirSync(P('prototype', 'web', 'downloads'), { recursive: true });
    copyFileSync(debugApk, apkForWeb);
    log(`  + ${apkForWeb.slice(ROOT.length + 1)} (aus aktueller APK)`);
  }
  ps1(join('installer', 'build.ps1'), ['-Version', version]);
} else {
  log('Builds uebersprungen (--skip-builds).');
}

// ---------- 3. collect into release/<version> ----------
const relDir = P('release', version);
const winDir = join(relDir, 'windows');
const apkDir = join(relDir, 'android');
mkdirSync(winDir, { recursive: true });
mkdirSync(apkDir, { recursive: true });

const produced = [];
const loaderDll = P('desktop', 'out', 'WebView2Loader.dll');
const zipOut = join(winDir, `novora-${version}-win64.zip`);

function copyIn(src, dest, label) {
  if (!existsSync(src)) {
    if (!opt.skipBuilds) die(`${label} nicht gebaut: ${src}`);
    log(`  - ${label} fehlt (--skip-builds), uebersprungen`);
    return;
  }
  copyFileSync(src, dest);
  log(`  + ${dest.slice(ROOT.length + 1)}`);
}

// Windows ZIP must be the complete portable package: launcher, loader,
// Node runtime and app/. The installer payload is exactly that tree.
const payloadDir = P('installer', 'payload');
if (existsSync(join(payloadDir, 'Novora.exe'))) {
  if (existsSync(zipOut)) rmSync(zipOut, { force: true });
  sh('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${join(payloadDir, '*')}' -DestinationPath '${zipOut}' -Force`],
    'Windows-ZIP packen (kompletter Payload)');
} else if (existsSync(outExe) && existsSync(loaderDll)) {
  // Fallback for --skip-builds without an installer payload.
  if (existsSync(zipOut)) rmSync(zipOut, { force: true });
  sh('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${outExe}','${loaderDll}' -DestinationPath '${zipOut}' -Force`],
    'Windows-ZIP packen (nur Launcher)');
} else if (!opt.skipBuilds) {
  die(`Novora.exe nicht gebaut: ${outExe}`);
}

copyIn(setupExe, join(winDir, basename(setupExe)), 'Setup');
copyIn(debugApk, join(apkDir, `novora-${androidVersion}.apk`), 'APK');

for (const f of [
  join(winDir, `NovoraSetup-${version}.exe`),
  join(winDir, `novora-${version}-win64.zip`),
  join(apkDir, `novora-${androidVersion}.apk`),
]) {
  if (existsSync(f)) produced.push(f);
}

// ---------- 4. SHA256SUMS + version.json ----------
const sums = [];
for (const f of produced) {
  const rel = f.slice(relDir.length + 1).replace(/\\/g, '/');
  sums.push(`${sha256(f)}  ${rel}`);
}
writeFileSync(join(relDir, 'SHA256SUMS'), sums.join('\n') + (sums.length ? '\n' : ''), 'utf8');
const winZip = produced.find((f) => f.endsWith('.zip'));
const apkFile = produced.find((f) => f.endsWith('.apk'));
const setupFile = produced.find((f) => f.endsWith('.exe'));
const meta = {
  product: 'Novora',
  version,
  versionCode,
  androidVersion,
  androidVersionCode: androidCode,
  built: new Date().toISOString(),
  files: produced.map((f) => ({
    path: f.slice(relDir.length + 1).replace(/\\/g, '/'),
    size: statSync(f).size,
    sha256: sha256(f),
  })),
};
writeFileSync(join(relDir, 'version.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
log(`Release-Ordner: ${relDir}`);
for (const f of produced) log(`  ${human(statSync(f).size).padStart(8)}  ${f.slice(relDir.length + 1)}`);

// ---------- 5. publish (opt-in only) ----------
if (opt.publish) {
  if (!existsSync(LATEST)) die(`Manifest fehlt: ${LATEST}`);
  const latest = JSON.parse(readFileSync(LATEST, 'utf8'));
  latest.generated = new Date().toISOString();
  latest.pc = {
    ...(latest.pc || {}),
    version,
    url: (latest.pc && latest.pc.url) || 'https://example.com/downloads/novora-windows-x64.zip',
    sha256: winZip ? sha256(winZip) : (latest.pc && latest.pc.sha256) || '',
    size: winZip ? statSync(winZip).size : (latest.pc && latest.pc.size) || 0,
    notes: (latest.pc && latest.pc.notes) || '',
  };
  latest.android = {
    ...(latest.android || {}),
    version: androidVersion,
    versionCode: androidCode,
    url: (latest.android && latest.android.url) || 'https://example.com/downloads/novora.apk',
    sha256: apkFile ? sha256(apkFile) : (latest.android && latest.android.sha256) || '',
    size: apkFile ? statSync(apkFile).size : (latest.android && latest.android.size) || 0,
    notes: (latest.android && latest.android.notes) || '',
  };
  writeFileSync(LATEST, JSON.stringify(latest, null, 2) + '\n', 'utf8');
  log(`Website-Manifest aktualisiert: ${LATEST}`);
} else {
  log('Website-Manifest unveraendert (--publish nicht gesetzt).');
}

// ---------- 6. cleanup (only after successful copy) ----------
if (opt.noClean) { log('Aufraeumen uebersprungen (--no-clean).'); }
else if (!opt.skipBuilds && produced.length > 0) {
  log('Alte Build-Ausgaben aufraeumen:');
  const rm = (f) => { try { rmSync(f, { force: true, recursive: true }); log(`  - ${f.slice(ROOT.length + 1)}`); } catch { } };
  const rmOldIn = (dir, keepRe, isDir = false) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      let isDirectory = false;
      try { isDirectory = statSync(full).isDirectory(); } catch { continue; }
      if (isDirectory !== isDir) continue;
      if (isDir ? false : keepRe.test(name)) continue;
      rm(full);
    }
  };
  // installer\out: nur der aktuelle Stand bleibt
  rmOldIn(P('installer', 'out'), new RegExp(`^NovoraSetup-${version.replace(/\./g, '\\.')}\\.exe$`));
  // dist\downloads: alte Installer (anderes Paket wie ZIP/APK bleiben)
  rmOldIn(P('dist', 'downloads'), new RegExp(`^NovoraSetup-${version.replace(/\./g, '\\.')}\\.exe$`));
  // android\build: Zwischenstaende
  if (existsSync(P('android', 'build'))) rm(P('android', 'build'));
  // Root-APK
  if (existsSync(P('Novora.apk'))) rm(P('Novora.apk'));
  // alte Windows-Distribution (nur weil neuer Build existiert)
  if (existsSync(outExe) && existsSync(P('dist', 'windows', 'Novora', 'Novora.exe'))) {
    rm(P('dist', 'windows', 'Novora', 'Novora.exe'));
  }
}

log(`FERTIG: ${relDir}`);
if (setupFile || winZip || apkFile) log('  Artefakte: Setup/ZIP/APK siehe oben.');
