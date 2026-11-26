// Installed applications for Novora (Novora / StreamDeck).
//
// Turns the raw EXE/start-menu/AppsFolder list from appicons.listInstalled()
// into clean, deduplicated app entries that the PC UI can show as tiles.
//
//   const apps = await listApps();          // { ok, apps: [{ id, name, path, kind, source, brand }] }
//   const apps2 = await listApps({ refresh: 1 });
//   findApp('notepad');                     // one entry or null
//   getApp('app-notepad-1a2b3c4d5e');       // one entry or null
//   defaultTarget(app);                     // { type:'app', kind, target }
//
// ES module. No server, no UI, no network. Only node:crypto for stable ids.
//
// Filter policy (from the installation audit):
//   - no uninstallers, updaters, helpers, setup stubs, redistributables,
//     crash reporters, services, readme/licence shims;
//   - no Windows system paths, no Microsoft/Windows Appx system apps and
//     portals (Calculator, Settings, Store, Terminal, Snipping Tool, ...);
//   - no bundled CLI shims (winget, spotify_cli, WindowsPackageManager);
//   - known brands are labels only and never invent an entry: if the app is
//     not installed, it is not in the list.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { listInstalled } from './appicons.mjs';

const CACHE_TTL_MS = 5 * 60 * 1000;

// Brand slug -> matchers against lowercase name and normalised path.
// Labels only, no phantom entries.
const BRANDS = [
  { brand: 'spotify', test: (n, p) => /spotify/.test(n) || /\\spotifymusic|\\spotify\\/.test(p) },
  { brand: 'discord', test: (n, p) => /discord/.test(n) || /\\discord\\/.test(p) },
  { brand: 'microsoftteams', test: (n, p) => /microsoft teams|^teams$/.test(n) || /\\msteams\\|\\teams\\/.test(p) },
  { brand: 'microsoftexcel', test: (n, p) => /^excel$|microsoft excel/.test(n) || /\\excel\.exe$/.test(p) },
  {
    brand: 'googlechrome',
    test: (n, p) => /google chrome/.test(n) || /\\google\\chrome\\application\\chrome\.exe$/.test(p),
  },
  {
    brand: 'steam',
    test: (n, p) => /^steam$|^steam (client|launcher)$/.test(n) || /\\steam\\steam\.exe$/.test(p),
  },
  { brand: 'obsstudio', test: (n, p) => /obs studio/.test(n) || /\\obs-studio\\|\\obs64\.exe$/.test(p) },
  {
    brand: 'visualstudiocode',
    test: (n, p) => /visual studio code|vscode/.test(n) || /\\microsoft vs code\\code\.exe$/.test(p),
  },
  { brand: 'netflix', test: (n, p) => /netflix/.test(n) || /\\netflix/.test(p) },
  { brand: 'zoom', test: (n, p) => /^zoom( |$)|zoom workplace/.test(n) || /\\zoom\\.*zoom\.exe$/.test(p) },
  { brand: 'slack', test: (n, p) => /^slack( |$)/.test(n) || /\\slack\\/.test(p) },
  { brand: 'github', test: (n, p) => /github desktop|^github$/.test(n) || /\\github desktop\\/.test(p) },
  { brand: 'epicgames', test: (n, p) => /epic games/.test(n) || /epicgameslauncher\.exe$/.test(p) },
  { brand: 'nodedotjs', test: (n, p) => /^node\.js$|^nodejs$/.test(n) || /\\nodejs\\node\.exe$/.test(p) },
  { brand: 'primevideo', test: (n, p) => /prime video|primevideo/.test(n) || /prime ?video/.test(p) },
];

// Audit exclusion regex, applied to name AND path.
const AUDIT_EXCLUDE = /unins|uninstall|msiexec|setup|^install|updater?|helper|bugreporter|_cli$|packaging|winget|windowspackagemanager|compil32|spotify_cli/i;

// Browsers are a separate category in Novora; the Software tab must not mix
// them with tools, games and media apps.
const BROWSER_RE = /google chrome|chrome\.exe|microsoft edge|msedge|firefox|brave|opera|vivaldi/i;

function categoryFor(name, p, kind) {
  if (BROWSER_RE.test(`${name} ${p}`)) return 'browser';
  if (kind === 'uwp') return 'store';
  return 'software';
}

// Bundled/CLI shims that are not user-facing tiles.
const EXTRA_EXCLUDE_NAME = [/^wab/i, /^wabmig/i];

// Windows system paths and system Appx families (Microsoft.* / Windows.*).
const SYSTEM_DRIVE_PATH = /^[a-z]:\\windows\\/i;
const APPX_SYSTEM_PATH = /\\windowsapps\\(microsoft|windows)/i;
// Appx package family of a system/portal app (shell: or WindowsApps path).
const APPX_SYSTEM_FAMILY = /^(microsoft|windows)/i;

// System tools, settings and portals that must not appear as app tiles.
const SYSTEM_APP_NAMES = [
  'rechner',
  'calculator',
  'regedit',
  'regedit.exe',
  'registrierungseditor',
  'registrierungs-editor',
  'msconfig',
  'systemkonfiguration',
  'msinfo32',
  'systeminformationen',
  'odbc',
  'odbcdatenquellen',
  'charmap',
  'zeichentabelle',
  'kamera',
  'camera',
  'medienwiedergabe',
  'mediaplayer',
  'bildschirmlupe',
  'magnify',
  'snippingtool',
  'snipping',
  'snippingtool.exe',
  'terminal',
  'windowsterminal',
  'wt',
  'store',
  'microsoftstore',
];
const SYSTEM_APP_PATHS = [
  '\\regedit.exe',
  '\\msconfig.exe',
  '\\msinfo32.exe',
  '\\odbcad32.exe',
  '\\charmap.exe',
  '\\magnify.exe',
  '\\osk.exe',
  '\\dfrgui.exe',
  '\\cleanmgr.exe',
  '\\recoverydrive.exe',
  '\\wt.exe',
  '\\windowsterminal.exe',
  '\\microsoft.windowsstore',
  '\\microsoft.zunemusic',
  '\\microsoft.windowscamera',
  '\\windows media player\\',
  '\\internet explorer\\',
  '\\ink\\tabtip.exe',
];

// Pirated-game launcher: never a Novora tile.
const STEAM_UNLOCKED = /steamunlocked|steamunlocked-launcher/i;

const SOURCE_RANK = { appsfolder: 3, startmenu: 2, apppaths: 1 };

function clean(value) {
  return String(value == null ? '' : value).trim().replace(/^"+|"+$/g, '');
}

function normName(name) {
  return clean(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s._\-–—]+/g, '');
}

function normPath(p) {
  return clean(p).replace(/\//g, '\\').toLowerCase();
}

function kindOf(p) {
  const lower = clean(p).toLowerCase();
  if (lower.startsWith('shell:appsfolder\\')) return 'uwp';
  if (lower.endsWith('.lnk')) return 'lnk';
  if (lower.endsWith('.exe')) return 'exe';
  return 'path';
}

function isUsablePath(p) {
  const value = clean(p);
  if (!value) return false;
  if (/^shell:appsfolder\\[^\\]+!/i.test(value)) return true;
  if (!/\.(exe|com|bat|cmd|lnk)$/i.test(value)) return false;
  // The user wants only software that really exists on disk. Shortcut files
  // are kept only when the .lnk itself is present; the launcher resolves it.
  if (/^[a-z]:\\/i.test(value)) return fs.existsSync(value);
  return false;
}

// UWP family without version: shell path before "!", WindowsApps package name
// before the first "_" (Name_Version_Arch_ _Publisher).
function packageFamily(p) {
  const raw = clean(p);
  const shell = raw.match(/^shell:AppsFolder\\([^!\\]+)!/i);
  if (shell) return { family: shell[1], appId: raw.slice(raw.indexOf('!') + 1) };
  const winApps = raw.match(/\\windowsapps\\([^\\]+)\\/i);
  if (winApps) {
    const family = winApps[1].split('_')[0];
    if (family) return { family, appId: '' };
  }
  return null;
}

// Normalised EXE stem, used as the dedupe key ("SnippingTool.exe" == "Snipping Tool").
function exeKey(entry) {
  const base = normPath(entry.path).split('\\').pop() || '';
  if (base.endsWith('.exe')) return base.slice(0, -4);
  return normName(entry.name);
}

function brandFor(name, p) {
  const n = clean(name).toLowerCase();
  const path = normPath(p);
  for (const entry of BRANDS) {
    try {
      if (entry.test(n, path)) return entry.brand;
    } catch {
      /* never let one matcher break the list */
    }
  }
  return null;
}

function slug(input) {
  const base = clean(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'app';
}

function makeId(name, p) {
  const hash = crypto.createHash('sha256').update(normPath(p)).digest('hex').slice(0, 10);
  return `app-${slug(name).slice(0, 40)}-${hash}`;
}

function scoreOf(entry) {
  return SOURCE_RANK[entry.source] == null ? 0 : SOURCE_RANK[entry.source];
}

function toEntry(raw) {
  const name = clean(raw.name);
  const p = clean(raw.path);
  return {
    id: makeId(name, p),
    name,
    path: p,
    kind: kindOf(p),
    source: clean(raw.source) || 'other',
  };
}

// Returns a reason string when the entry must be dropped, else null.
function exclusionReason(entry) {
  const name = clean(entry.name);
  const p = clean(entry.path);
  const lower = name.toLowerCase();
  const path = normPath(p);
  const brand = brandFor(name, p);

  if (STEAM_UNLOCKED.test(name) || STEAM_UNLOCKED.test(path)) return 'pirated_launcher';
  if (AUDIT_EXCLUDE.test(name) || AUDIT_EXCLUDE.test(p)) return 'audit_pattern';
  if (EXTRA_EXCLUDE_NAME.some((re) => re.test(name))) return 'helper_shim';

  const isSystemName = SYSTEM_APP_NAMES.includes(normName(name)) || SYSTEM_APP_NAMES.includes(lower);
  const isSystemPath = SYSTEM_APP_PATHS.some((needle) => path.includes(needle));
  if ((isSystemName || isSystemPath) && !brand) return 'system_app';

  // Windows system directory: not a deck app.
  if (SYSTEM_DRIVE_PATH.test(p) && !brand) return 'windows_path';

  // Microsoft/Windows Appx system apps and portals, unless a known brand or browser.
  // Covers both real WindowsApps paths and shell:AppsFolder\<family>!<app>.
  const family = packageFamily(p);
  const familyName = family ? family.family.toLowerCase() : '';
  const isBrowser = BROWSER_RE.test(`${name} ${p}`);
  const isUserGame = /minecraft/i.test(name);
  if ((APPX_SYSTEM_PATH.test(path) || APPX_SYSTEM_FAMILY.test(familyName)) && !brand && !isBrowser && !isUserGame) return 'appx_system';

  return null;
}

// Merge one AppsFolder entry with real-EXE entries of the same UWP package
// family, keeping shell:AppsFolder\... as launch target while storing the
// concrete .exe in iconPath for crisp icon extraction.
function mergeFamilies(entries) {
  const byFamily = new Map();
  for (const entry of entries) {
    const fam = packageFamily(entry.path);
    if (!fam) continue;
    const key = fam.family.toLowerCase();
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(entry);
  }

  const dropped = new Set();
  for (const group of byFamily.values()) {
    const shellEntries = group.filter((e) => e.kind === 'uwp');
    if (shellEntries.length !== 1) continue;
    const shell = shellEntries[0];
    const real = group.filter((e) => e !== shell && e.kind !== 'uwp' && e.path);
    if (!real.length) continue;
    real.sort((a, b) => scoreOf(b) - scoreOf(a) || a.path.length - b.path.length);
    shell.iconPath = real[0].path;
    for (const e of real) dropped.add(e);
  }
  return entries.filter((e) => !dropped.has(e));
}

// One entry per normalised EXE name / app name, one per target path.
function dedupe(entries) {
  const better = (entry, prev) =>
    !prev ||
    scoreOf(entry) > scoreOf(prev) ||
    (scoreOf(entry) === scoreOf(prev) && entry.path.length < prev.path.length);

  const byExe = new Map();
  for (const entry of entries) {
    const key = exeKey(entry) || normName(entry.name);
    if (better(entry, byExe.get(key))) byExe.set(key, entry);
  }
  let list = [...byExe.values()];

  const byName = new Map();
  for (const entry of list) {
    const key = normName(entry.name);
    if (better(entry, byName.get(key))) byName.set(key, entry);
  }
  list = [...byName.values()];

  const byPath = new Map();
  for (const entry of list) {
    const key = normPath(entry.path);
    if (better(entry, byPath.get(key))) byPath.set(key, entry);
  }
  return [...byPath.values()];
}

function finalize(entries) {
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
  const seen = new Set();
  return entries
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((entry) => {
      let id = entry.id;
      let n = 1;
      while (seen.has(id)) id = `${entry.id}-${n++}`;
      seen.add(id);
      return {
        id,
        name: entry.name,
        path: entry.path,
        iconPath: entry.iconPath || entry.path,
        kind: entry.kind,
        source: entry.source,
        brand: brandFor(entry.name, entry.path),
        category: categoryFor(entry.name, entry.path, entry.kind),
      };
    });
}

let cache = null; // { at: number, apps: [...] }

function copyApps(apps) {
  return apps.map((app) => ({ ...app }));
}

export async function listApps(options = {}) {
  const refresh = Boolean(options && (options.refresh === true || Number(options.refresh) > 0));
  const category = options && typeof options.category === 'string' ? options.category : '';
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const apps = category ? cache.apps.filter((app) => app.category === category) : cache.apps;
    return { ok: true, apps: copyApps(apps) };
  }

  let result;
  try {
    result = await listInstalled();
  } catch (err) {
    return { ok: false, error: 'list_failed', message: String((err && err.message) || err).slice(0, 500) };
  }
  if (!result || !result.ok) {
    return {
      ok: false,
      error: (result && result.error) || 'list_failed',
      message: String((result && result.message) || 'listInstalled fehlgeschlagen').slice(0, 500),
    };
  }

  const raw = (Array.isArray(result.apps) ? result.apps : [])
    .filter((a) => a && typeof a.name === 'string' && typeof a.path === 'string')
    .map(toEntry)
    .filter((e) => e.name && isUsablePath(e.path));

  const kept = raw.filter((e) => exclusionReason(e) === null);
  const all = finalize(dedupe(mergeFamilies(kept)));
  cache = { at: Date.now(), apps: all };
  const apps = category ? all.filter((app) => app.category === category) : all;
  return { ok: true, apps: copyApps(apps) };
}

export async function getApp(id) {
  if (typeof id !== 'string' || !id.trim()) return null;
  const { ok, apps } = await listApps();
  if (!ok) return null;
  return apps.find((app) => app.id === id) || null;
}

export async function findApp(query) {
  const q = clean(query).toLowerCase();
  if (!q) return null;
  const { ok, apps } = await listApps();
  if (!ok) return null;

  const scored = [];
  for (const app of apps) {
    const name = app.name.toLowerCase();
    const p = app.path.toLowerCase();
    if (name === q) scored.push([0, app]);
    else if (name.startsWith(q)) scored.push([1, app]);
    else if (name.includes(q)) scored.push([2, app]);
    else if (p.includes(q)) scored.push([3, app]);
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  return scored[0][1];
}

export function defaultTarget(app) {
  if (!app || typeof app !== 'object') return null;
  const target = clean(app.path);
  if (!target) return null;
  const kind = app.kind || kindOf(target);
  return { type: 'app', kind, target };
}

export const BRAND_SLUGS = BRANDS.map((b) => b.brand);

export default { listApps, getApp, findApp, defaultTarget, BRAND_SLUGS };
