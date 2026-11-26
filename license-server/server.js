import http from 'node:http';
import { loadConfig } from './lib/config.mjs';
import { ensureKeyPair } from './lib/tokens.mjs';
import { openStore } from './lib/db.mjs';
import { createLicenseService } from './lib/license.mjs';
import { createRateLimiter } from './lib/ratelimit.mjs';
import { createApiHandler } from './lib/api.mjs';
import { createAdminHandler } from './lib/adminRoutes.mjs';
import { redirect, sendJson } from './lib/http.mjs';
import { VERSION } from './lib/version.mjs';

let cfg;
try {
  cfg = loadConfig();
} catch (error) {
  console.error('[novora-license] Konfigurationsfehler:', error.message);
  process.exit(1);
}

const keys = ensureKeyPair(cfg.keysDir);
const { store, close } = await openStore(cfg);
const limiter = createRateLimiter();
const service = createLicenseService({ store, keys, cfg });
const handleApi = createApiHandler({ service, cfg, limiter });
const handleAdmin = createAdminHandler({ store, cfg, limiter, keys });

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_request', message: 'Ungueltige URL.' });
    return;
  }

  const isApi = url.pathname.startsWith('/api/license');

  try {
    if (isApi) {
      applyCors(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === '/') {
      redirect(res, '/admin');
      return;
    }

    await handleAdmin(req, res, url);
  } catch (error) {
    console.error('[http]', error);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 500, {
      ok: false,
      error: 'server_error',
      message: 'Interner Fehler. Bitte spaeter erneut versuchen.',
    });
  }
});

server.on('clientError', (error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(cfg.port, cfg.host, async () => {
  console.log(`[novora-license] ${VERSION} laeuft auf http://${cfg.host}:${cfg.port} (DB: ${cfg.db.driver})`);
  console.log(
    `[novora-license] Signaturschluessel ${keys.created ? 'neu erzeugt' : 'vorhanden'} (PKCS8: ${keys.privatePath})`,
  );
  try {
    const admins = await store.countAdminUsers();
    if (admins === 0) {
      console.log('[novora-license] Kein Admin vorhanden -> /admin/setup (benoetigt ADMIN_SETUP_TOKEN)');
    } else {
      console.log(`[novora-license] ${admins} Admin-Konto/Admin-Konten eingerichtet`);
    }
  } catch (error) {
    console.error('[novora-license] Admin-Zaehlung fehlgeschlagen:', error.message);
  }
  if (!cfg.adminSetupToken) {
    console.log('[novora-license] Hinweis: ADMIN_SETUP_TOKEN ist nicht gesetzt, Setup bleibt gesperrt.');
  }
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[novora-license] ${signal} empfangen, beende...`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  server.close(async () => {
    try {
      await close();
    } catch (error) {
      console.error('[novora-license] Fehler beim Schliessen des Stores:', error.message);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
