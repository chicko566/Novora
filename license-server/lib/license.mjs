import crypto from 'node:crypto';
import { fail } from './errors.mjs';
import { validateKey, keyHash, hashIp } from './keys.mjs';
import { featuresForPlan } from './plans.mjs';
import { iso } from './time.mjs';
import { signToken, verifyToken } from './tokens.mjs';

const DAY = 86400000;

function cleanText(value, max = 190) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanInstallId(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.length > 128) return null;
  if (!/^[A-Za-z0-9._:/-]+$/.test(text)) return null;
  return text;
}

export function createLicenseService({ store, keys, cfg, clock = () => Date.now(), tokenTtlMs }) {
  const ttl = Number.isFinite(tokenTtlMs) ? tokenTtlMs : cfg.tokenDays * DAY;

  function issueToken(license, activation) {
    const iat = clock();
    const exp = iat + ttl;
    const payload = {
      v: 1,
      lic: license.id,
      inst: activation.id,
      plan: license.plan,
      feat: featuresForPlan(license.plan),
      iat,
      exp,
      jti: crypto.randomUUID(),
    };
    return { token: signToken(payload, keys.privateKey), expiresAt: exp };
  }

  async function log(data) {
    try {
      await store.logEvent(data);
    } catch {
      // Audit darf den Lizenzpfad nicht blockieren
    }
  }

  const service = {
    async activate(input = {}, { ip } = {}) {
      const installId = cleanInstallId(input.installId);
      if (!installId) fail(400, 'invalid_key', 'installId fehlt oder ist ungueltig.');

      const verdict = validateKey(input.key, cfg.pepper);
      if (!verdict.ok) fail(400, 'invalid_key', 'Lizenzschluessel ist ungueltig.');

      const license = await store.findLicenseByKeyHash(keyHash(cfg.pepper, verdict.normalized));
      if (!license) fail(403, 'invalid_key', 'Lizenzschluessel ist unbekannt.');
      if (license.status !== 'active') fail(403, 'revoked', 'Lizenz wurde gesperrt.');
      if (license.expiresAt && license.expiresAt <= clock()) {
        fail(403, 'expired', 'Lizenz ist abgelaufen.');
      }

      const deviceName = cleanText(input.deviceName, 190);
      const platform = cleanText(input.platform, 64);
      const appVersion = cleanText(input.appVersion, 64);
      const ipHash = ip ? hashIp(cfg.pepper, ip) : null;
      const now = clock();

      let activation = await store.findActivation(license.id, installId);
      let resumed = false;
      if (activation) {
        if (activation.revokedAt) {
          fail(403, 'revoked', 'Dieses Geraet wurde gesperrt. Bitte beim Support freigeben lassen.');
        }
        activation = await store.updateActivation(activation.id, {
          lastSeen: now,
          deviceName,
          platform,
          appVersion,
          ipHash,
        });
        resumed = true;
      } else {
        const active = await store.countActiveActivations(license.id);
        if (active >= license.seats) {
          await log({
            licenseId: license.id,
            event: 'seat_limit',
            detail: `Sitzlimit ${license.seats} erreicht (installId ${installId.slice(0, 32)})`,
          });
          fail(409, 'seat_limit', 'Alle Lizenzen sind belegt. Bitte ein Geraet freigeben.');
        }
        activation = await store.createActivation({
          licenseId: license.id,
          installId,
          deviceName,
          platform,
          appVersion,
          ipHash,
          firstSeen: now,
          lastSeen: now,
        });
      }

      await log({
        licenseId: license.id,
        activationId: activation.id,
        event: 'activated',
        detail: `${resumed ? 'erneut' : 'neu'}: ${deviceName ?? platform ?? installId.slice(0, 40)}`,
      });

      const issued = issueToken(license, activation);
      return {
        token: issued.token,
        expiresAt: iso(issued.expiresAt),
        // Key-Laufzeit (null = unbegrenzt); expiresAt bleibt der 7-Tage-Token.
        licenseExpiresAt: iso(license.expiresAt),
        plan: license.plan,
        features: featuresForPlan(license.plan),
      };
    },

    async heartbeat(token, { ip } = {}) {
      const verified = verifyToken(token, keys.publicKey);
      if (!verified.ok) fail(401, 'invalid_token', 'Token ist ungueltig.');
      const payload = verified.payload;

      if (!Number.isFinite(payload.exp) || payload.exp <= clock()) {
        fail(401, 'token_expired', 'Token ist abgelaufen. Bitte neu aktivieren.');
      }

      const license = await store.getLicense(payload.lic);
      if (!license) fail(403, 'revoked', 'Lizenz existiert nicht mehr.');
      if (license.status !== 'active') {
        await log({ licenseId: license.id, activationId: payload.inst, event: 'heartbeat_failed', detail: 'Lizenz gesperrt' });
        fail(403, 'revoked', 'Lizenz wurde gesperrt.');
      }
      if (license.expiresAt && license.expiresAt <= clock()) {
        await log({ licenseId: license.id, activationId: payload.inst, event: 'heartbeat_failed', detail: 'Lizenz abgelaufen' });
        fail(403, 'expired', 'Lizenz ist abgelaufen.');
      }

      const activation = await store.getActivation(payload.inst);
      if (!activation || activation.licenseId !== license.id || activation.revokedAt) {
        await log({ licenseId: license.id, activationId: payload.inst, event: 'heartbeat_failed', detail: 'Aktivierung fehlt' });
        fail(403, 'deactivated', 'Aktivierung ist nicht mehr vorhanden.');
      }

      const now = clock();
      const updated = await store.updateActivation(activation.id, {
        lastSeen: now,
        ipHash: ip ? hashIp(cfg.pepper, ip) : activation.ipHash,
      });

      const issued = issueToken(license, updated);
      return {
        token: issued.token,
        expiresAt: iso(issued.expiresAt),
        licenseExpiresAt: iso(license.expiresAt),
      };
    },

    async deactivate(token) {
      const verified = verifyToken(token, keys.publicKey);
      if (!verified.ok) fail(401, 'invalid_token', 'Token ist ungueltig.');
      const payload = verified.payload;

      const activation = await store.getActivation(payload.inst);
      if (!activation || activation.licenseId !== Number(payload.lic)) {
        // bereits freigegeben: idempotent ok
        return { ok: true };
      }
      await store.deleteActivation(activation.id);
      await log({
        licenseId: activation.licenseId,
        activationId: activation.id,
        event: 'deactivated',
        detail: `Geraet ${activation.deviceName ?? activation.installId.slice(0, 40)}`,
      });
      return { ok: true };
    },
  };

  return service;
}
