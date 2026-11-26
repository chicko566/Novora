// Pairing and token auth. Tokens are stored only as SHA-256 hashes.
import crypto from 'node:crypto';

const CODE_TTL_MS = 120_000;   // pairing code valid 120 s (matches PC display)
const MAX_FAILS = 5;          // failed claims per IP
const LOCK_MS = 60_000;       // then locked for 60 s

// Triangle: a new device waits for the PC to confirm, at most 5 minutes.
// NOVORA_PAIR_TTL_MS exists so tests can shrink the window.
const PAIR_TTL_MS = Math.max(1000, Number(process.env.NOVORA_PAIR_TTL_MS) || 300_000);
const MAX_PAIR_REQUESTS = 20;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Devices are exposed without their hash.
export const publicDevices = (devices) => devices.map(({ hash, ...rest }) => rest);

export function createAuth({ db, save, onChange, onPair }) {
  const codes = new Map();  // code -> expiresAt
  const fails = new Map();  // ip -> { n, until }
  // Plaintext tokens handed out by `allow`, kept in memory until the phone
  // picks them up (or the request expires). Never written to disk.
  const pairTokens = new Map(); // requestId -> token

  const lockRemaining = (ip, now) => {
    const entry = fails.get(ip);
    if (!entry || !entry.until || entry.until <= now) return 0;
    return Math.ceil((entry.until - now) / 1000);
  };

  const registerFail = (ip, now) => {
    const entry = fails.get(ip) || { n: 0, until: 0 };
    entry.n += 1;
    if (entry.n >= MAX_FAILS) {
      entry.n = 0;
      entry.until = now + LOCK_MS;
    }
    fails.set(ip, entry);
  };

  // Mint a token for a device; an existing device with the same hwid keeps its
  // id and just gets a fresh token (so "remove" is what unpairs, not a token).
  function link(hwid, deviceName) {
    const name = String(deviceName || 'Gerät').slice(0, 40);
    const token = crypto.randomBytes(32).toString('hex');
    let dev = hwid ? db.devices.find((d) => d.hwid === hwid) : null;
    if (dev) {
      dev.hash = sha256(token);
      dev.name = name;
      dev.last = Date.now();
    } else {
      dev = { id: crypto.randomUUID(), name, hash: sha256(token), last: Date.now() };
      if (hwid) dev.hwid = hwid;
      db.devices.push(dev);
    }
    save();
    onChange?.();
    return { token, device: { id: dev.id, name: dev.name } };
  }

  const pairList = () => (Array.isArray(db.pairRequests) ? db.pairRequests : (db.pairRequests = []));

  const dropRequest = (id) => {
    pairTokens.delete(id);
    db.pairRequests = pairList().filter((r) => r.id !== id);
  };

  // Forget requests older than the TTL; pending ones notify the phone.
  function prunePairs(now = Date.now()) {
    let changed = false;
    for (const req of [...pairList()]) {
      if (now - req.createdAt <= PAIR_TTL_MS) continue;
      dropRequest(req.id);
      changed = true;
      if (req.status === 'pending') onPair?.(req.id, 'expired');
    }
    if (changed) save();
  }

  // New 6-digit code, one active code per value, expires after 60 s.
  function requestCode() {
    const now = Date.now();
    for (const [code, expires] of codes) {
      if (expires <= now) codes.delete(code);
    }
    let code;
    do { code = String(crypto.randomInt(100000, 1000000)); } while (codes.has(code));
    codes.set(code, now + CODE_TTL_MS);
    return { code, expires: CODE_TTL_MS / 1000 };
  }

  function claim(ip, rawCode, deviceName) {
    const now = Date.now();
    const retry = lockRemaining(ip, now);
    if (retry > 0) return { ok: false, error: 'locked', retry };

    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const expires = codes.get(code);
    if (!/^\d{6}$/.test(code) || !expires || expires <= now) {
      codes.delete(code);
      registerFail(ip, now);
      return { ok: false, error: 'code invalid' };
    }

    codes.delete(code);       // one-time use
    fails.delete(ip);

    // Entering the code on the PC side is itself the confirmation.
    const issued = link('', deviceName);
    return { ok: true, ...issued };
  }

  // A new device asks to be let in; no token until the PC says yes.
  function requestPair({ device, hwid, ip }) {
    const now = Date.now();
    prunePairs(now);
    const name = String(device || 'Gerät').slice(0, 40) || 'Gerät';
    const hw = String(hwid || '').slice(0, 64);

    // Same device asking again while pending: same ticket, no duplication.
    const open = hw ? pairList().find((r) => r.hwid === hw && r.status === 'pending') : null;
    if (open) {
      open.device = name;
      open.ip = ip || '';
      save();
      return { requestId: open.id, device: open.device };
    }

    const req = {
      id: crypto.randomUUID(),
      device: name,
      hwid: hw,
      ip: String(ip || ''),
      createdAt: now,
      status: 'pending'
    };
    const list = pairList();
    list.push(req);
    // Cap the queue: oldest pending tickets fall off first.
    while (list.length > MAX_PAIR_REQUESTS) {
      const oldestPending = list.find((r) => r.status === 'pending');
      if (!oldestPending) break;
      dropRequest(oldestPending.id);
    }
    save();
    return { requestId: req.id, device: req.device };
  }

  function listPairs() {
    prunePairs();
    const now = Date.now();
    return pairList()
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        id: r.id,
        device: r.device,
        hwid: r.hwid,
        ip: r.ip,
        ageSec: Math.max(0, Math.round((now - r.createdAt) / 1000))
      }));
  }

  function findPair(id) {
    if (typeof id !== 'string' || !id) return null;
    prunePairs();
    return pairList().find((r) => r.id === id) || null;
  }

  // PC confirms: mint the token now, hand it over on the phone's status poll.
  function allowPair(id) {
    const req = findPair(id);
    if (!req) return { ok: false, error: 'unknown request' };
    if (req.status === 'allowed') return { ok: false, error: 'already allowed' };
    if (req.status === 'denied') return { ok: false, error: 'already denied' };
    const issued = link(req.hwid, req.device);
    req.status = 'allowed';
    pairTokens.set(req.id, issued.token);
    save();
    onPair?.(req.id, 'allowed');
    return { ok: true, device: issued.device };
  }

  function denyPair(id) {
    const req = findPair(id);
    if (!req) return { ok: false, error: 'unknown request' };
    if (req.status === 'allowed') return { ok: false, error: 'already allowed' };
    req.status = 'denied';
    pairTokens.delete(req.id);
    save();
    onPair?.(req.id, 'denied');
    return { ok: true };
  }

  // Phone polls its ticket; the token is handed out exactly once.
  function pairStatus(id) {
    if (typeof id !== 'string' || !id) return { ok: true, status: 'expired' };
    const req = findPair(id);
    if (!req) return { ok: true, status: 'expired' };
    if (req.status === 'denied') return { ok: true, status: 'denied' };
    if (req.status === 'allowed') {
      const token = pairTokens.get(req.id);
      dropRequest(req.id);
      save();
      return token ? { ok: true, status: 'allowed', token } : { ok: true, status: 'expired' };
    }
    return { ok: true, status: 'pending' };
  }

  // Resolve a device from x-token header or ?token= (used by EventSource).
  function find(req, url) {
    const raw = req.headers['x-token'] || url.searchParams.get('token');
    if (!raw || typeof raw !== 'string') return null;
    const wanted = Buffer.from(sha256(raw), 'hex');
    for (const device of db.devices) {
      if (typeof device.hash !== 'string' || device.hash.length !== 64) continue;
      const stored = Buffer.from(device.hash, 'hex');
      if (stored.length === wanted.length && crypto.timingSafeEqual(stored, wanted)) {
        device.last = Date.now();
        return device;
      }
    }
    return null;
  }

  function revoke(id) {
    const dev = db.devices.find((d) => d.id === id);
    if (!dev) return false;
    db.devices = db.devices.filter((d) => d.id !== id);
    // A removed device must ask again: its pending tickets die with it.
    if (dev.hwid) {
      for (const req of [...pairList()]) {
        if (req.hwid !== dev.hwid) continue;
        dropRequest(req.id);
      }
    }
    save();
    onChange?.();
    return true;
  }

  return {
    requestCode, claim, find, revoke,
    link, requestPair, listPairs, allowPair, denyPair, pairStatus
  };
}
