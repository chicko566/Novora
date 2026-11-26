import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJsonIfPresent(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`config.json ist kein gueltiges JSON: ${error.message}`);
  }
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === '1' || value === 'true' || value === 'yes';
}

function stripSlash(url) {
  return String(url ?? '').replace(/\/+$/, '');
}

function hostOf(url) {
  const text = String(url ?? '').trim();
  if (!text) return '';
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`).hostname;
  } catch {
    return '';
  }
}

function normalizeRpId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split('/')[0]
    .replace(/:\d+$/, '');
}

export function loadConfig(root = ROOT) {
  const file = readJsonIfPresent(path.join(root, 'config.json'));
  const env = process.env;
  const dbFile = file.db ?? {};
  const driver = String(env.DB_DRIVER ?? dbFile.driver ?? 'mysql').toLowerCase();

  const publicBaseUrl = env.PUBLIC_BASE_URL ?? file.publicBaseUrl ?? '';
  const port = num(env.PORT ?? file.port, 47850);
  const webauthnOrigin = stripSlash(
    env.WEBAUTHN_ORIGIN ?? file.webauthnOrigin ?? publicBaseUrl ?? `http://localhost:${port}`,
  ) || `http://localhost:${port}`;
  const webauthnRpID =
    normalizeRpId(env.WEBAUTHN_RP_ID ?? file.webauthnRpID) || hostOf(webauthnOrigin) || 'localhost';

  const cfg = {
    root,
    keysDir: path.join(root, 'keys'),
    migrationsDir: path.join(root, 'migrations'),
    port,
    host: env.HOST ?? file.host ?? '0.0.0.0',
    publicBaseUrl,
    // Sichere Cookies sind der Standard; nur lokale Testlaeufe ueber HTTP
    // setzen SECURE_COOKIES=0.
    secureCookies: bool(env.SECURE_COOKIES ?? file.secureCookies, true),
    pepper: env.LICENSE_KEY_PEPPER ?? file.licenseKeyPepper ?? '',
    adminSetupToken: env.ADMIN_SETUP_TOKEN ?? file.adminSetupToken ?? '',
    adminLoginToken: env.ADMIN_LOGIN_TOKEN ?? file.adminLoginToken ?? '',
    webauthnRpID,
    webauthnOrigin,
    webauthnRpName: env.WEBAUTHN_RP_NAME ?? file.webauthnRpName ?? 'Novora Lizenz',
    minVersion: env.MIN_VERSION ?? file.minVersion ?? '0.1.4',
    tokenDays: num(env.TOKEN_DAYS ?? file.tokenDays, 7),
    heartbeatHours: num(env.HEARTBEAT_HOURS ?? file.heartbeatHours, 6),
    adminSessionHours: num(env.ADMIN_SESSION_HOURS ?? file.adminSessionHours, 12),
    db: {
      driver,
      host: env.DB_HOST ?? dbFile.host ?? '127.0.0.1',
      port: num(env.DB_PORT ?? dbFile.port, 3306),
      user: env.DB_USER ?? dbFile.user ?? '',
      password: env.DB_PASSWORD ?? dbFile.password ?? '',
      name: env.DB_NAME ?? dbFile.name ?? '',
    },
  };

  if (!['mysql', 'memory'].includes(cfg.db.driver)) {
    throw new Error(`DB_DRIVER muss "mysql" oder "memory" sein, erhalten: ${cfg.db.driver}`);
  }
  if (!cfg.pepper) {
    throw new Error('LICENSE_KEY_PEPPER fehlt (config.json oder Umgebungsvariable).');
  }
  if (cfg.pepper.length < 4) {
    throw new Error('LICENSE_KEY_PEPPER muss mindestens 4 Zeichen lang sein (32+ empfohlen).');
  }
  return cfg;
}
