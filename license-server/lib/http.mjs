const MAX_BODY = 512 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'Anfrage ist zu gross.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!done) reject(error);
    });
  });
}

export async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON ist ungueltig.');
  }
}

export async function readForm(req) {
  const raw = await readBody(req);
  const params = new URLSearchParams(raw.toString('utf8'));
  const out = {};
  for (const [key, value] of params) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) bits.push(`Max-Age=${Math.floor(options.maxAge)}`);
  bits.push(`SameSite=${options.sameSite ?? 'Strict'}`);
  if (options.httpOnly !== false) bits.push('HttpOnly');
  if (options.secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Strict; HttpOnly`;
}

// X-Forwarded-For darf nur ausgewertet werden, wenn die Verbindung von einem
// lokalen/reverse-proxy-Adressbereich kommt. Sonst koennte jeder Client die
// Header frei faelschen und Rate-Limits bzw. Audit-Logs umgehen.
function isProxyAddress(address) {
  const ip = String(address ?? '').replace(/^::ffff:/i, '');
  if (!ip) return false;
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const private172 = /^172\.(\d{1,3})\./.exec(ip);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  return false;
}

export function clientIp(req) {
  const socketIp = req.socket?.remoteAddress ?? '';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length && isProxyAddress(socketIp)) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return socketIp || 'unknown';
}

export function securityHeaders(res, { html = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    html
      ? "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      : "default-src 'none'; frame-ancestors 'none'",
  );
}

export function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendHtml(res, status, html, headers = {}) {
  securityHeaders(res, { html: true });
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(html);
}

export function sendText(res, status, text, headers = {}) {
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text);
}

export function redirect(res, location, headers = {}) {
  securityHeaders(res);
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

export function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
