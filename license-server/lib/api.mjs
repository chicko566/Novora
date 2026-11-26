import { ApiError } from './errors.mjs';
import { HttpError, bearerToken, clientIp, readJson, sendJson } from './http.mjs';
import { VERSION } from './version.mjs';

const MINUTE = 60000;

function rateLimited(res, limit) {
  sendJson(
    res,
    429,
    {
      ok: false,
      error: 'rate_limited',
      message: `Zu viele Anfragen. Bitte in ${limit.retryAfter} Sekunden erneut versuchen.`,
      retryAfter: limit.retryAfter,
    },
    { 'Retry-After': String(limit.retryAfter) },
  );
}

function errorPayload(error) {
  if (error instanceof ApiError) {
    return { status: error.status, body: { ok: false, error: error.code, message: error.message } };
  }
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: { ok: false, error: 'invalid_request', message: error.message },
    };
  }
  return {
    status: 500,
    body: { ok: false, error: 'server_error', message: 'Interner Fehler. Bitte spaeter erneut versuchen.' },
  };
}

export function createApiHandler({ service, cfg, limiter, log = console }) {
  return async function handleApi(req, res, url) {
    const path = url.pathname.replace(/\/+$/, '');
    const ip = clientIp(req);

    try {
      if (req.method === 'GET' && path === '/api/license/health') {
        sendJson(res, 200, { ok: true, version: VERSION, time: new Date().toISOString() });
        return;
      }

      if (req.method === 'GET' && path === '/api/license/config') {
        sendJson(res, 200, {
          ok: true,
          minVersion: cfg.minVersion,
          tokenDays: cfg.tokenDays,
          heartbeatHours: cfg.heartbeatHours,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/license/activate') {
        const limit = limiter.hit(`activate:${ip}`, 10, MINUTE);
        if (!limit.ok) return rateLimited(res, limit);
        const body = await readJson(req);
        const result = await service.activate(body, { ip });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === 'POST' && path === '/api/license/heartbeat') {
        const limit = limiter.hit(`heartbeat:${ip}`, 120, MINUTE);
        if (!limit.ok) return rateLimited(res, limit);
        const token = bearerToken(req);
        if (!token) {
          sendJson(res, 401, { ok: false, error: 'invalid_token', message: 'Bearer-Token fehlt.' });
          return;
        }
        const result = await service.heartbeat(token, { ip });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === 'POST' && path === '/api/license/deactivate') {
        const limit = limiter.hit(`deactivate:${ip}`, 30, MINUTE);
        if (!limit.ok) return rateLimited(res, limit);
        const token = bearerToken(req);
        if (!token) {
          sendJson(res, 401, { ok: false, error: 'invalid_token', message: 'Bearer-Token fehlt.' });
          return;
        }
        await service.deactivate(token);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'not_found', message: 'Unbekannter Endpunkt.' });
    } catch (error) {
      const mapped = errorPayload(error);
      if (mapped.status >= 500) log.error('[api]', error);
      sendJson(res, mapped.status, mapped.body);
    }
  };
}
