// HTTP plumbing shared by all routes: JSON responses, body parsing,
// client identity, rate limiting, latency stats and the SSE hub.
export const VERSION = '0.4.0';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-token',
  'access-control-allow-methods': 'GET,POST,OPTIONS'
};

export function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...CORS
  });
  res.end(body);
}

// Strip keys that could poison prototypes after JSON.parse.
export function sanitize(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

// Read a JSON body with a hard size cap. Never throws on bad JSON.
export function readBody(req, limit = 262144) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };

    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) { finish({ __error: 'body too large' }); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        finish(sanitize(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')));
      } catch {
        finish({});
      }
    });
    req.on('error', () => finish({}));
  });
}

// Normalize IPv4-mapped IPv6 addresses to plain IPv4.
export function clientIp(req) {
  const raw = String(req.socket.remoteAddress || '');
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

export const isLocal = (ip) => ip === '127.0.0.1' || ip === '::1';

export const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

export const str = (value, max, fallback = '') =>
  typeof value === 'string' ? value.slice(0, max) : fallback;

// Fixed-window rate limiter: limit requests per IP per window.
export class RateLimiter {
  constructor({ limit = 30, windowMs = 1000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  allow(ip, now = Date.now()) {
    const entry = this.hits.get(ip);
    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(ip, { start: now, n: 1 });
      if (this.hits.size > 4096) this.sweep(now);
      return true;
    }
    entry.n += 1;
    return entry.n <= this.limit;
  }

  sweep(now) {
    for (const [ip, entry] of this.hits) {
      if (now - entry.start >= this.windowMs) this.hits.delete(ip);
    }
  }
}

// Ring buffer of the last N request durations.
export class LatencyStats {
  constructor(size = 1000) {
    this.size = size;
    this.buf = new Float64Array(size);
    this.idx = 0;
    this.count = 0;
  }

  push(ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.buf[this.idx] = ms;
    this.idx = (this.idx + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  stats() {
    if (this.count === 0) return { p50: 0, p95: 0, p99: 0, count: 0 };
    const values = Array.from(this.buf.slice(0, this.count)).sort((a, b) => a - b);
    const pct = (p) => values[Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1))];
    const round = (n) => +n.toFixed(2);
    return { p50: round(pct(50)), p95: round(pct(95)), p99: round(pct(99)), count: values.length };
  }
}

// Server-sent events fan-out.
export class SseHub {
  constructor() {
    this.clients = new Set();
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        // A named event (not an SSE comment) so the client watchdog can see it.
        try { c.res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`); } catch { this.clients.delete(c); }
      }
    }, 20000);
    this.heartbeat.unref?.();
  }

  add(res, deviceId) {
    const client = { res, deviceId };
    this.clients.add(client);
    return client;
  }

  remove(client) {
    this.clients.delete(client);
  }

  broadcast(event, payload) {
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of this.clients) {
      try { c.res.write(line); } catch { this.clients.delete(c); }
    }
  }

  closeDevice(deviceId) {
    for (const c of [...this.clients]) {
      if (c.deviceId !== deviceId) continue;
      try { c.res.end(); } catch {}
      this.clients.delete(c);
    }
  }

  closeAll() {
    clearInterval(this.heartbeat);
    for (const c of [...this.clients]) {
      try { c.res.end(); } catch {}
    }
    this.clients.clear();
  }

  get size() {
    return this.clients.size;
  }
}
