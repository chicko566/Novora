// Native Discord Local RPC client (Named Pipe \\.\pipe\discord-ipc-0..9).
// Zero external dependencies. Credentials & OAuth tokens are stored strictly
// locally in %APPDATA%\Novora\discord.json (never in the repository).
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

const REDIRECT_URI = 'http://127.0.0.1:47830/api/discord/callback';
const SCOPES = ['rpc', 'rpc.voice.read', 'rpc.voice.write'];

function defaultConfigPath() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'Novora', 'discord.json');
}

function encodeFrame(op, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function connectPipe(index = 0) {
  return new Promise((resolve, reject) => {
    if (index > 9) return reject(new Error('Discord läuft nicht (keine IPC-Pipe gefunden)'));
    const pipePath = `\\\\.\\pipe\\discord-ipc-${index}`;
    const sock = net.createConnection(pipePath);
    let settled = false;
    sock.once('connect', () => {
      if (settled) return;
      settled = true;
      resolve(sock);
    });
    sock.once('error', () => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch {}
      connectPipe(index + 1).then(resolve, reject);
    });
  });
}

async function exchangeToken({ clientId, clientSecret, code, refreshToken }) {
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  if (refreshToken) {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
  } else {
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', REDIRECT_URI);
  }
  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Discord OAuth HTTP ${r.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken || '',
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000
  };
}

export function createDiscordRpc({ configPath = defaultConfigPath(), onVoice = () => {} } = {}) {
  let cfg = loadCfg();
  let sock = null;
  let buf = Buffer.alloc(0);
  let ready = false;
  let authorized = false;
  let lastError = '';
  let voice = { mute: false, deaf: false };
  let reconnectTimer = null;
  let stopped = false;
  const pending = new Map(); // nonce -> { resolve, reject, timer }

  function loadCfg() {
    const base = { clientId: '', clientSecret: '', accessToken: '', refreshToken: '', expiresAt: 0 };
    // Env fallback: Creds vom zentralen Server/Deployment, nie im Repo.
    if (!base.clientId) base.clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    if (!base.clientSecret) base.clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
    try {
      if (fs.existsSync(configPath)) {
        const j = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (j && typeof j === 'object') {
          const merged = { ...base, ...j };
          // File-Werte haben Vorrang, aber Env füllt leere Felder.
          if (!merged.clientId) merged.clientId = base.clientId;
          if (!merged.clientSecret) merged.clientSecret = base.clientSecret;
          return merged;
        }
      }
    } catch (e) {
      console.error('[discord] loadCfg failed:', e?.message || e);
    }
    return base;
  }

  function saveCfg() {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      console.error('[discord] saveCfg failed:', e?.message || e);
    }
  }

  function clearPending(reason) {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  }

  function closeSock() {
    ready = false;
    authorized = false;
    const s = sock;
    sock = null;
    buf = Buffer.alloc(0);
    if (s) {
      try { s.destroy(); } catch {}
    }
    clearPending('Discord-Verbindung getrennt');
  }

  function sendCommand(cmd, args = {}, evt = undefined, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!sock) return reject(new Error('Nicht mit Discord verbunden'));
      const nonce = crypto.randomUUID();
      const frame = { cmd, args, nonce };
      if (evt) frame.evt = evt;
      const timer = setTimeout(() => {
        pending.delete(nonce);
        reject(new Error(`Discord RPC Timeout (${cmd})`));
      }, timeoutMs);
      pending.set(nonce, { resolve, reject, timer });
      try {
        sock.write(encodeFrame(OP_FRAME, frame));
      } catch (e) {
        clearTimeout(timer);
        pending.delete(nonce);
        reject(e);
      }
    });
  }

  function handleMessage(op, data) {
    if (op === OP_PING) {
      try { sock?.write(encodeFrame(OP_PONG, data)); } catch {}
      return;
    }
    if (op === OP_CLOSE) {
      lastError = data?.message || 'Discord hat Verbindung geschlossen';
      closeSock();
      scheduleReconnect();
      return;
    }
    if (op !== OP_FRAME || !data) return;

    if (data.cmd === 'DISPATCH' && data.evt === 'VOICE_SETTINGS_UPDATE' && data.data) {
      voice = { mute: !!data.data.mute, deaf: !!data.data.deaf };
      onVoice({ ...voice });
      return;
    }

    if (data.nonce && pending.has(data.nonce)) {
      const p = pending.get(data.nonce);
      pending.delete(data.nonce);
      clearTimeout(p.timer);
      if (data.evt === 'ERROR') {
        p.reject(new Error(data.data?.message || 'Discord RPC Fehler'));
      } else {
        p.resolve(data.data || {});
      }
    }
  }

  function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readUInt32LE(0);
      const len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      const body = buf.subarray(8, 8 + len).toString('utf8');
      buf = buf.subarray(8 + len);
      let data = null;
      try { data = JSON.parse(body); } catch {}
      handleMessage(op, data);
    }
  }

  function waitReady(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Discord Handshake Timeout')), timeoutMs);
      const orig = handleMessage;
      // Listen via temporary wrapper on DISPATCH READY
      const onChunk = (chunk) => {
        // handled by main onData; check via polling ready flag
      };
      void orig; void onChunk;
      // Handshake READY arrives as cmd:'DISPATCH', evt:'READY'
      const check = () => {
        if (ready) { clearTimeout(timer); resolve(); return; }
        if (!sock) { clearTimeout(timer); reject(new Error('Discord-Verbindung abgebrochen')); return; }
        setTimeout(check, 40);
      };
      check();
    });
  }

  async function openAndHandshake(clientId) {
    closeSock();
    const s = await connectPipe(0);
    sock = s;
    buf = Buffer.alloc(0);
    ready = false;

    const readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Discord Handshake Timeout')), 6000);
      const onSocketData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 8) {
          const op = buf.readUInt32LE(0);
          const len = buf.readUInt32LE(4);
          if (buf.length < 8 + len) break;
          const body = buf.subarray(8, 8 + len).toString('utf8');
          buf = buf.subarray(8 + len);
          let data = null;
          try { data = JSON.parse(body); } catch {}
          if (op === OP_FRAME && data?.cmd === 'DISPATCH' && data?.evt === 'READY') {
            ready = true;
            clearTimeout(timer);
            resolve();
          } else {
            handleMessage(op, data);
          }
        }
      };
      s.on('data', onSocketData);
      s.once('close', () => {
        clearTimeout(timer);
        if (sock === s) {
          closeSock();
          scheduleReconnect();
        }
        if (!ready) reject(new Error('Discord hat Verbindung geschlossen'));
      });
      s.once('error', (err) => {
        clearTimeout(timer);
        lastError = err?.message || 'Pipe-Fehler';
        if (sock === s) closeSock();
        if (!ready) reject(err);
      });
    });

    s.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: clientId }));
    await readyPromise;
  }

  async function authenticateAndSubscribe() {
    if (!cfg.clientId || !cfg.accessToken) throw new Error('Nicht autorisiert');
    if (cfg.expiresAt && cfg.expiresAt < Date.now() + 60000 && cfg.refreshToken && cfg.clientSecret) {
      const fresh = await exchangeToken({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        refreshToken: cfg.refreshToken
      });
      Object.assign(cfg, fresh);
      saveCfg();
    }
    await sendCommand('AUTHENTICATE', { access_token: cfg.accessToken });
    authorized = true;
    lastError = '';
    const vs = await sendCommand('GET_VOICE_SETTINGS', {});
    voice = { mute: !!vs.mute, deaf: !!vs.deaf };
    onVoice({ ...voice });
    await sendCommand('SUBSCRIBE', {}, 'VOICE_SETTINGS_UPDATE');
  }

  async function connectStored() {
    if (stopped || !cfg.clientId || !cfg.accessToken) return false;
    try {
      await openAndHandshake(cfg.clientId);
      await authenticateAndSubscribe();
      return true;
    } catch (e) {
      lastError = e?.message || 'Verbindung fehlgeschlagen';
      closeSock();
      scheduleReconnect();
      return false;
    }
  }

  async function connect() {
    if (!cfg.clientId || !cfg.accessToken) {
      throw new Error('Nicht autorisiert — bitte zuerst autorisieren');
    }
    const ok = await connectStored();
    if (!ok) throw new Error(lastError || 'Verbindung fehlgeschlagen');
    return status();
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer || !cfg.clientId || !cfg.accessToken) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectStored();
    }, 8000);
    reconnectTimer.unref?.();
  }

  // Interactive first-time setup: opens the native Authorize dialog inside Discord.
  async function authorize({ clientId, clientSecret }) {
    const cid = String(clientId || cfg.clientId || '').trim();
    const csec = String(clientSecret || cfg.clientSecret || '').trim();
    if (!cid || !csec) throw new Error('Client ID und Client Secret erforderlich');
    cfg.clientId = cid;
    cfg.clientSecret = csec;
    saveCfg();

    // Idempotent: if a usable (or refreshable) token already exists, just connect.
    if (cfg.accessToken && (cfg.expiresAt > Date.now() + 60000 || cfg.refreshToken)) {
      const ok = await connectStored();
      if (ok) return status();
    }

    await openAndHandshake(cid);
    const authRes = await sendCommand('AUTHORIZE', { client_id: cid, scopes: SCOPES }, undefined, 60000);
    if (!authRes.code) throw new Error('Autorisierung in Discord abgebrochen');
    const tok = await exchangeToken({ clientId: cid, clientSecret: csec, code: authRes.code });
    Object.assign(cfg, tok);
    saveCfg();
    await authenticateAndSubscribe();
    return status();
  }

  async function toggleMute() {
    if (!authorized) {
      const ok = await connectStored();
      if (!ok) throw new Error(lastError || 'Discord RPC nicht verbunden');
    }
    const next = !voice.mute;
    const res = await sendCommand('SET_VOICE_SETTINGS', { mute: next });
    voice = { mute: !!res.mute, deaf: !!res.deaf };
    onVoice({ ...voice });
    return { ok: true, mute: voice.mute, deaf: voice.deaf };
  }

  async function toggleDeaf() {
    if (!authorized) {
      const ok = await connectStored();
      if (!ok) throw new Error(lastError || 'Discord RPC nicht verbunden');
    }
    const next = !voice.deaf;
    const res = await sendCommand('SET_VOICE_SETTINGS', { deaf: next });
    voice = { mute: !!res.mute, deaf: !!res.deaf };
    onVoice({ ...voice });
    return { ok: true, mute: voice.mute, deaf: voice.deaf };
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeSock();
    cfg = { clientId: cfg.clientId || '', clientSecret: '', accessToken: '', refreshToken: '', expiresAt: 0 };
    saveCfg();
    lastError = '';
  }

  function status() {
    return {
      configured: !!(cfg.clientId && cfg.clientSecret),
      connected: !!sock && ready,
      authorized: !!authorized,
      clientId: cfg.clientId || '',
      mute: !!voice.mute,
      deaf: !!voice.deaf,
      redirectUri: REDIRECT_URI,
      error: lastError || ''
    };
  }

  function isReady() {
    return !!(sock && ready && authorized);
  }

  function start() {
    stopped = false;
    if (cfg.clientId && cfg.accessToken) connectStored();
  }

  function stop() {
    stopped = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeSock();
  }

  return { start, stop, authorize, connect, disconnect, toggleMute, toggleDeaf, status, isReady };
}

export default createDiscordRpc;
