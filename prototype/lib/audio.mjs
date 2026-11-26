// Windows audio mixer bridge (Novora / Novora prototype).
//
// Starts prototype/audio/volume.ps1 once and keeps it alive; every command is a
// single JSON line on the worker's stdin with one JSON line back on stdout.
// A command that does not answer within `timeoutMs` (default 3 s) recycles the
// worker, and the next call spawns a fresh one. No handles survive stop().
//
// ES module. No external packages, no system volume changes on import.
//
//   const audio = createAudio();
//   await audio.list();                      // { ok, sessions: [...] }
//   await audio.setVolume({ process: 'chrome' }, 40);
//   await audio.setMuted(1234, true);
//   await audio.setMaster(50);
//   audio.stop();

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCRIPT = fileURLToPath(new URL('../audio/volume.ps1', import.meta.url));
const DEFAULT_TIMEOUT = 3000;
const NAME_MAX = 260;

function fail(message) {
  return { ok: false, error: message };
}

// Accepts 1234 | '1234' | 'chrome' | { pid, process }.
function resolveTarget(target) {
  let pid = 0;
  let process = '';

  if (typeof target === 'number' || typeof target === 'bigint') {
    pid = Number(target);
  } else if (typeof target === 'string') {
    const text = target.trim();
    if (/^\d{1,10}$/.test(text)) pid = Number(text);
    else process = text;
  } else if (target && typeof target === 'object') {
    if (target.pid != null && target.pid !== '') pid = Number(target.pid);
    if (typeof target.process === 'string') process = target.process.trim();
  } else {
    throw new Error('invalid target');
  }

  if (!Number.isInteger(pid) || pid < 0) throw new Error('invalid pid');
  if (process.length > NAME_MAX) throw new Error('invalid process name');
  if (pid === 0 && !process) throw new Error('pid or process required');
  return { pid, process };
}

function checkVolume(volume) {
  const value = Number(volume);
  if (!Number.isFinite(value)) throw new Error('volume is not a number');
  if (value < 0 || value > 100) throw new Error('volume out of range 0-100');
  return Math.round(value * 10) / 10;
}

function cleanRow(row) {
  const pid = Number(row?.pid) || 0;
  const volume = Number(row?.volume);
  return {
    pid,
    process: typeof row?.process === 'string' ? row.process : '',
    name: typeof row?.name === 'string' ? row.name : '',
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 0,
    muted: row?.muted === true,
  };
}

export function createAudio(options = {}) {
  const scriptPath = options.scriptPath || DEFAULT_SCRIPT;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT;

  let child = null;
  let ready = false;
  let buffer = '';
  let seq = 0;
  const pending = new Map(); // id -> { resolve, timer, cmd }
  const queue = [];          // ids waiting for the worker's ready handshake
  let exitHook = null;
  let startTimer = null;
  let stopped = false;

  function clearStartTimer() {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
  }

  function settle(id, result) {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    if (item.timer) clearTimeout(item.timer);
    item.resolve(result);
  }

  function settleAll(result) {
    for (const id of [...pending.keys()]) settle(id, result);
    queue.length = 0;
  }

  // The timeout budget starts when the worker is ready, so the ~2-3 s PowerShell
  // start (Add-Type compile) does not eat into the per-command budget.
  function armTimer(id) {
    const item = pending.get(id);
    if (!item || item.timer) return;
    item.timer = setTimeout(() => {
      settle(id, fail('timeout'));
      killWorker('audio worker recycled after timeout');
    }, timeoutMs);
  }

  function write(id) {
    const item = pending.get(id);
    if (!item) return;
    if (!child) {
      settle(id, fail('worker unavailable'));
      return;
    }
    try {
      child.stdin.write(`${JSON.stringify({ id, ...item.cmd })}\n`);
      armTimer(id);
    } catch {
      settle(id, fail('worker write failed'));
    }
  }

  function killWorker(reason) {
    const ps = child;
    child = null;
    ready = false;
    buffer = '';
    queue.length = 0;
    clearStartTimer();
    if (ps) {
      try { ps.kill(); } catch { /* already gone */ }
      if (reason) settleAll(fail(reason));
    }
  }

  function onData(chunk) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (msg.ready === true) {
        ready = true;
        clearStartTimer();
        for (const id of queue.splice(0)) write(id);
        continue;
      }
      if (msg.id == null) continue;

      const { id, ...rest } = msg;
      settle(id, rest.ok === false ? { ok: false, error: rest.error || 'audio command failed' } : { ok: true, ...rest });
    }
  }

  function spawnWorker() {
    if (stopped) return;
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    );
    child = ps;
    ready = false;
    buffer = '';

    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', onData);

    // A dead worker makes stdin/stdout emit 'error' asynchronously (EPIPE);
    // without a listener that would crash the whole process.
    const onPipeError = () => {
      if (child !== ps) return;
      child = null;
      ready = false;
      buffer = '';
      queue.length = 0;
      clearStartTimer();
      settleAll(fail('audio worker unavailable'));
      try { ps.kill(); } catch { /* already gone */ }
    };
    ps.stdin.on('error', onPipeError);
    ps.stdout.on('error', onPipeError);

    // A worker that never reports ready (broken script, COM hang) is recycled
    // instead of leaving callers waiting forever.
    clearStartTimer();
    startTimer = setTimeout(() => {
      startTimer = null;
      killWorker('audio worker did not start');
    }, timeoutMs + 7000);

    const drop = () => {
      if (child !== ps) return;
      child = null;
      ready = false;
      buffer = '';
      queue.length = 0;
      clearStartTimer();
      settleAll(fail('audio worker exited'));
    };
    ps.on('exit', drop);
    ps.on('error', drop);

    if (!exitHook) {
      exitHook = () => {
        try { ps.kill(); } catch { /* nothing to kill */ }
      };
      process.once('exit', exitHook);
    }
  }

  function send(cmd) {
    return new Promise((resolve) => {
      if (stopped) {
        resolve(fail('audio stopped'));
        return;
      }
      const id = ++seq;

      // timer is armed in write(), once the worker is actually ready
      pending.set(id, { resolve, timer: null, cmd });

      if (!child) {
        queue.push(id);
        spawnWorker();
      } else if (ready) {
        write(id);
      } else {
        queue.push(id);
      }
    });
  }

  // One transparent retry: if the worker died while the request was in flight,
  // a fresh one is spawned and the command is sent again.
  async function sendWithRetry(cmd, retries = 1) {
    for (;;) {
      const result = await send(cmd);
      if (result.ok || result.error !== 'audio worker unavailable' || retries <= 0) return result;
      retries--;
    }
  }

  async function list() {
    const result = await sendWithRetry({ cmd: 'list' });
    if (!result.ok) return { ok: false, error: result.error || 'list failed', sessions: [] };
    const sessions = Array.isArray(result.sessions) ? result.sessions.map(cleanRow) : [];
    return { ok: true, sessions };
  }

  async function setVolume(target, volume) {
    let cmd;
    try {
      const { pid, process } = resolveTarget(target);
      cmd = { cmd: 'set', pid, process, volume: checkVolume(volume) };
    } catch (err) {
      return fail(err.message || 'invalid volume request');
    }
    const result = await sendWithRetry(cmd);
    return result.ok ? { ok: true, changed: Number(result.changed) || 0 } : fail(result.error);
  }

  async function setMuted(target, muted) {
    let cmd;
    try {
      const { pid, process } = resolveTarget(target);
      cmd = { cmd: 'mute', pid, process, muted: muted === true };
    } catch (err) {
      return fail(err.message || 'invalid mute request');
    }
    const result = await sendWithRetry(cmd);
    return result.ok
      ? { ok: true, changed: Number(result.changed) || 0, muted: muted === true }
      : fail(result.error);
  }

  async function setMaster(volume) {
    let cmd;
    try {
      cmd = { cmd: 'master', volume: checkVolume(volume) };
    } catch (err) {
      return fail(err.message || 'invalid volume request');
    }
    const result = await sendWithRetry(cmd);
    return result.ok ? { ok: true, volume: Number(result.volume) || 0 } : fail(result.error);
  }

  async function stepMaster(delta) {
    const d = Math.max(-50, Math.min(50, Math.round(Number(delta) || 0)));
    const result = await sendWithRetry({ cmd: 'masterstep', delta: d });
    return result.ok ? { ok: true, volume: Number(result.volume) || 0 } : fail(result.error);
  }

  async function toggleMasterMute() {
    const result = await sendWithRetry({ cmd: 'mastermute' });
    return result.ok
      ? { ok: true, muted: result.muted === true, volume: Number(result.volume) || 0 }
      : fail(result.error);
  }

  async function toggleMicMute() {
    const result = await sendWithRetry({ cmd: 'micmute' });
    return result.ok ? { ok: true, muted: result.muted === true } : fail(result.error);
  }

  async function toggleAppMicMute(processName) {
    const proc = String(processName || '').trim();
    if (!proc) return fail('process required');
    const result = await sendWithRetry({ cmd: 'appmicmute', process: proc });
    return result.ok
      ? { ok: true, muted: result.muted === true, changed: Number(result.changed) || 0 }
      : fail(result.error);
  }

  async function toggleAppMute(processName) {
    const proc = String(processName || '').trim();
    if (!proc) return fail('process required');
    const result = await sendWithRetry({ cmd: 'apprendermute', process: proc });
    return result.ok
      ? { ok: true, muted: result.muted === true, changed: Number(result.changed) || 0 }
      : fail(result.error);
  }

  // Start PowerShell ahead of the first request (saves ~1-2 s on the first click).
  function warm() {
    if (!child && !stopped) spawnWorker();
  }

  function stop() {
    stopped = true;
    killWorker(null);
    settleAll(fail('audio stopped'));
    if (exitHook) {
      process.removeListener('exit', exitHook);
      exitHook = null;
    }
  }

  return { list, setVolume, setMuted, setMaster, stepMaster, toggleMasterMute, toggleMicMute, toggleAppMicMute, toggleAppMute, warm, stop };
}

export default createAudio;
