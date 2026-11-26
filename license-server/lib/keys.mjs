import crypto from 'node:crypto';

// Crockford-nahes Alphabet ohne I, L, O, U sowie ohne 0 und 1 (Verwechslungsgefahr).
export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PREFIX = 'NVR';
const GROUP = 5;
const PAYLOAD_CHARS = 15;
const TOTAL_CHARS = PAYLOAD_CHARS + GROUP; // 15 Nutzzeichen + 5 Pruefsummenzeichen
const BASE = ALPHABET.length; // 30

function randomSymbols(count) {
  let out = '';
  const limit = Math.floor(256 / BASE) * BASE; // 240: verhindert Modulo-Bias
  while (out.length < count) {
    for (const byte of crypto.randomBytes(count)) {
      if (out.length >= count) break;
      if (byte < limit) out += ALPHABET[byte % BASE];
    }
  }
  return out;
}

export function checksumFor(pepper, payload) {
  const digest = crypto.createHmac('sha256', pepper).update('novora-key-v1|' + payload).digest();
  let sum = '';
  for (let i = 0; i < GROUP; i += 1) sum += ALPHABET[digest[i] % BASE];
  return sum;
}

export function generateKey(pepper) {
  const payload = randomSymbols(PAYLOAD_CHARS);
  const normalized = PREFIX + payload + checksumFor(pepper, payload);
  return { normalized, formatted: formatKey(normalized) };
}

export function normalizeKey(input) {
  return String(input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatKey(normalized) {
  const body = normalized.startsWith(PREFIX) ? normalized.slice(PREFIX.length) : normalized;
  const groups = body.match(/.{1,5}/g);
  return groups ? `${PREFIX}-${groups.join('-')}` : PREFIX;
}

export function validateKey(input, pepper) {
  const normalized = normalizeKey(input);
  if (!normalized.startsWith(PREFIX)) return { ok: false, error: 'invalid_key' };
  const body = normalized.slice(PREFIX.length);
  if (body.length !== TOTAL_CHARS) return { ok: false, error: 'invalid_key' };
  for (const ch of body) {
    if (!ALPHABET.includes(ch)) return { ok: false, error: 'invalid_key' };
  }
  const payload = body.slice(0, PAYLOAD_CHARS);
  const given = Buffer.from(body.slice(PAYLOAD_CHARS), 'utf8');
  const expected = Buffer.from(checksumFor(pepper, payload), 'utf8');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, error: 'invalid_key' };
  }
  return { ok: true, normalized, formatted: formatKey(normalized), payload };
}

export function keyHash(pepper, normalized) {
  return crypto.createHmac('sha256', pepper).update('novora-key-hash|' + normalized).digest('hex');
}

export function keyMeta(normalized) {
  const prefix = normalized.slice(0, 3 + GROUP); // NVR + erste 5 Zeichen
  return { keyPrefix: prefix, keyLast4: normalized.slice(-4) };
}

export function keyLabel(keyPrefix, keyLast4) {
  const body = keyPrefix.startsWith(PREFIX) ? keyPrefix.slice(PREFIX.length) : keyPrefix;
  return `${PREFIX}-${body}-...-${keyLast4}`;
}

export function hashIp(pepper, ip) {
  return crypto.createHmac('sha256', pepper).update('novora-ip|' + String(ip ?? '')).digest('hex').slice(0, 32);
}
