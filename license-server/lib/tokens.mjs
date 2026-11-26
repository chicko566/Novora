import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64u = (value) => Buffer.from(value).toString('base64url');

export function ensureKeyPair(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privatePath = path.join(dir, 'license.pem');
  const publicPath = path.join(dir, 'license.pub.pem');
  let created = false;
  let privateKey;
  let publicKey;

  if (fs.existsSync(privatePath)) {
    privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath));
    if (fs.existsSync(publicPath)) {
      publicKey = crypto.createPublicKey(fs.readFileSync(publicPath));
    } else {
      publicKey = crypto.createPublicKey(privateKey);
      fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
    }
  } else {
    const pair = crypto.generateKeyPairSync('ed25519');
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
    created = true;
  }

  try {
    fs.chmodSync(privatePath, 0o600);
  } catch {
    // Windows: chmod ist nur eingeschraenkt wirksam
  }
  return { privateKey, publicKey, created, privatePath, publicPath };
}

export function signToken(payload, privateKey) {
  const body = b64u(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(body, 'utf8'), privateKey);
  return `${body}.${b64u(signature)}`;
}

export function verifyToken(token, publicKey) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return { ok: false, error: 'malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'malformed' };

  const signature = Buffer.from(parts[1], 'base64url');
  if (signature.length !== 64) return { ok: false, error: 'malformed' };

  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(parts[0], 'utf8'), publicKey, signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1) {
    return { ok: false, error: 'malformed' };
  }
  return { ok: true, payload };
}
