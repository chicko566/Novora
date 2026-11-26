// PC-Lizenz: lokale Aktivierung, Offline-Pruefung des signierten Tokens,
// Heartbeat gegen den Lizenzserver. Speichert nie den vollen Key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { VERSION } from './protocol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_KEY_PATH = path.join(__dirname, 'license-pub.pem');

const REMOTE_URL = (process.env.NOVORA_LICENSE_URL || 'https://test.diviesx.de/api/license')
  .replace(/\/+$/, '');

const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const INSTALL_RE = /^[A-Za-z0-9._:/-]{8,128}$/;

function dataDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Novora');
  }
  return path.join(os.homedir(), '.novora');
}

const DIR = dataDir();
const INSTALL_FILE = path.join(DIR, 'install.json');
const LICENSE_FILE = path.join(DIR, 'license.json');
// Vom Installer abgelegter Key: wird beim ersten Start einmalig aktiviert.
const PENDING_FILE = path.join(DIR, 'pending-key.txt');

// Endgueltige Fehler: derselbe Key kann nie gelingen, pending also loeschen.
const PENDING_FATAL = new Set(['invalid_key', 'invalid_format', 'seat_limit', 'revoked', 'expired']);

const state = {
  licensed: false,
  plan: null,
  expiresAt: null,          // Token-Ablauf (7 Tage)
  licenseExpiresAt: null,   // Key-Laufzeit; null = unbegrenzt, undefined = unbekannt
  keyHint: null,
  lastCheck: null,
  error: null,
  installId: null
};

let publicKey = null;
let started = false;
let timer = null;
let checking = null;
let activating = null;

function ensureDir() {
  try {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Rechte sind auf Windows nur eingeschraenkt wirksam.
  }
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(file, data, mode = 0o600) {
  ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode });
  fs.renameSync(tmp, file);
}

function loadPublicKey() {
  if (publicKey) return publicKey;
  const pem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  publicKey = crypto.createPublicKey(pem);
  return publicKey;
}

// Offline-Pruefung: Signatur zuerst, danach erst Payload auswerten.
function verifyToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let signature;
  try {
    signature = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  if (signature.length !== 64) return null;

  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(parts[0], 'utf8'), loadPublicKey(), signature);
  } catch {
    valid = false;
  }
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
  return payload;
}

function ensureInstallId() {
  if (state.installId) return state.installId;
  const saved = readJson(INSTALL_FILE);
  if (saved && typeof saved.installId === 'string' && INSTALL_RE.test(saved.installId)) {
    state.installId = saved.installId;
    return state.installId;
  }
  state.installId = crypto.randomUUID();
  try {
    writeJson(INSTALL_FILE, { installId: state.installId });
  } catch {
    // Ohne Datei gilt die ID fuer diese Laufzeit.
  }
  return state.installId;
}

function readLicenseFile() {
  const file = readJson(LICENSE_FILE);
  if (!file || typeof file.token !== 'string') return null;
  return file;
}

function writeLicenseFile(record) {
  const data = {
    token: record.token,
    keyHint: record.keyHint || null,
    expiresAt: record.expiresAt || null,
    plan: record.plan || null,
    lastCheck: record.lastCheck || null,
    installId: state.installId
  };
  // Nur schreiben, wenn bekannt: alte license.json ohne Feld bleibt lesbar.
  if (record.licenseExpiresAt !== undefined) data.licenseExpiresAt = record.licenseExpiresAt || null;
  writeJson(LICENSE_FILE, data);
}

function clearLicenseFile() {
  try {
    fs.unlinkSync(LICENSE_FILE);
  } catch {
    // Datei war schon weg.
  }
}

function clearPendingFile() {
  try {
    fs.unlinkSync(PENDING_FILE);
  } catch {
    // Datei war schon weg.
  }
}

// Liefert den Key aus der Installer-Datei oder null. Der Key wird nie geloggt.
function readPendingKey() {
  let raw;
  try {
    raw = fs.readFileSync(PENDING_FILE, 'utf8');
  } catch {
    return null;
  }
  const key = String(raw || '').trim();
  if (!key) {
    clearPendingFile();
    return null;
  }
  return key;
}

// Installer-Key einmalig aktivieren. Netzwerkfehler lassen die Datei stehen,
// damit der naechste Start es erneut versucht.
async function applyPendingKey() {
  const key = readPendingKey();
  if (!key) return;

  let result;
  try {
    result = await activate(key);
  } catch {
    result = {
      ok: false,
      error: 'network',
      message: 'Lizenzserver nicht erreichbar. Der Lizenzschlüssel wird beim nächsten Start erneut geprüft.'
    };
  }

  if (result && result.ok) {
    clearPendingFile();
    return;
  }

  if (PENDING_FATAL.has(result && result.error)) clearPendingFile();
  state.error = (result && result.message) || 'Lizenzschlüssel konnte nicht aktiviert werden.';
}

function isoFrom(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Key-Laufzeit aus Server-/Dateidaten: null = unbegrenzt, undefined = unbekannt.
function licenseExpiryFrom(data) {
  if (!data || typeof data !== 'object') return undefined;
  if (!Object.prototype.hasOwnProperty.call(data, 'licenseExpiresAt')) return undefined;
  const value = data.licenseExpiresAt;
  if (value === null) return null;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function resetState({ keepError = false } = {}) {
  state.licensed = false;
  state.plan = null;
  state.expiresAt = null;
  state.licenseExpiresAt = undefined;
  state.keyHint = null;
  state.lastCheck = null;
  if (!keepError) state.error = null;
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (!state.licensed) return;
    checkNow().catch(() => {});
  }, HEARTBEAT_MS);
  timer.unref?.();
}

async function request(pathname, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${REMOTE_URL}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data && typeof data === 'object' ? data : {} };
}

function errorMessage(status, data) {
  if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  switch (status) {
    case 400: return 'Lizenzschlüssel ist ungültig.';
    case 403: return 'Lizenz wurde gesperrt oder ist abgelaufen.';
    case 409: return 'Alle Plätze sind belegt. Bitte zuerst ein Gerät freigeben.';
    case 429: return 'Zu viele Versuche. Bitte kurz warten.';
    default: return `Lizenzserver meldet Fehler ${status}.`;
  }
}

export function getStatus() {
  return {
    licensed: state.licensed,
    plan: state.plan,
    expiresAt: state.expiresAt,
    licenseExpiresAt: state.licenseExpiresAt,
    keyHint: state.keyHint,
    lastCheck: state.lastCheck,
    error: state.error,
    installId: state.installId
  };
}

export function getToken() {
  const file = readLicenseFile();
  if (!file) return null;
  return verifyToken(file.token) ? file.token : null;
}

export function activate(rawKey) {
  if (activating) return activating;
  activating = runActivate(rawKey).finally(() => { activating = null; });
  return activating;
}

async function runActivate(rawKey) {
  ensureInstallId();
  const key = String(rawKey || '').trim().toUpperCase();
  if (!key) {
    return { ok: false, error: 'invalid_key', message: 'Bitte Lizenzschlüssel eingeben.', httpStatus: 400 };
  }
  const normalized = key.replace(/[^0-9A-Z]/g, '');
  if (!/^NVR[0-9A-Z]{20}$/.test(normalized)) {
    return {
      ok: false,
      error: 'invalid_format',
      message: 'Format: NVR-XXXXX-XXXXX-XXXXX-XXXXX.',
      httpStatus: 400
    };
  }

  let result;
  try {
    result = await request('/activate', {
      key: normalized,
      installId: state.installId,
      deviceName: os.hostname(),
      platform: process.platform,
      appVersion: VERSION
    });
  } catch {
    return {
      ok: false,
      error: 'network',
      message: 'Lizenzserver nicht erreichbar. Der PC muss während der Aktivierung online sein.',
      httpStatus: 502
    };
  }

  if (result.status !== 200 || !result.data.ok || typeof result.data.token !== 'string') {
    return {
      ok: false,
      error: typeof result.data.error === 'string' ? result.data.error : 'activate_failed',
      message: errorMessage(result.status, result.data),
      httpStatus: result.status >= 400 && result.status < 500 ? result.status : 502
    };
  }

  const payload = verifyToken(result.data.token);
  if (!payload) {
    return {
      ok: false,
      error: 'invalid_token',
      message: 'Der Lizenzserver hat ein ungültiges Token geliefert.',
      httpStatus: 502
    };
  }

  const keyHint = normalized.slice(-4);
  const expiresAt = typeof result.data.expiresAt === 'string'
    ? result.data.expiresAt
    : isoFrom(payload.exp);
  const licenseExpiresAt = licenseExpiryFrom(result.data);
  const plan = typeof result.data.plan === 'string' ? result.data.plan : (payload.plan || null);
  const now = new Date().toISOString();

  try {
    writeLicenseFile({ token: result.data.token, keyHint, expiresAt, licenseExpiresAt, plan, lastCheck: now });
  } catch {
    return {
      ok: false,
      error: 'storage',
      message: 'Lizenz konnte nicht gespeichert werden.',
      httpStatus: 500
    };
  }

  state.licensed = true;
  state.plan = plan;
  state.expiresAt = expiresAt;
  state.licenseExpiresAt = licenseExpiresAt;
  state.keyHint = keyHint;
  state.lastCheck = now;
  state.error = null;
  startTimer();

  return { ok: true, status: getStatus() };
}

export function deactivate() {
  return runDeactivate();
}

async function runDeactivate() {
  const file = readLicenseFile();
  let warning = null;

  if (file) {
    try {
      const result = await request('/deactivate', {}, file.token);
      if (![200, 401, 403].includes(result.status)) {
        warning = `Lizenzserver meldet ${result.status}. Lizenz wurde nur lokal entfernt.`;
      }
    } catch {
      warning = 'Lizenzserver nicht erreichbar. Lizenz wurde nur lokal entfernt.';
    }
  }

  clearLicenseFile();
  resetState();
  return { ok: true, warning, status: getStatus() };
}

export function checkNow() {
  if (checking) return checking;
  checking = runCheck().finally(() => { checking = null; });
  return checking;
}

async function runCheck() {
  const file = readLicenseFile();
  if (!file) {
    resetState();
    return getStatus();
  }

  const local = verifyToken(file.token);
  if (!local) {
    state.licensed = false;
    state.plan = file.plan || null;
    state.keyHint = file.keyHint || null;
    state.expiresAt = file.expiresAt || null;
    state.licenseExpiresAt = file.licenseExpiresAt;
    state.error = 'Lizenz abgelaufen oder ungültig. Bitte Key erneut eingeben.';
    return getStatus();
  }

  try {
    const result = await request('/heartbeat', {}, file.token);

    if (result.status === 200 && result.data.ok && typeof result.data.token === 'string') {
      const payload = verifyToken(result.data.token);
      if (!payload) {
        state.error = 'Lizenzserver hat ein ungültiges Token geliefert. Lokal gilt der Key weiter.';
        state.licensed = true;
        state.expiresAt = isoFrom(local.exp);
        state.licenseExpiresAt = file.licenseExpiresAt;
        return getStatus();
      }
      const expiresAt = typeof result.data.expiresAt === 'string'
        ? result.data.expiresAt
        : isoFrom(payload.exp);
      const licenseExpiresAt = licenseExpiryFrom(result.data);
      const plan = payload.plan || file.plan || null;
      const now = new Date().toISOString();
      try {
        writeLicenseFile({ token: result.data.token, keyHint: file.keyHint, expiresAt, licenseExpiresAt, plan, lastCheck: now });
      } catch {
        // Schreiben fehlgeschlagen: Token bleibt im Speicher gueltig.
      }
      state.licensed = true;
      state.plan = plan;
      state.expiresAt = expiresAt;
      state.licenseExpiresAt = licenseExpiresAt === undefined ? file.licenseExpiresAt : licenseExpiresAt;
      state.keyHint = file.keyHint || null;
      state.lastCheck = now;
      state.error = null;
      return getStatus();
    }

    if (result.status === 401 || result.status === 403) {
      // Gesperrt/abgelaufen: Token entfernen, damit ein Neustart nicht wieder freigibt.
      clearLicenseFile();
      state.licensed = false;
      state.plan = file.plan || null;
      state.keyHint = file.keyHint || null;
      state.expiresAt = file.expiresAt || null;
      state.licenseExpiresAt = file.licenseExpiresAt;
      state.error = errorMessage(result.status, result.data);
      return getStatus();
    }

    state.licensed = true;
    state.plan = local.plan || file.plan || null;
    state.expiresAt = isoFrom(local.exp) || file.expiresAt || null;
    state.licenseExpiresAt = file.licenseExpiresAt;
    state.keyHint = file.keyHint || null;
    state.error = `Lizenzserver antwortet mit ${result.status}. Lokal gilt der Key weiter.`;
    return getStatus();
  } catch {
    state.licensed = true;
    state.plan = local.plan || file.plan || null;
    state.expiresAt = isoFrom(local.exp) || file.expiresAt || null;
    state.licenseExpiresAt = file.licenseExpiresAt;
    state.keyHint = file.keyHint || null;
    state.error = 'Keine Verbindung zum Lizenzserver. Lokal gilt der Key weiter.';
    return getStatus();
  }
}

export async function ensureStarted() {
  if (started) return getStatus();
  started = true;

  ensureInstallId();
  await applyPendingKey();

  const file = readLicenseFile();
  if (file) {
    const payload = verifyToken(file.token);
    if (payload) {
      state.licensed = true;
      state.plan = payload.plan || file.plan || null;
      state.expiresAt = isoFrom(payload.exp) || file.expiresAt || null;
      state.licenseExpiresAt = file.licenseExpiresAt;
      state.keyHint = file.keyHint || null;
      state.lastCheck = file.lastCheck || null;
      state.error = null;
    } else {
      state.licensed = false;
      state.plan = file.plan || null;
      state.keyHint = file.keyHint || null;
      state.expiresAt = file.expiresAt || null;
      state.licenseExpiresAt = file.licenseExpiresAt;
      state.error = 'Lizenz abgelaufen oder ungültig. Bitte Key erneut eingeben.';
    }
  }

  if (state.licensed) {
    const last = state.lastCheck ? Date.parse(state.lastCheck) : NaN;
    if (!Number.isFinite(last) || Date.now() - last > STALE_MS) {
      // Nicht blockieren: Aktivierung gilt sofort, Heartbeat laeuft daneben.
      checkNow().catch(() => {});
    }
    startTimer();
  }

  return getStatus();
}
