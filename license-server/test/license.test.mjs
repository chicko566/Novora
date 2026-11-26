import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryStore } from '../lib/store/memory.mjs';
import { createLicenseService } from '../lib/license.mjs';
import { generateKey, keyHash, keyMeta, validateKey, normalizeKey, formatKey } from '../lib/keys.mjs';
import { verifyToken } from '../lib/tokens.mjs';

const PEPPER = 'test-pepper-0123456789abcdef';
const DAY = 86400000;

function fixture({ tokenTtlMs } = {}) {
  const store = createMemoryStore();
  const keys = crypto.generateKeyPairSync('ed25519');
  const cfg = { pepper: PEPPER, tokenDays: 7, heartbeatHours: 6, minVersion: '0.1.4' };
  const service = createLicenseService({ store, keys, cfg, tokenTtlMs });
  return { store, keys, cfg, service };
}

async function seedLicense(store, { plan = 'standard', seats = 1, expiresAt = null } = {}) {
  const generated = generateKey(PEPPER);
  const meta = keyMeta(generated.normalized);
  const license = await store.createLicense({
    keyHash: keyHash(PEPPER, generated.normalized),
    keyPrefix: meta.keyPrefix,
    keyLast4: meta.keyLast4,
    plan,
    seats,
    expiresAt,
    note: 'Testlizenz',
    customerEmail: 'test@example.org',
    createdAt: Date.now(),
  });
  return { key: generated.formatted, normalized: generated.normalized, license };
}

test('Schluesselformat: erzeugen, normalisieren, Pruefsumme', () => {
  const generated = generateKey(PEPPER);
  assert.match(generated.formatted, /^NVR(-[2-9A-Z]{5}){4}$/);

  const verdict = validateKey(generated.formatted, PEPPER);
  assert.equal(verdict.ok, true);
  assert.equal(normalizeKey(generated.formatted.toLowerCase()), generated.normalized);
  assert.equal(formatKey(generated.normalized), generated.formatted);

  const last = generated.normalized.slice(-1);
  const other = last === '2' ? '3' : '2';
  const broken = generated.normalized.slice(0, -1) + other;
  assert.equal(validateKey(broken, PEPPER).ok, false, 'falsche Pruefsumme wird abgelehnt');

  assert.equal(validateKey('NVR-00000-00000-00000-00000', PEPPER).ok, false);
  assert.equal(validateKey('NVR-IIIII-IIIII-IIIII-IIIII', PEPPER).ok, false);
  assert.equal(validateKey('', PEPPER).ok, false);
});

test('activate liefert Token, Plan und Features; DB speichert keinen Klartext', async () => {
  const { store, service, keys } = fixture();
  const { key, normalized, license } = await seedLicense(store);

  const result = await service.activate({
    key,
    installId: 'install-1',
    deviceName: 'Test-PC',
    platform: 'windows',
    appVersion: '0.1.4',
  });

  assert.equal(result.plan, 'standard');
  assert.ok(Array.isArray(result.features) && result.features.includes('desktop'));
  assert.ok(result.token.includes('.'));
  assert.ok(result.expiresAt);

  const verified = verifyToken(result.token, keys.publicKey);
  assert.equal(verified.ok, true);
  assert.equal(verified.payload.lic, license.id);
  assert.equal(verified.payload.v, 1);
  assert.equal(verified.payload.exp - verified.payload.iat, 7 * DAY);

  const stored = JSON.stringify(license);
  assert.equal(stored.includes(normalized), false, 'voller Key darf nicht gespeichert sein');
  assert.equal(license.keyHash.length, 64);
  assert.equal(license.keyLast4, normalized.slice(-4));
});

test('heartbeat erneuert Token, deactivate gibt Sitz frei', async () => {
  const { store, service } = fixture();
  const { key } = await seedLicense(store);

  const activated = await service.activate({ key, installId: 'install-1', deviceName: 'PC' });
  const heartbeat = await service.heartbeat(activated.token);

  assert.ok(heartbeat.token && heartbeat.token !== activated.token, 'heartbeat muss neues Token liefern');
  assert.ok(heartbeat.expiresAt);

  const again = await service.heartbeat(heartbeat.token);
  assert.ok(again.token);

  await service.deactivate(again.token);
  await assert.rejects(
    () => service.heartbeat(again.token),
    (error) => error.status === 403 && error.code === 'deactivated',
  );

  const reactivated = await service.activate({ key, installId: 'install-1', deviceName: 'PC' });
  assert.ok(reactivated.token, 'nach Freigabe muss erneute Aktivierung moeglich sein');
});

test('manipuliertes Token wird abgelehnt', async () => {
  const { store, service } = fixture();
  const { key } = await seedLicense(store, { plan: 'standard' });
  const activated = await service.activate({ key, installId: 'install-1' });

  const [body, signature] = activated.token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  payload.plan = 'team';
  payload.feat = ['desktop', 'mobile', 'updates', 'priority', 'admin'];
  const forgedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const forged = `${forgedBody}.${signature}`;

  await assert.rejects(
    () => service.heartbeat(forged),
    (error) => error.status === 401 && error.code === 'invalid_token',
  );

  const badSignature = `${body}.${'A'.repeat(86)}`;
  await assert.rejects(
    () => service.heartbeat(badSignature),
    (error) => error.status === 401 && error.code === 'invalid_token',
  );

  await assert.rejects(
    () => service.heartbeat('kein-token'),
    (error) => error.status === 401 && error.code === 'invalid_token',
  );
});

test('revoke sperrt Aktivierung und Heartbeat', async () => {
  const { store, service } = fixture();
  const { key, license } = await seedLicense(store);
  const activated = await service.activate({ key, installId: 'install-1' });

  await store.updateLicense(license.id, { status: 'revoked' });

  await assert.rejects(
    () => service.heartbeat(activated.token),
    (error) => error.status === 403 && error.code === 'revoked',
  );
  await assert.rejects(
    () => service.activate({ key, installId: 'install-2' }),
    (error) => error.status === 403 && error.code === 'revoked',
  );
});

test('seat_limit greift bei zweiter Install-ID', async () => {
  const { store, service } = fixture();
  const { key } = await seedLicense(store, { seats: 1 });

  await service.activate({ key, installId: 'install-1' });
  await assert.rejects(
    () => service.activate({ key, installId: 'install-2' }),
    (error) => error.status === 409 && error.code === 'seat_limit',
  );

  const resumed = await service.activate({ key, installId: 'install-1' });
  assert.ok(resumed.token, 'bekannte Install-ID darf Sitz weiter nutzen');

  const events = await store.listEvents({ licenseId: 1, limit: 50 });
  assert.ok(events.some((event) => event.event === 'seat_limit'));
  assert.ok(events.some((event) => event.event === 'activated'));
});

test('abgelaufenes Token und abgelaufene Lizenz werden abgelehnt', async () => {
  const expired = fixture({ tokenTtlMs: -1000 });
  const seeded = await seedLicense(expired.store);
  const activated = await expired.service.activate({ key: seeded.key, installId: 'install-1' });

  await assert.rejects(
    () => expired.service.heartbeat(activated.token),
    (error) => error.status === 401 && error.code === 'token_expired',
  );

  const lapsed = fixture();
  const past = await seedLicense(lapsed.store, { expiresAt: Date.now() - 1000 });
  await assert.rejects(
    () => lapsed.service.activate({ key: past.key, installId: 'install-1' }),
    (error) => error.status === 403 && error.code === 'expired',
  );
});

test('readForm behaelt Mehrfachwerte fuer Bulk-Delete', async () => {
  const { Readable } = await import('node:stream');
  const { readForm } = await import('../lib/http.mjs');
  const req = Readable.from([Buffer.from('_csrf=abc&id=2&id=5&id=9')]);
  const form = await readForm(req);
  assert.equal(form._csrf, 'abc');
  assert.deepEqual(form.id, ['2', '5', '9']);
});

test('deleteLicense entfernt Lizenz und Aktivierungen sauber', async () => {
  const { store, service } = fixture();
  const a = await seedLicense(store);
  const b = await seedLicense(store);
  await service.activate({ key: a.key, installId: 'install-a' });
  await service.activate({ key: b.key, installId: 'install-b' });

  assert.equal(await store.deleteLicense(a.license.id), true);
  assert.equal(await store.getLicense(a.license.id), null);
  assert.equal((await store.listActivations(a.license.id)).length, 0);
  assert.ok(await store.getLicense(b.license.id), 'andere Lizenz bleibt erhalten');
});
