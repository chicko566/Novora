import {
  generateTotpSecret,
  hashPassword,
  hashToken,
  isEmail,
  newCsrfToken,
  newSessionToken,
  normalizeEmail,
  otpauthUrl,
  safeEqualText,
  verifyPassword,
  verifyTotp,
} from './admin.mjs';
import { readFile } from 'node:fs/promises';
import nodePath from 'node:path';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import {
  clearCookie,
  clientIp,
  parseCookies,
  readForm,
  readJson,
  redirect,
  sendHtml,
  sendJson,
  sendText,
  serializeCookie,
} from './http.mjs';
import { authPage, esc, noticeFromQuery, page } from './html.mjs';
import { generateKey, keyHash, keyLabel, keyMeta } from './keys.mjs';
import { PLANS, defaultSeatsForPlan, planLabel } from './plans.mjs';
import { daysFrom, parseDayUtc } from './time.mjs';
import { loginPage, setupPage } from '../admin/login.mjs';
import { dashboardPage } from '../admin/dashboard.mjs';
import { keysCreatedPage, keysNewPage, keysPage } from '../admin/keys.mjs';
import { keyDetailPage } from '../admin/keyDetail.mjs';
import { auditPage, securityPage } from '../admin/audit.mjs';

const DAY = 86400000;
const SESSION_COOKIE = 'nv_admin';
const PRE_CSRF_COOKIE = 'nv_csrf';
const PK_COOKIE = 'nv_pk';
const PK_FLOW_MS = 300000;
const ASSET_DIR = 'admin';

const ASSET_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};

function transportList(value) {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const out = list.map((item) => String(item).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = hashPassword('novora-timing-equalizer');
  return dummyHash;
}

function intField(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function forbidden(res, { user = null, csrf = '', text = 'CSRF-Token ist ungueltig.' }) {
  const body = `<h1>Abgelehnt</h1><div class="notice err">${esc(text)}</div>
    <div class="actions"><a class="btn" href="/admin/dashboard">Zurueck</a></div>`;
  sendHtml(res, 403, page({ title: 'Abgelehnt', user, csrf, body }));
}

export function createAdminHandler({ store, cfg, limiter, keys, now = () => Date.now() }) {
  let lastCleanup = 0;
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const pkFlows = new Map();
  const expectedOrigin = String(cfg.webauthnOrigin ?? '').trim().replace(/\/+$/, '');

  function cleanupPkFlows() {
    const current = now();
    for (const [id, flow] of pkFlows) {
      if (flow.expires <= current) pkFlows.delete(id);
    }
    if (pkFlows.size > 400) {
      const keep = [...pkFlows.entries()].slice(-200);
      pkFlows.clear();
      for (const [id, flow] of keep) pkFlows.set(id, flow);
    }
  }

  function startPkFlow(req, res, data) {
    cleanupPkFlows();
    const id = newCsrfToken();
    pkFlows.set(id, { ...data, expires: now() + PK_FLOW_MS });
    addCookie(
      res,
      serializeCookie(PK_COOKIE, id, {
        httpOnly: true,
        secure: secureCookie(req),
        sameSite: 'Lax',
        maxAge: Math.floor(PK_FLOW_MS / 1000),
      }),
    );
    return id;
  }

  function takePkFlow(req, type) {
    cleanupPkFlows();
    const id = parseCookies(req)[PK_COOKIE];
    if (!id) return null;
    const flow = pkFlows.get(id);
    pkFlows.delete(id);
    if (!flow || flow.type !== type || flow.expires <= now()) return null;
    return flow;
  }

  async function jsonBody(req) {
    const type = String(req.headers['content-type'] ?? '').toLowerCase();
    if (!type.startsWith('application/json')) {
      return { error: 'Content-Type muss application/json sein.' };
    }
    try {
      return { body: await readJson(req) };
    } catch (error) {
      return { error: error?.status === 413 ? 'Anfrage ist zu gross.' : 'JSON ist ungueltig.' };
    }
  }

  // Login/Registrierung sind zustandsaendernd und ohne CSRF-Token erreichbar;
  // deshalb muss der Origin-Header exakt zur konfigurierten WebAuthn-Origin passen.
  function originOk(req) {
    const origin = String(req.headers.origin ?? '').trim();
    if (!origin || !expectedOrigin) return false;
    return origin.replace(/\/+$/, '').toLowerCase() === expectedOrigin.toLowerCase();
  }

  async function serveAsset(res, rootDir, relative) {
    let cleaned;
    try {
      cleaned = decodeURIComponent(String(relative ?? '')).replace(/\\/g, '/');
    } catch {
      return sendText(res, 404, 'Nicht gefunden.');
    }
    if (!cleaned || cleaned.includes('..') || cleaned.includes('\0') || cleaned.startsWith('/')) {
      return sendText(res, 404, 'Nicht gefunden.');
    }
    const base = nodePath.resolve(rootDir);
    const file = nodePath.resolve(base, cleaned);
    if (!file.startsWith(base + nodePath.sep)) return sendText(res, 404, 'Nicht gefunden.');
    const contentType = ASSET_TYPES[nodePath.extname(file).toLowerCase()];
    if (!contentType) return sendText(res, 404, 'Nicht gefunden.');
    let data;
    try {
      data = await readFile(file, 'utf8');
    } catch {
      return sendText(res, 404, 'Nicht gefunden.');
    }
    return sendText(res, 200, data, { 'Content-Type': contentType });
  }

  function secureCookie(req) {
    return (
      cfg.secureCookies ||
      Boolean(req.socket?.encrypted) ||
      String(req.headers['x-forwarded-proto'] ?? '').toLowerCase() === 'https'
    );
  }

  function addCookie(res, cookie) {
    const previous = res.getHeader('Set-Cookie');
    const list = previous ? (Array.isArray(previous) ? previous : [previous]) : [];
    list.push(cookie);
    res.setHeader('Set-Cookie', list);
  }

  async function sessionFor(req) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await store.findSession(hashToken(token));
    if (!session) return null;
    if (session.expiresAt <= now()) {
      await store.deleteSession(session.tokenHash);
      return null;
    }
    const user = await store.getAdminUser(session.userId);
    if (!user) return null;
    return { session, user, token };
  }

  async function maybeCleanup() {
    const current = now();
    if (current - lastCleanup < 600000) return;
    lastCleanup = current;
    try {
      await store.deleteExpiredSessions(current);
    } catch {
      // nicht kritisch
    }
  }

  async function requireSession(req, res) {
    const ctx = await sessionFor(req);
    if (!ctx) {
      redirect(res, '/admin/login');
      return null;
    }
    await maybeCleanup();
    return ctx;
  }

  function csrfOk(ctx, form) {
    return safeEqualText(ctx.session.csrf, form._csrf ?? '');
  }

  function preCsrf(req, res) {
    const cookies = parseCookies(req);
    let token = cookies[PRE_CSRF_COOKIE];
    if (!token || !/^[a-f0-9]{32}$/.test(token)) {
      token = newCsrfToken();
      addCookie(
        res,
        serializeCookie(PRE_CSRF_COOKIE, token, {
          httpOnly: true,
          secure: secureCookie(req),
          sameSite: 'Strict',
          maxAge: 3600,
        }),
      );
    }
    return token;
  }

  function preCsrfOk(req, form) {
    const cookies = parseCookies(req);
    return Boolean(cookies[PRE_CSRF_COOKIE]) && safeEqualText(cookies[PRE_CSRF_COOKIE], form._csrf ?? '');
  }

  async function startSession(req, res, user, detail = '') {
    const token = newSessionToken();
    const csrf = newCsrfToken();
    const maxAgeMs = cfg.adminSessionHours * 3600000;
    const expiresAt = now() + maxAgeMs;
    await store.createSession({ userId: user.id, tokenHash: hashToken(token), csrf, expiresAt, createdAt: now() });
    addCookie(
      res,
      serializeCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: secureCookie(req),
        sameSite: 'Strict',
        maxAge: Math.floor(maxAgeMs / 1000),
      }),
    );
    await store.logEvent({
      licenseId: null,
      event: 'admin_login',
      detail: `${user.email}${detail ? ' ' + detail : ''}`,
    });
    return { csrf };
  }

  async function logout(req, res, ctx) {
    await store.deleteSession(ctx.session.tokenHash);
    addCookie(res, clearCookie(SESSION_COOKIE));
    redirect(res, '/admin/login?ok=Abgemeldet.');
  }

  async function renderKeysNew(res, ctx, notice) {
    sendHtml(res, notice?.kind === 'err' ? 400 : 200, keysNewPage({ user: ctx.user, csrf: ctx.session.csrf, notice }));
  }

  async function createKeys(ctx, form) {
    const mode = form.mode === 'csv' ? 'csv' : 'single';
    const created = [];

    const make = async ({ plan, seats, days, note, customerEmail }) => {
      const generated = generateKey(cfg.pepper);
      const meta = keyMeta(generated.normalized);
      const expiresAt = days > 0 ? daysFrom(now(), days) : null;
      const license = await store.createLicense({
        keyHash: keyHash(cfg.pepper, generated.normalized),
        keyPrefix: meta.keyPrefix,
        keyLast4: meta.keyLast4,
        plan,
        seats,
        expiresAt,
        note,
        customerEmail,
        createdAt: now(),
      });
      await store.logEvent({
        licenseId: license.id,
        event: 'key_created',
        detail: `${plan}, ${seats} Platz/Plaetze${note ? ', ' + note : ''}`,
      });
      created.push({ id: license.id, formatted: generated.formatted, plan, seats, expiresAt });
    };

    if (mode === 'single') {
      const plan = PLANS[form.plan] ? form.plan : 'standard';
      const seats = intField(form.seats, 1, 100, defaultSeatsForPlan(plan));
      const days = intField(form.days, 0, 3650, 365);
      const count = intField(form.count, 1, 100, 1);
      const note = String(form.note ?? '').trim().slice(0, 255) || null;
      const customerEmail = String(form.customer_email ?? '').trim().slice(0, 190) || null;
      for (let i = 0; i < count; i += 1) {
        await make({ plan, seats, days, note, customerEmail });
      }
      return created;
    }

    const lines = String(form.csv ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    if (!lines.length) throw new Error('CSV ist leer.');
    if (lines.length > 200) throw new Error('Maximal 200 Zeilen pro CSV-Import.');

    for (const [index, line] of lines.entries()) {
      const parts = line.split(/[;,]/).map((part) => part.trim());
      const plan = parts[0] || 'standard';
      if (!PLANS[plan]) throw new Error(`Zeile ${index + 1}: unbekannter Plan "${plan}" (erlaubt: ${Object.keys(PLANS).join(', ')}).`);
      const seats = parts[1] ? intField(parts[1], 1, 100, defaultSeatsForPlan(plan)) : defaultSeatsForPlan(plan);
      const days = parts[2] ? intField(parts[2], 0, 3650, 365) : 365;
      const note = (parts[3] || '').slice(0, 255) || null;
      const customerEmail = (parts[4] || '').slice(0, 190) || null;
      await make({ plan, seats, days, note, customerEmail });
    }
    return created;
  }

  return async function handleAdmin(req, res, url) {
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method;
    const ip = clientIp(req);

    if (path === '/admin' || path === '') {
      redirect(res, '/admin/dashboard');
      return;
    }

    // ---------- Login ----------
    if (path === '/admin/login') {
      if (method === 'GET') {
        const ctx = await sessionFor(req);
        if (ctx) return redirect(res, '/admin/dashboard');
        if ((await store.countAdminUsers()) === 0) return redirect(res, '/admin/setup');
        return sendHtml(res, 200, loginPage({ csrf: preCsrf(req, res), notice: noticeFromQuery(url) }));
      }
      if (method === 'POST') {
        const limit = limiter.hit(`login:${ip}`, 8, 5 * 60000);
        if (!limit.ok) {
          return sendHtml(
            res,
            429,
            loginPage({
              csrf: preCsrf(req, res),
              notice: { kind: 'err', text: `Zu viele Anmeldeversuche. In ${limit.retryAfter}s erneut.` },
            }),
            { 'Retry-After': String(limit.retryAfter) },
          );
        }
        const form = await readForm(req);
        if (!preCsrfOk(req, form)) return forbidden(res, { text: 'Formular abgelaufen. Bitte neu laden.' });

        // Passwordless recovery login for the owner: a long random token from
        // config.json. It selects the first admin account and never replaces
        // the normal password/passkey flow.
        if (String(form.mode ?? '') === 'token') {
          if (!cfg.adminLoginToken) {
            return sendHtml(
              res,
              503,
              loginPage({
                csrf: preCsrf(req, res),
                notice: { kind: 'err', text: 'Token-Login ist auf dem Server nicht konfiguriert.' },
              }),
            );
          }
          if (!safeEqualText(cfg.adminLoginToken, form.token ?? '')) {
            await store.logEvent({ licenseId: null, event: 'admin_login_failed', detail: `token von ${ip}` });
            return sendHtml(
              res,
              401,
              loginPage({ csrf: preCsrf(req, res), notice: { kind: 'err', text: 'Admin-Token ist falsch.' } }),
            );
          }
          const users = await store.listAdminUsers(1);
          const owner = users[0];
          if (!owner) return redirect(res, '/admin/setup');
          await startSession(req, res, owner, '(token)');
          return redirect(res, '/admin/dashboard?ok=' + encodeURIComponent(`Angemeldet als ${owner.email}.`));
        }

        const email = normalizeEmail(form.email);
        const user = email ? await store.findAdminByEmail(email) : null;
        const passwordOk = verifyPassword(form.password ?? '', user?.passwordHash ?? getDummyHash());
        const totpOk = user?.totpSecret ? verifyTotp(user.totpSecret, form.totp) : true;

        if (!user || !passwordOk || !totpOk) {
          await store.logEvent({
            licenseId: null,
            event: 'admin_login_failed',
            detail: `${email || '(leer)'} von ${ip}${user?.totpSecret && !totpOk ? ' (2FA)' : ''}`,
          });
          return sendHtml(
            res,
            401,
            loginPage({
              email,
              csrf: preCsrf(req, res),
              notice: { kind: 'err', text: 'E-Mail, Passwort oder 2FA-Code ist falsch.' },
            }),
          );
        }

        await startSession(req, res, user);
        return redirect(res, '/admin/dashboard?ok=' + encodeURIComponent(`Angemeldet als ${user.email}.`));
      }
    }

    // ---------- Setup ----------
    if (path === '/admin/setup') {
      if ((await store.countAdminUsers()) > 0) return redirect(res, '/admin/login');

      if (!cfg.adminSetupToken) {
        return sendHtml(
          res,
          503,
          authPage({
            title: 'Einrichtung gesperrt',
            body: `<h1>Einrichtung gesperrt</h1>
              <p class="lead">ADMIN_SETUP_TOKEN ist auf dem Server nicht gesetzt. Bitte in config.json
              oder als Umgebungsvariable eintragen und den Dienst neu starten.</p>`,
          }),
        );
      }

      if (method === 'GET') {
        return sendHtml(res, 200, setupPage({ csrf: preCsrf(req, res) }));
      }
      if (method === 'POST') {
        const form = await readForm(req);
        if (!preCsrfOk(req, form)) return forbidden(res, { text: 'Formular abgelaufen. Bitte neu laden.' });
        if (!safeEqualText(cfg.adminSetupToken, form.token ?? '')) {
          return sendHtml(
            res,
            403,
            setupPage({ email: form.email, csrf: preCsrf(req, res), notice: { kind: 'err', text: 'Setup-Token ist falsch.' } }),
          );
        }
        const email = normalizeEmail(form.email);
        if (!isEmail(email)) {
          return sendHtml(
            res,
            400,
            setupPage({ email: form.email, csrf: preCsrf(req, res), notice: { kind: 'err', text: 'E-Mail ist ungueltig.' } }),
          );
        }
        if (String(form.password ?? '').length < 6) {
          return sendHtml(
            res,
            400,
            setupPage({ email, csrf: preCsrf(req, res), notice: { kind: 'err', text: 'Passwort braucht mindestens 6 Zeichen.' } }),
          );
        }
        if (form.password !== form.password2) {
          return sendHtml(
            res,
            400,
            setupPage({ email, csrf: preCsrf(req, res), notice: { kind: 'err', text: 'Passwoerter stimmen nicht ueberein.' } }),
          );
        }
        const user = await store.createAdminUser({
          email,
          passwordHash: hashPassword(form.password),
          role: 'owner',
          createdAt: now(),
        });
        await startSession(req, res, user, '(setup)');
        return redirect(res, '/admin/dashboard?ok=' + encodeURIComponent('Admin angelegt.'));
      }
    }

    // ---------- Passkey: statische Module (public) ----------
    const adminRoot = nodePath.join(cfg.root, 'admin');
    if (method === 'GET' && path === '/admin/assets/passkey-browser.js') {
      return serveAsset(res, adminRoot, 'passkey-browser.js');
    }
    if (method === 'GET' && path === '/admin/assets/passkey-login.js') {
      return serveAsset(res, adminRoot, 'passkey-login.js');
    }
    if (method === 'GET' && path === '/admin/assets/passkey-manage.js') {
      return serveAsset(res, adminRoot, 'passkey-manage.js');
    }
    if (method === 'GET' && path === '/admin/assets/keys-manage.js') {
      return serveAsset(res, adminRoot, 'keys-manage.js');
    }
    if (method === 'GET' && path.startsWith('/admin/assets/passkey/')) {
      return serveAsset(res, nodePath.join(adminRoot, 'passkey'), path.slice('/admin/assets/passkey/'.length));
    }

    // ---------- Passkey: Anmeldung (public) ----------
    if (path === '/admin/passkey/login/options') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      const limit = limiter.hit(`pkopt:${ip}`, 20, 60000);
      if (!limit.ok) return sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
      const options = await generateAuthenticationOptions({
        rpID: cfg.webauthnRpID,
        allowCredentials: [],
        userVerification: 'required',
      });
      startPkFlow(req, res, { type: 'login', challenge: options.challenge });
      return sendJson(res, 200, options);
    }

    if (path === '/admin/passkey/login/verify') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      const limit = limiter.hit(`pkverify:${ip}`, 30, 60000);
      if (!limit.ok) return sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
      if (!originOk(req)) return sendJson(res, 403, { ok: false, error: 'origin' });
      const parsed = await jsonBody(req);
      if (parsed.error) return sendJson(res, 400, { ok: false, error: 'invalid_request', message: parsed.error });
      const flow = takePkFlow(req, 'login');
      if (!flow) return sendJson(res, 400, { ok: false, error: 'challenge_expired', message: 'Passkey-Sitzung ist abgelaufen.' });
      const response = parsed.body?.response ?? parsed.body;
      if (!response || typeof response.id !== 'string') {
        return sendJson(res, 400, { ok: false, error: 'invalid_request', message: 'Passkey-Antwort fehlt.' });
      }
      // Eine einheitliche Antwort fuer unbekannte Credential-IDs, fehlgeschlagene
      // Verifikation und fehlende Nutzer - sonst laesst sich per Fehlercode
      // ausprobieren, welche Passkeys registriert sind.
      const authFailed = () => sendJson(res, 401, { ok: false, error: 'passkey_failed' });
      const passkey = await store.findPasskeyByCredentialId(response.id);
      if (!passkey) return authFailed();
      let verified;
      try {
        verified = await verifyAuthenticationResponse({
          response,
          expectedChallenge: flow.challenge,
          expectedOrigin: cfg.webauthnOrigin,
          expectedRPID: cfg.webauthnRpID,
          credential: {
            id: passkey.credentialId,
            publicKey: Buffer.from(String(passkey.publicKey), 'base64url'),
            counter: Number(passkey.counter ?? 0),
            transports: transportList(passkey.transports),
          },
          requireUserVerification: true,
        });
      } catch {
        return authFailed();
      }
      if (!verified?.verified) return authFailed();
      const user = await store.getAdminUser(passkey.userId);
      if (!user) return authFailed();
      await store.updatePasskeyCounter(passkey.id, verified.authenticationInfo.newCounter, now());
      await startSession(req, res, user, '(passkey)');
      return sendJson(res, 200, { ok: true });
    }

    // ---------- alles Weitere braucht eine Sitzung ----------
    const ctx = await requireSession(req, res);
    if (!ctx) return;

    if (path === '/admin/logout' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      return logout(req, res, ctx);
    }

    // ---------- Passkey: Registrierung/Verwaltung (Session) ----------
    if (path === '/admin/passkey/register/options') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      const parsed = await jsonBody(req);
      if (parsed.error) return sendJson(res, 400, { ok: false, error: 'invalid_request', message: parsed.error });
      if (!safeEqualText(ctx.session.csrf, parsed.body?._csrf ?? req.headers['x-csrf'] ?? '')) {
        return sendJson(res, 403, { ok: false, error: 'csrf' });
      }
      const existing = await store.listPasskeysByUser(ctx.user.id);
      const options = await generateRegistrationOptions({
        rpName: cfg.webauthnRpName,
        rpID: cfg.webauthnRpID,
        userID: new TextEncoder().encode(`novora-admin-${ctx.user.id}`),
        userName: ctx.user.email,
        userDisplayName: ctx.user.email,
        excludeCredentials: existing.map((item) => ({
          id: item.credentialId,
          transports: transportList(item.transports),
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        attestationType: 'none',
      });
      startPkFlow(req, res, { type: 'register', challenge: options.challenge, userId: ctx.user.id });
      return sendJson(res, 200, options);
    }

    if (path === '/admin/passkey/register/verify') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      if (!originOk(req)) return sendJson(res, 403, { ok: false, error: 'origin' });
      const parsed = await jsonBody(req);
      if (parsed.error) return sendJson(res, 400, { ok: false, error: 'invalid_request', message: parsed.error });
      if (!safeEqualText(ctx.session.csrf, parsed.body?._csrf ?? req.headers['x-csrf'] ?? '')) {
        return sendJson(res, 403, { ok: false, error: 'csrf' });
      }
      const flow = takePkFlow(req, 'register');
      if (!flow || Number(flow.userId) !== Number(ctx.user.id)) {
        return sendJson(res, 400, { ok: false, error: 'challenge_expired' });
      }
      const response = parsed.body?.response ?? parsed.body;
      let verified;
      try {
        verified = await verifyRegistrationResponse({
          response,
          expectedChallenge: flow.challenge,
          expectedOrigin: cfg.webauthnOrigin,
          expectedRPID: cfg.webauthnRpID,
          requireUserVerification: true,
        });
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: 'passkey_failed', message: String(error?.message ?? error) });
      }
      const credential = verified?.registrationInfo?.credential;
      if (!verified?.verified || !credential) {
        return sendJson(res, 400, { ok: false, error: 'passkey_failed' });
      }
      const publicKey = typeof credential.publicKey === 'string'
        ? credential.publicKey
        : Buffer.from(credential.publicKey).toString('base64url');
      const transports = Array.isArray(credential.transports)
        ? credential.transports.join(',')
        : credential.transports ?? null;
      await store.createPasskey({
        userId: ctx.user.id,
        credentialId: credential.id,
        publicKey,
        counter: Number(credential.counter ?? 0),
        transports,
        createdAt: now(),
      });
      await store.logEvent({ licenseId: null, event: 'passkey_added', detail: ctx.user.email });
      return sendJson(res, 200, { ok: true });
    }

    if (path === '/admin/passkey/delete') {
      if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      const parsed = await jsonBody(req);
      if (parsed.error) return sendJson(res, 400, { ok: false, error: 'invalid_request', message: parsed.error });
      if (!safeEqualText(ctx.session.csrf, parsed.body?._csrf ?? req.headers['x-csrf'] ?? '')) {
        return sendJson(res, 403, { ok: false, error: 'csrf' });
      }
      const id = Number(parsed.body?.id);
      if (!Number.isFinite(id) || id <= 0) return sendJson(res, 400, { ok: false, error: 'invalid_id' });
      const removed = await store.deletePasskey(id, ctx.user.id);
      if (removed) await store.logEvent({ licenseId: null, event: 'passkey_removed', detail: ctx.user.email });
      return sendJson(res, 200, { ok: true, removed });
    }

    if (path === '/admin/dashboard' && method === 'GET') {
      const [stats, recentEvents, licensePage] = await Promise.all([
        store.stats(now()),
        store.listEvents({ limit: 8 }),
        store.listLicenses({ limit: 200, offset: 0 }),
      ]);
      const soon = now() + 30 * DAY;
      const expiring = licensePage.items
        .filter((lic) => lic.status === 'active' && lic.expiresAt && lic.expiresAt > now() && lic.expiresAt <= soon)
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .slice(0, 10);
      return sendHtml(
        res,
        200,
        dashboardPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          stats,
          recentEvents,
          expiring,
          notice: noticeFromQuery(url),
        }),
      );
    }

    if (path === '/admin/security' && method === 'GET') {
      const passkeys = await store.listPasskeysByUser(ctx.user.id);
      return sendHtml(
        res,
        200,
        securityPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          passkeys,
          scripts: ['/admin/assets/passkey-manage.js'],
          notice: noticeFromQuery(url),
        }),
      );
    }

    if (path === '/admin/keys' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const pageNo = intField(url.searchParams.get('page'), 1, 100000, 1);
      const pageSize = 25;
      const result = await store.listLicenses({ q, limit: pageSize, offset: (pageNo - 1) * pageSize });
      return sendHtml(
        res,
        200,
        keysPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          items: result.items,
          total: result.total,
          q,
          pageNo,
          pageSize,
          notice: noticeFromQuery(url),
        }),
      );
    }

    if (path === '/admin/keys/new' && method === 'GET') {
      return renderKeysNew(res, ctx, noticeFromQuery(url));
    }

    if (path === '/admin/keys/new' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      let created;
      try {
        created = await createKeys(ctx, form);
      } catch (error) {
        return renderKeysNew(res, ctx, { kind: 'err', text: error.message });
      }
      if (!created.length) return renderKeysNew(res, ctx, { kind: 'err', text: 'Keine Schluessel erzeugt.' });
      return sendHtml(
        res,
        200,
        keysCreatedPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          created,
          notice: { kind: 'ok', text: `${created.length} Schluessel angelegt.` },
        }),
      );
    }

    if (path === '/admin/export.csv' && method === 'GET') {
      const { items } = await store.listLicenses({ limit: 5000, offset: 0 });
      const header = [
        'id',
        'schluessel',
        'plan',
        'sitze',
        'status',
        'gueltig_bis',
        'notiz',
        'kunde',
        'aktivierungen',
        'angelegt',
      ];
      const lines = [header.join(';')];
      for (const lic of items) {
        lines.push(
          [
            lic.id,
            keyLabel(lic.keyPrefix, lic.keyLast4),
            planLabel(lic.plan),
            lic.seats,
            lic.status,
            lic.expiresAt ? new Date(lic.expiresAt).toISOString().slice(0, 10) : '',
            licenceNote(lic.note),
            lic.customerEmail ?? '',
            lic.activeSeats ?? 0,
            new Date(lic.createdAt).toISOString().slice(0, 10),
          ]
            .map(csvCell)
            .join(';'),
        );
      }
      return sendText(res, 200, lines.join('\r\n') + '\r\n', {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="novora-lizenzen-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
    }

    if (path === '/admin/public-key.pem' && method === 'GET') {
      return sendText(res, 200, publicKeyPem, {
        'Content-Type': 'application/x-pem-file',
        'Content-Disposition': 'attachment; filename="license.pub.pem"',
      });
    }

    // Mehrere Schluessel auf einmal endgueltig loeschen.
    if (path === '/admin/keys/delete-bulk' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const raw = form.id ?? form.ids ?? [];
      const list = Array.isArray(raw) ? raw : String(raw).split(',');
      const ids = [...new Set(list.map((v) => Number.parseInt(String(v).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0))];
      if (!ids.length) {
        return redirect(res, '/admin/keys?err=' + encodeURIComponent('Keine Schlüssel ausgewählt.'));
      }
      let deleted = 0;
      const labels = [];
      for (const id of ids) {
        const license = await store.getLicense(id);
        if (!license) continue;
        labels.push(keyLabel(license.keyPrefix, license.keyLast4));
        const ok = await store.deleteLicense(id);
        if (ok) deleted += 1;
      }
      if (deleted > 0) {
        await store.logEvent({
          licenseId: null,
          event: 'key_deleted',
          detail: `${deleted} Schlüssel gelöscht (${labels.slice(0, 5).join(', ')}${labels.length > 5 ? ' …' : ''}) von ${ctx.user.email}`,
        });
      }
      return redirect(res, '/admin/keys?ok=' + encodeURIComponent(`${deleted} Schlüssel gelöscht.`));
    }

    // Schluessel endgueltig loeschen (Aktivierungen und Audit gehen mit).
    const deleteKey = /^\/admin\/keys\/(\d+)\/delete$/.exec(path);
    if (deleteKey && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const id = Number(deleteKey[1]);
      const license = await store.getLicense(id);
      if (!license) return redirect(res, '/admin/keys?err=' + encodeURIComponent('Schluessel nicht gefunden.'));
      const label = keyLabel(license.keyPrefix, license.keyLast4);
      await store.deleteLicense(id);
      await store.logEvent({ licenseId: null, event: 'key_deleted', detail: `${label} von ${ctx.user.email}` });
      return redirect(res, '/admin/keys?ok=' + encodeURIComponent('Schluessel geloescht.'));
    }

    if (path === '/admin/audit' && method === 'GET') {
      const licenseParam = url.searchParams.get('license') ?? '';
      const licenseId = /^\d+$/.test(licenseParam) ? Number(licenseParam) : undefined;
      const events = await store.listEvents({ licenseId, limit: 200 });
      return sendHtml(
        res,
        200,
        auditPage({ user: ctx.user, csrf: ctx.session.csrf, events, licenseId: licenseParam, notice: noticeFromQuery(url) }),
      );
    }

    // ---------- TOTP ----------
    if (path === '/admin/totp/enable' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const secret = generateTotpSecret();
      return sendHtml(
        res,
        200,
        securityPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          pendingSecret: secret,
          otpauth: otpauthUrl({ secret, email: ctx.user.email }),
          notice: { kind: 'info', text: 'Secret jetzt in der App speichern und Code bestaetigen.' },
        }),
      );
    }

    if (path === '/admin/totp/confirm' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const secret = String(form.secret ?? '').toUpperCase();
      if (!/^[A-Z2-7]{16,64}$/.test(secret)) return forbidden(res, { ...ctx, text: 'Secret ist ungueltig.' });
      if (!verifyTotp(secret, form.code)) {
        return sendHtml(
          res,
          400,
          securityPage({
            user: ctx.user,
            csrf: ctx.session.csrf,
            pendingSecret: secret,
            otpauth: otpauthUrl({ secret, email: ctx.user.email }),
            notice: { kind: 'err', text: 'Code ist falsch. Uhrzeit pruefen und erneut versuchen.' },
          }),
        );
      }
      await store.updateAdminUser(ctx.user.id, { totpSecret: secret });
      await store.logEvent({ licenseId: null, event: 'totp_enabled', detail: ctx.user.email });
      return redirect(res, '/admin/dashboard?ok=' + encodeURIComponent('2FA ist aktiv.'));
    }

    if (path === '/admin/totp/disable' && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      if (!verifyPassword(form.password ?? '', ctx.user.passwordHash)) {
        return sendHtml(
          res,
          400,
          securityPage({
            user: ctx.user,
            csrf: ctx.session.csrf,
            notice: { kind: 'err', text: 'Passwort ist falsch.' },
          }),
        );
      }
      await store.updateAdminUser(ctx.user.id, { totpSecret: null });
      await store.logEvent({ licenseId: null, event: 'totp_disabled', detail: ctx.user.email });
      return redirect(res, '/admin/dashboard?ok=' + encodeURIComponent('2FA ist abgeschaltet.'));
    }

    // ---------- Schluessel-Detail ----------
    const activationReset = /^\/admin\/keys\/(\d+)\/activations\/(\d+)\/reset$/.exec(path);
    if (activationReset && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const licenseId = Number(activationReset[1]);
      const activationId = Number(activationReset[2]);
      const activation = await store.getActivation(activationId);
      if (!activation || activation.licenseId !== licenseId) {
        return redirect(res, `/admin/keys/${licenseId}?err=` + encodeURIComponent('Aktivierung nicht gefunden.'));
      }
      await store.deleteActivation(activationId);
      await store.logEvent({
        licenseId,
        activationId,
        event: 'seat_reset',
        detail: `Geraet ${activation.deviceName ?? activation.installId.slice(0, 40)} freigegeben`,
      });
      return redirect(res, `/admin/keys/${licenseId}?ok=` + encodeURIComponent('Geraet freigegeben.'));
    }

    const keyAction = /^\/admin\/keys\/(\d+)\/(update|extend|revoke|restore|reset)$/.exec(path);
    if (keyAction && method === 'POST') {
      const form = await readForm(req);
      if (!csrfOk(ctx, form)) return forbidden(res, ctx);
      const id = Number(keyAction[1]);
      const action = keyAction[2];
      const license = await store.getLicense(id);
      if (!license) return redirect(res, '/admin/keys?err=' + encodeURIComponent('Lizenz nicht gefunden.'));

      if (action === 'update') {
        const plan = PLANS[form.plan] ? form.plan : license.plan;
        const seats = intField(form.seats, 1, 100, license.seats);
        const note = String(form.note ?? '').trim().slice(0, 255) || null;
        const customerEmail = String(form.customer_email ?? '').trim().slice(0, 190) || null;
        await store.updateLicense(id, { plan, seats, note, customerEmail });
        await store.logEvent({
          licenseId: id,
          event: 'updated',
          detail: `${plan}, ${seats} Platz/Plaetze${note ? ', ' + note : ''}`,
        });
        return redirect(res, `/admin/keys/${id}?ok=` + encodeURIComponent('Gespeichert.'));
      }

      if (action === 'extend') {
        const until = parseDayUtc(form.until);
        let expiresAt;
        let detail;
        if (Number.isFinite(until) && until) {
          expiresAt = until;
          detail = `bis ${new Date(until).toISOString().slice(0, 10)}`;
        } else {
          const days = intField(form.days, 1, 3650, 365);
          expiresAt = daysFrom(Math.max(now(), license.expiresAt ?? now()), days);
          detail = `+${days} Tage (bis ${new Date(expiresAt).toISOString().slice(0, 10)})`;
        }
        await store.updateLicense(id, { expiresAt });
        await store.logEvent({ licenseId: id, event: 'extended', detail });
        return redirect(res, `/admin/keys/${id}?ok=` + encodeURIComponent('Laufzeit verlaengert.'));
      }

      if (action === 'revoke') {
        if (license.status !== 'revoked') {
          await store.updateLicense(id, { status: 'revoked' });
          await store.logEvent({ licenseId: id, event: 'revoked', detail: `von ${ctx.user.email}` });
        }
        return redirect(res, `/admin/keys/${id}?ok=` + encodeURIComponent('Lizenz gesperrt.'));
      }

      if (action === 'restore') {
        await store.updateLicense(id, { status: 'active' });
        await store.logEvent({ licenseId: id, event: 'restored', detail: `von ${ctx.user.email}` });
        return redirect(res, `/admin/keys/${id}?ok=` + encodeURIComponent('Sperre aufgehoben.'));
      }

      if (action === 'reset') {
        const removed = await store.deleteActivationsForLicense(id);
        await store.logEvent({ licenseId: id, event: 'seat_reset', detail: `${removed} Geraet(e) freigegeben` });
        return redirect(res, `/admin/keys/${id}?ok=` + encodeURIComponent(`${removed} Geraet(e) freigegeben.`));
      }
    }

    const keyDetail = /^\/admin\/keys\/(\d+)$/.exec(path);
    if (keyDetail && method === 'GET') {
      const id = Number(keyDetail[1]);
      const license = await store.getLicense(id);
      if (!license) {
        return sendHtml(
          res,
          404,
          page({
            title: 'Nicht gefunden',
            user: ctx.user,
            csrf: ctx.session.csrf,
            body: '<h1>Lizenz nicht gefunden</h1><div class="actions"><a class="btn" href="/admin/keys">Zur Liste</a></div>',
          }),
        );
      }
      const [activations, events] = await Promise.all([
        store.listActivations(id),
        store.listEvents({ licenseId: id, limit: 30 }),
      ]);
      return sendHtml(
        res,
        200,
        keyDetailPage({
          user: ctx.user,
          csrf: ctx.session.csrf,
          license,
          activations,
          events,
          notice: noticeFromQuery(url),
        }),
      );
    }

    sendHtml(
      res,
      404,
      page({
        title: 'Nicht gefunden',
        user: ctx.user,
        csrf: ctx.session.csrf,
        body: `<h1>Seite nicht gefunden</h1><p class="lead">${esc(path)}</p>
          <div class="actions"><a class="btn" href="/admin/dashboard">Zum Dashboard</a></div>`,
      }),
    );
  };

  function licenceNote(note) {
    return note ?? '';
  }
}
