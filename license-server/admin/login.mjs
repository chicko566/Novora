import { authPage, csrfField, esc } from '../lib/html.mjs';

const PASSKEY_LOGIN_SCRIPT = '/admin/assets/passkey-login.js';

// Haengt Modul-Skripte vor </body>. Doppelte Quellen werden nur einmal eingefuegt.
function withScripts(html, scripts) {
  const list = [];
  for (const src of scripts) {
    if (src && !list.includes(src)) list.push(src);
  }
  if (list.length === 0) return html;
  const tags = list
    .map((src) => `<script type="module" src="${esc(src)}"></script>`)
    .join('\n');
  return html.replace('</body>', `${tags}\n</body>`);
}

export function loginPage({ email = '', csrf = '', notice = null, scripts = [] } = {}) {
  const body = `
  <h1>Anmelden</h1>
  <p class="lead">Zugang zum Lizenz-Admin.</p>
  <form method="post" action="/admin/login" autocomplete="off">
    <input type="hidden" name="mode" value="password">
    ${csrfField(csrf)}
    <div class="field">
      <label for="email">E-Mail</label>
      <input id="email" name="email" type="email" value="${esc(email)}" required autofocus>
    </div>
    <div class="field">
      <label for="password">Passwort</label>
      <input id="password" name="password" type="password" required>
    </div>
    <div class="field">
      <label for="totp">2FA-Code (nur falls aktiviert)</label>
      <input id="totp" name="totp" inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code">
    </div>
    <div class="actions">
      <button class="primary" type="submit">Anmelden</button>
    </div>
  </form>

  <div class="divider">oder</div>

  <form method="post" action="/admin/login" autocomplete="off">
    <input type="hidden" name="mode" value="token">
    ${csrfField(csrf)}
    <div class="field">
      <label for="token">Admin-Token</label>
      <input id="token" name="token" type="password" required>
    </div>
    <div class="actions">
      <button type="submit">Mit Token anmelden</button>
    </div>
  </form>
  <p class="hint">Der Token steht in der Server-Konfiguration als <code>adminLoginToken</code>.</p>

  <section class="block" aria-labelledby="pkTitle">
    <h2 id="pkTitle">Passkey</h2>
    <p class="muted small">Anmeldung mit Windows Hello, Touch ID oder Sicherheitsschluessel.</p>
    <div class="actions">
      <button type="button" id="pkLogin">Mit Passkey anmelden</button>
    </div>
    <p id="pkMsg" class="muted small" role="status" aria-live="polite"></p>
  </section>`;

  const html = authPage({ title: 'Anmelden', body, notice });
  return withScripts(html, [PASSKEY_LOGIN_SCRIPT, ...scripts]);
}

export function setupPage({ email = '', csrf = '', notice = null, tokenRequired = true, scripts = [] } = {}) {
  const body = `
  <h1>Erster Admin</h1>
  <p class="lead">Einmalige Einrichtung. Danach ist diese Seite geschlossen.</p>
  <form method="post" action="/admin/setup" autocomplete="off">
    ${csrfField(csrf)}
    ${tokenRequired
      ? `<div class="field">
          <label for="token">Setup-Token (ADMIN_SETUP_TOKEN)</label>
          <input id="token" name="token" type="password" required>
        </div>`
      : `<input type="hidden" name="token" value="">`}
    <div class="field">
      <label for="email">E-Mail</label>
      <input id="email" name="email" type="email" value="${esc(email)}" required autofocus>
    </div>
    <div class="field">
      <label for="password">Passwort (min. 6 Zeichen)</label>
      <input id="password" name="password" type="password" minlength="6" required>
    </div>
    <div class="field">
      <label for="password2">Passwort wiederholen</label>
      <input id="password2" name="password2" type="password" minlength="6" required>
    </div>
    <div class="actions">
      <button class="primary" type="submit">Admin anlegen</button>
    </div>
  </form>`;

  const html = authPage({ title: 'Einrichtung', body, notice });
  return withScripts(html, scripts);
}
