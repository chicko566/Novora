// Action execution. Only whitelisted types reach the PowerShell worker;
// every command is sent base64-encoded as JSON and gets a timeout.
// No client free text ever reaches PowerShell: targets, launch args and
// hotkeys are all validated against fixed patterns / whitelists here.
// `path` accepts ABSOLUTE Windows paths only (drive or UNC); the value is
// validated and never interpolated -- no shell parsing, no client arguments.
// `app` launches EXE/UWP/protocol/.lnk/file targets; Windows paths must exist.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const TYPES = new Set(['hotkey', 'open', 'path', 'app', 'media', 'volume', 'mic', 'record', 'page', 'command', 'system']);

const MEDIA = { playpause: 0xb3, next: 0xb0, prev: 0xb1, stop: 0xb2 };
const VOL = { up: 0xaf, down: 0xae, mute: 0xad };

// Power/PC presets. Fixed whitelist only: the client sends a preset name and
// nothing else -- no client text is ever passed through to PowerShell.
const SYSTEM = {
  shutdown: "Start-Process -FilePath 'shutdown.exe' -ArgumentList '/s','/t','5'",
  restart: "Start-Process -FilePath 'shutdown.exe' -ArgumentList '/r','/t','5'",
  logoff: "Start-Process -FilePath 'shutdown.exe' -ArgumentList '/l'",
  sleep: "Start-Process -FilePath 'rundll32.exe' -ArgumentList 'powrprof.dll,SetSuspendState','0','1','0'",
  hibernate: "Start-Process -FilePath 'rundll32.exe' -ArgumentList 'powrprof.dll,SetSuspendState','1','1','0'",
  lock: "Start-Process -FilePath 'rundll32.exe' -ArgumentList 'user32.dll,LockWorkStation'",
  screenoff: "(Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);' -Name U -PassThru)::SendMessage(0xffff,0x0112,0xF170,2)"
};

const MODS = { ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10, win: 0x5b, cmd: 0x11 };
const NAMED = {
  enter: 13, return: 13, tab: 9, esc: 27, escape: 27, space: 32,
  backspace: 8, delete: 46, del: 46, insert: 45, ins: 45,
  home: 36, end: 35, pageup: 33, pagedown: 34,
  up: 38, down: 40, left: 37, right: 39,
  printscreen: 44, capslock: 20,
  minus: 189, equal: 187, comma: 188, period: 190, slash: 191,
  semicolon: 186, quote: 222, bracketleft: 219, bracketright: 221,
  backslash: 220, grave: 192
};
for (let i = 1; i <= 24; i++) NAMED[`f${i}`] = 111 + i; // F1 = 112

// Only harmless characters; quotes/shell metacharacters never get through.
const TARGET_RE = /^[A-Za-z0-9 _.:\\/%@+~?=&#-]{1,500}$/;
// Optional launch args for `open`: same safe character class, shorter, and
// always handed over as ONE argument (no shell interpolation happens: the
// value travels inside a single-quoted PowerShell literal).
const ARGS_RE = /^[A-Za-z0-9 _.:\\/%@+~?=&#-]{1,200}$/;
const THEN_DELAY_DEFAULT = 800;
const THEN_DELAY_MAX = 5000;

// Absolute Windows path for `path`: drive root (C:\ / C:/) or UNC (\\host\).
// Never relative, so no CWD-relative surprises; `..` after the root is harmless.
const ABS_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\[A-Za-z0-9._-]+\\)/;
// Forbidden inside a path: quotes, line breaks/NUL and shell metacharacters.
// Spaces and umlauts stay allowed. Backtick and $ would let PowerShell expand.
const PATH_BAD_RE = /["\u0000\r\n]|[&|;<>$`]/;

const fail = (message) => { throw new Error(message); };

// `app` launch kinds. Paths (exe/lnk/file) must exist on disk; UWP targets are
// AUMIDs ("Package_8wekyb3d8bbwe!App", optionally already prefixed with
// shell:AppsFolder\); protocols are URI schemes such as mailto: or spotify:.
const APP_KINDS = new Set(['exe', 'uwp', 'protocol', 'lnk', 'file']);
const APP_MAX = 1000;
const APP_BAD_RE = /[\u0000\r\n]/;
const PROTOCOL_RE = /^[A-Za-z][A-Za-z0-9+.-]{0,63}:[^\u0000\r\n]{0,940}$/;
// AppsFolder entries are AUMIDs ("Package_8wekyb3d8bbwe!App"); real ones also
// contain spaces and GUID braces. Only the shell can resolve them, so there is
// no fs check for uwp.
const UWP_RE = /^shell:AppsFolder\\[A-Za-z0-9][A-Za-z0-9 ._!{}()\-\\@#%+~=,]{0,399}$/i;

// PowerShell single-quoted literal: the only escape needed is a doubled quote.
function psLit(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

// Bare program name ("excel", "notepad.exe"): resolved by the shell (PATH /
// App Paths), so it cannot be checked with fs here.
function isBareName(target) {
  return !ABS_PATH_RE.test(target) && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/.test(target);
}

// Scheme of a URI-style target (mailto:, spotify:, https://); '' for anything
// else, including drive paths like C:\x.
function protocolScheme(target) {
  if (/^[A-Za-z]:[\\/]/.test(target)) return '';
  const m = /^([A-Za-z][A-Za-z0-9+.-]{0,63}):/.exec(target);
  return m ? m[1].toLowerCase() : '';
}

function normAppPath(value) {
  if (typeof value !== 'string') fail('invalid app target');
  const target = value.trim();
  if (!target || target.length > 400) fail('invalid app target');
  if (APP_BAD_RE.test(target) || PATH_BAD_RE.test(target)) fail('invalid app target');
  if (isBareName(target)) return target;
  if (!ABS_PATH_RE.test(target)) fail('app target must be an absolute path');
  if (!existsSync(target)) fail('App/Datei nicht gefunden');
  return target;
}

function keyVk(name) {
  if (/^[A-Za-z]$/.test(name)) return name.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(name)) return name.charCodeAt(0);
  return NAMED[name.toLowerCase()] || 0;
}

function hotkeyScript(keys) {
  if (typeof keys !== 'string' || keys.length > 64) fail('invalid hotkey');
  const parts = keys.split('+').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 4) fail('invalid hotkey');

  const mods = [];
  for (const part of parts.slice(0, -1)) {
    const vk = MODS[part.toLowerCase()];
    if (!vk) fail('invalid hotkey');
    mods.push(vk);
  }
  const main = keyVk(parts[parts.length - 1]);
  if (!main) fail('invalid hotkey');

  let script = mods.map((vk) => `[K]::Down(${vk});`).join('');
  script += `[K]::Tap(${main});`;
  script += [...mods].reverse().map((vk) => `[K]::Up(${vk});`).join('');
  return script;
}

function openScript(target, args) {
  if (typeof target !== 'string' || !TARGET_RE.test(target)) fail('invalid target');
  // Legacy `open` entries (old data.json): URIs get the same registry preflight
  // as `app`, and bare program names may no longer "succeed" silently.
  if (args === undefined) {
    if (protocolScheme(target)) return protocolScript(target);
    if (isBareName(target)) {
      return `try { Start-Process -FilePath '${target}' -ErrorAction Stop } catch { throw 'Programm nicht installiert' }`;
    }
    return `Start-Process -FilePath '${target}'`;
  }
  if (typeof args !== 'string' || !ARGS_RE.test(args)) fail('invalid args');
  // One argument only: the launcher path stays in -FilePath.
  return `Start-Process -FilePath '${target}' -ArgumentList '${args}'`;
}

// Folder -> Explorer, file -> default app. Single -FilePath literal, no
// -ArgumentList, so the path can never turn into extra command arguments.
function normPath(value) {
  if (typeof value !== 'string') fail('invalid path');
  if (value.length < 3 || value.length > 400) fail('invalid path');
  if (PATH_BAD_RE.test(value)) fail('invalid path');
  if (!ABS_PATH_RE.test(value)) fail('invalid path');
  return value;
}

function pathScript(path) {
  // A literal apostrophe is legal in Windows paths; double it so it cannot
  // terminate the PowerShell single-quoted string.
  return `Start-Process -FilePath '${path.replace(/'/g, "''")}'`;
}

// Launch scripts. Every value is a single-quoted literal, so only a quote can
// end the string (and that one is doubled). Start-Process always runs with
// -ErrorAction Stop: the worker sets $ErrorActionPreference =
// 'SilentlyContinue', so without it every failure would report {"ok":true}.
const LAUNCH_CHECK_MS = 400;

// Protocol URIs: without a registered handler Start-Process pops the "How do
// you want to open this file?" dialog and BLOCKS the worker until it is closed.
// So the registry is checked first and nothing at all is started when the
// scheme is unknown. One attempt only -- no explorer fallback spiral.
function protocolScript(target) {
  const scheme = protocolScheme(target);
  if (!scheme) fail('invalid app target');
  const keys = [
    psLit(`Registry::HKEY_CURRENT_USER\\Software\\Classes\\${scheme}`),
    psLit(`Registry::HKEY_LOCAL_MACHINE\\Software\\Classes\\${scheme}`)
  ].join(', ');
  return [
    '$ok = $false',
    `foreach ($k in ${keys}) {`,
    "  if ((Test-Path $k) -and ((Test-Path (Join-Path $k 'shell\\open\\command')) -or (Get-ItemProperty $k -Name 'URL Protocol' -ErrorAction SilentlyContinue))) { $ok = $true }",
    '}',
    "if (-not $ok) { throw 'Protokoll nicht registriert' }",
    `Start-Process -FilePath ${psLit(target)} -ErrorAction Stop`
  ].join('\n');
}

// Best effort only: a process that dies with a non-zero exit code right after
// launch is an error; everything else (Store apps, launchers, slow starters)
// counts as started.
const POST_START_CHECK = 'Start-Sleep -Milliseconds ' + LAUNCH_CHECK_MS + '; '
  + 'if ($p) { $e = -1; try { if ($p.HasExited) { $e = $p.ExitCode } } catch { $e = -1 }; '
  + "if ($e -ne -1 -and $e -ne 0) { throw 'App sofort beendet' } }";

function appScript(action) {
  const target = psLit(action.target);
  if (action.kind === 'uwp') {
    // UWP apps are only reachable through the AppsFolder shell namespace and
    // may take seconds to show a window: no launch check here.
    return `Start-Process -FilePath 'explorer.exe' -ArgumentList ${target} -ErrorAction Stop`;
  }
  if (action.kind === 'protocol') return protocolScript(action.target);
  if (isBareName(action.target)) {
    // excel/winword without an App Paths entry must not report ok.
    return `$p = $null; try { $p = Start-Process -FilePath ${target} -PassThru -ErrorAction Stop } catch { throw 'Programm nicht installiert' }; ${POST_START_CHECK}`;
  }
  return `$p = Start-Process -FilePath ${target} -PassThru -ErrorAction Stop; ${POST_START_CHECK}`;
}

// Shell command via cmd.exe. No line breaks, at most 500 chars; single quotes
// are doubled so the command can never break out of the PowerShell string.
function commandScript(cmd, mode) {
  if (typeof cmd !== 'string') fail('invalid command');
  if (!cmd || cmd.length > 500 || /[\r\n\0]/.test(cmd)) fail('invalid command');
  const quoted = cmd.replace(/'/g, "''");
  const flag = mode === 'silent' ? '/c' : '/k';
  const hidden = mode === 'silent' ? ' -WindowStyle Hidden' : '';
  return `Start-Process -FilePath 'cmd.exe' -ArgumentList '${flag}','${quoted}'${hidden}`;
}

function normalize(action) {
  if (!action || typeof action !== 'object') fail('invalid action');
  const type = action.type;
  if (!TYPES.has(type)) fail('unsupported action');

  switch (type) {
    case 'hotkey':
      if (typeof action.keys !== 'string') fail('invalid hotkey');
      return { type, keys: action.keys };
    case 'open': {
      if (typeof action.target !== 'string') fail('invalid target');
      const rawTarget = action.target.trim();
      if (/^shell:AppsFolder\\/i.test(rawTarget)) {
        if (!UWP_RE.test(rawTarget)) fail('invalid app target');
        return { type: 'app', kind: 'uwp', target: rawTarget };
      }
      if (!TARGET_RE.test(action.target)) fail('invalid target');
      const out = { type, target: action.target };
      if (action.args !== undefined) {
        if (typeof action.args !== 'string' || !ARGS_RE.test(action.args)) fail('invalid args');
        out.args = action.args;
      }
      if (action.then !== undefined) {
        const then = action.then;
        if (!then || typeof then !== 'object') fail('invalid then');
        hotkeyScript(then.keys); // throws 'invalid hotkey' on bad combos
        let delayMs = THEN_DELAY_DEFAULT;
        if (then.delayMs !== undefined) {
          if (typeof then.delayMs !== 'number' || !Number.isFinite(then.delayMs)) fail('invalid delayMs');
          delayMs = Math.max(0, Math.min(THEN_DELAY_MAX, Math.round(then.delayMs)));
        }
        out.then = { keys: then.keys, delayMs };
      }
      return out;
    }
    case 'path':
      return { type, path: normPath(action.path) };
    case 'app': {
      const kind = action.kind;
      if (typeof kind !== 'string' || !APP_KINDS.has(kind)) fail('invalid app kind');
      const raw = action.target;
      if (typeof raw !== 'string') fail('invalid app target');
      const target = raw.trim();
      if (!target || target.length > APP_MAX) fail('invalid app target');
      if (APP_BAD_RE.test(target)) fail('invalid app target');
      if (kind === 'protocol') {
        if (/^[A-Za-z]:[\\/]/.test(target) || !PROTOCOL_RE.test(target)) fail('invalid app target');
        return { type, kind, target };
      }
      if (kind === 'uwp') {
        const aumid = /^shell:AppsFolder\\/i.test(target) ? target : `shell:AppsFolder\\${target}`;
        if (!UWP_RE.test(aumid)) fail('invalid app target');
        return { type, kind, target: aumid };
      }
      return { type, kind, target: normAppPath(target) };
    }
    case 'media':
      return { type, key: MEDIA[action.key] ? action.key : 'playpause' };
    case 'volume':
      return { type, dir: VOL[action.dir] ? action.dir : 'up' };
    case 'page':
      if (typeof action.page !== 'string' || !/^[\w-]{1,64}$/.test(action.page)) fail('invalid page');
      return { type, page: action.page };
    case 'command': {
      if (typeof action.cmd !== 'string') fail('invalid command');
      const cmd = action.cmd.trim();
      if (!cmd || cmd.length > 500 || /[\r\n\0]/.test(cmd)) fail('invalid command');
      return { type, cmd, mode: action.mode === 'silent' ? 'silent' : 'window' };
    }
    case 'system': {
      const preset = action.preset;
      if (typeof preset !== 'string' || !Object.hasOwn(SYSTEM, preset)) fail('invalid system preset');
      return { type, preset };
    }
    case 'mic': {
      const scope = action.scope === 'app' || action.scope === 'output' || action.scope === 'deaf' ? action.scope : 'system';
      const app = typeof action.app === 'string' ? action.app.trim().slice(0, 80) : '';
      const keys = typeof action.keys === 'string' ? action.keys.trim().slice(0, 64) : '';
      if (keys) hotkeyScript(keys); // validiert optionalen Hotkey
      return { type, scope, app, keys };
    }
    default:
      return { type };
  }
}

export function createActions({ db, push, workerPath, audio = null, discord = null, timeoutMs = 4000 }) {
  let worker = null;
  let ready = false;
  let seq = 0;
  let buffer = '';
  const pending = new Map(); // id -> { resolve, timer }
  const queue = [];          // commands waiting for worker readiness

  function settle(id, ok, error) {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    item.resolve(ok ? { ok: true } : { ok: false, error: error || 'action failed' });
  }

  function write({ id, script }) {
    try {
      const line = JSON.stringify({ id, b64: Buffer.from(script, 'utf8').toString('base64') });
      worker.stdin.write(`${line}\n`);
    } catch {
      settle(id, false, 'worker write failed');
    }
  }

  function spawnWorker() {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', workerPath],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    );
    worker = ps;
    ready = false;
    buffer = '';

    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.ready) {
          ready = true;
          for (const item of queue.splice(0)) write(item);
        } else if (msg.id != null) {
          settle(msg.id, msg.ok !== false, msg.err);
        }
      }
    });

    const drop = () => {
      worker = null;
      ready = false;
      for (const id of [...pending.keys()]) settle(id, false, 'worker unavailable');
      queue.length = 0;
    };
    ps.on('exit', drop);
    ps.on('error', drop);
  }

  // Send one script to the worker and wait for its ack.
  function run(script) {
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => settle(id, false, 'timeout'), timeoutMs);
      pending.set(id, { resolve, timer });

      const item = { id, script };
      if (!worker) {
        queue.push(item);
        spawnWorker();
      } else if (ready) {
        write(item);
      } else {
        queue.push(item);
      }
    });
  }

  function applyVolume(dir) {
    if (dir === 'up' || dir === 'down') {
      const step = dir === 'up' ? 2 : -2;
      db.state.volume = Math.max(0, Math.min(100, (db.state.volume ?? 50) + step));
      push('state', { volume: db.state.volume });
    }
  }

  async function execute(rawAction) {
    const t0 = performance.now();
    try {
      const action = normalize(rawAction);
      switch (action.type) {
        case 'hotkey':
          await run(hotkeyScript(action.keys));
          break;
        case 'open': {
          const opened = await run(openScript(action.target, action.args));
          if (!opened.ok) throw new Error(opened.error || 'open failed');
          if (action.then) {
            // The follow-up hotkey runs in a SECOND run() call, never inside the
            // opening call's promise. Every run() carries its own 4000 ms worker
            // timeout, so a long delay cannot eat the launcher's budget; total
            // wall time is bounded by open + delayMs (max 5000) + one hotkey.
            if (action.then.delayMs > 0) {
              await new Promise((r) => setTimeout(r, action.then.delayMs));
            }
            await run(hotkeyScript(action.then.keys));
          }
          break;
        }
        case 'path':
          await run(pathScript(action.path));
          break;
        case 'app': {
          // Availability is checked before anything starts (inside the script
          // for protocols/bare names, via existsSync for paths), so a failure
          // here is real and carries the German reason from the worker.
          const res = await run(appScript(action));
          if (!res.ok) throw new Error(res.error || 'App/Datei nicht gefunden');
          break;
        }
        case 'media':
          await run(`[K]::Tap(${MEDIA[action.key]})`);
          break;
        case 'volume': {
          if (audio) {
            const res = action.dir === 'mute'
              ? await audio.toggleMasterMute()
              : await audio.stepMaster(action.dir === 'down' ? -5 : 5);
            if (res && res.ok) {
              db.state.volume = Math.max(0, Math.min(100, Number(res.volume) || 0));
              push('state', { volume: db.state.volume });
              break;
            }
          }
          await run(`[K]::Tap(${VOL[action.dir]})`);
          applyVolume(action.dir);
          break;
        }
        case 'mic': {
          const isDiscord = /discord/i.test(action.app || '');
          if (action.scope === 'deaf' && discord && discord.isReady()) {
            const res = await discord.toggleDeaf();
            db.state.mic = !res.mute;
            db.state.deaf = !!res.deaf;
            push('state', { mic: db.state.mic, deaf: db.state.deaf, micApp: 'Discord' });
            break;
          }
          if (action.scope === 'output' && action.app) {
            if (audio && typeof audio.toggleAppMute === 'function') {
              const res = await audio.toggleAppMute(action.app);
              if (!res || !res.ok) throw new Error(res?.error || `App "${action.app}" nicht aktiv`);
              push('state', { appMute: { app: action.app, muted: !!res.muted } });
              break;
            }
          }
          if (action.scope === 'app' && isDiscord && discord && discord.isReady()) {
            const res = await discord.toggleMute();
            db.state.mic = !res.mute;
            db.state.deaf = !!res.deaf;
            push('state', { mic: db.state.mic, deaf: db.state.deaf, micApp: 'Discord' });
            break;
          }
          if (action.scope === 'app' && action.app) {
            if (action.keys) {
              await run(hotkeyScript(action.keys));
              db.state.mic = !db.state.mic;
              push('state', { mic: db.state.mic, micApp: action.app });
              break;
            }
            // Fallback ohne Discord-RPC/Hotkey: echtes Windows-Mikrofon-Geraet muten.
            if (audio && typeof audio.toggleMicMute === 'function') {
              const res = await audio.toggleMicMute();
              if (res && res.ok) {
                db.state.mic = !res.muted;
                push('state', { mic: db.state.mic, micApp: action.app });
                break;
              }
            }
          }
          if (audio && typeof audio.toggleMicMute === 'function') {
            const res = await audio.toggleMicMute();
            if (res && res.ok) {
              db.state.mic = !res.muted;
              push('state', { mic: db.state.mic, micApp: '' });
              break;
            }
          }
          db.state.mic = !db.state.mic;
          push('state', { mic: db.state.mic, micApp: '' });
          break;
        }
        case 'record':
          // Windows Game Bar: Win+Alt+R starts/stops a real screen recording.
          await run(hotkeyScript('Win+Alt+R'));
          db.state.recording = !db.state.recording;
          push('state', { recording: db.state.recording });
          break;
        case 'page':
          push('page', { id: action.page });
          break;
        case 'command':
          await run(commandScript(action.cmd, action.mode));
          break;
        case 'system':
          await run(SYSTEM[action.preset]);
          break;
      }
      return { ok: true, ms: +(performance.now() - t0).toFixed(2) };
    } catch (err) {
      return { ok: false, error: err.message || 'action failed', ms: +(performance.now() - t0).toFixed(2) };
    }
  }

  // Pre-start PowerShell so the first hotkey is not delayed by ~2 s startup.
  function warm() {
    if (!worker) spawnWorker();
  }

  function stop() {
    try { worker?.stdin.end(); } catch {}
    try { worker?.kill(); } catch {}
    worker = null;
  }

  return { execute, warm, stop };
}
