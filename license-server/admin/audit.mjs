import { esc, page } from '../lib/html.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { stampUtc } from '../lib/time.mjs';

const PASSKEY_MANAGE_SCRIPT = '/admin/assets/passkey-manage.js';

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

function stampOrDash(value) {
  if (value === null || value === undefined || value === '') return '-';
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) return '-';
  try {
    return stampUtc(ms);
  } catch {
    return '-';
  }
}

function passkeyId(entry) {
  return entry?.id ?? entry?.credentialId ?? entry?.credentialID ?? '';
}

function passkeyName(entry) {
  return entry?.name ?? entry?.label ?? 'Passkey';
}

function passkeyRows(passkeys) {
  if (!Array.isArray(passkeys) || passkeys.length === 0) {
    return '<p class="muted small">Noch kein Passkey hinterlegt. Nach dem Hinzufuegen ist die Anmeldung ohne Passwort moeglich.</p>';
  }
  const rows = passkeys
    .map((entry) => {
      const id = String(passkeyId(entry));
      return `<tr>
        <td>${esc(passkeyName(entry))}</td>
        <td class="small">${esc(stampOrDash(entry?.createdAt ?? entry?.created_at))}</td>
        <td class="small">${esc(stampOrDash(entry?.lastUsed ?? entry?.lastUsedAt ?? entry?.last_used_at))}</td>
        <td class="small"><button type="button" class="danger" data-pk-delete="${esc(id)}">Entfernen</button></td>
      </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Erstellt</th><th>Zuletzt genutzt</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function auditPage({ user, csrf, events, licenseId = '', notice = null }) {
  const rows = events.length
    ? events
        .map(
          (event) => `<tr>
            <td class="small">${esc(stampUtc(event.createdAt))}</td>
            <td class="small">${esc(event.event)}</td>
            <td class="mono small">${
              event.keyPrefix ? `<a href="/admin/keys/${event.licenseId}">${esc(keyLabel(event.keyPrefix, event.keyLast4))}</a>` : '-'
            }</td>
            <td class="small muted">${esc(event.detail ?? '')}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">Keine Ereignisse.</td></tr>';

  const body = `
  <h1>Audit</h1>
  <p class="lead">Die letzten 200 Ereignisse. Filter optional nach Lizenz-ID.</p>
  <form method="get" action="/admin/audit" class="panel" style="padding:12px 14px;margin-bottom:16px">
    <div class="row">
      <div class="field"><label for="license">Lizenz-ID</label>
        <input id="license" name="license" value="${esc(licenseId)}" inputmode="numeric"></div>
      <div class="actions" style="margin-top:0"><button class="primary" type="submit">Filtern</button>
        <a class="btn" href="/admin/audit">Alle</a></div>
    </div>
  </form>
  <div class="panel table-wrap">
    <table><thead><tr><th>Zeit</th><th>Ereignis</th><th>Schluessel</th><th>Detail</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
  <div class="actions"><a class="btn" href="/admin/export.csv">CSV-Export</a></div>`;

  return page({ title: 'Audit', active: 'audit', user, csrf, body, notice });
}

export function securityPage({
  user,
  csrf,
  pendingSecret = null,
  otpauth = null,
  notice = null,
  passkeys = [],
  scripts = [],
}) {
  const body = pendingSecret
    ? `<h1>2FA bestaetigen</h1>
       <p class="lead">Secret in der Authenticator-App eintragen und den 6-stelligen Code bestaetigen.</p>
       <div class="panel">
         <dl class="kv">
           <dt>Secret (Base32)</dt><dd class="mono">${esc(pendingSecret)}</dd>
           <dt>otpauth-URL</dt><dd class="mono small" style="overflow-wrap:anywhere">${esc(otpauth)}</dd>
         </dl>
         <form method="post" action="/admin/totp/confirm" style="margin-top:16px">
           ${csrfField(csrf)}
           <input type="hidden" name="secret" value="${esc(pendingSecret)}">
           <div class="field" style="max-width:220px"><label for="code">Code</label>
             <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" required autofocus></div>
           <div class="actions"><button class="primary" type="submit">Aktivieren</button></div>
         </form>
       </div>`
    : `<h1>Sicherheit</h1>
       <p class="lead">2FA-Status, Sitzungen und Passkeys.</p>
       <div class="panel">
         <p>2FA: ${user.totpSecret ? '<span class="badge active">aktiv</span>' : '<span class="badge neutral">aus</span>'}</p>
         ${user.totpSecret
           ? `<form method="post" action="/admin/totp/disable">
                ${csrfField(csrf)}
                <div class="field" style="max-width:260px"><label for="pw">Passwort</label>
                  <input id="pw" name="password" type="password" required></div>
                <div class="actions"><button class="danger" type="submit">2FA abschalten</button></div>
              </form>`
           : `<form method="post" action="/admin/totp/enable">
                ${csrfField(csrf)}
                <button class="primary" type="submit">2FA einrichten</button>
              </form>`}
       </div>

       <section class="block" id="pkManage" data-csrf="${esc(csrf)}" aria-labelledby="pkManageTitle">
         <h2 id="pkManageTitle">Passkeys (Windows Hello)</h2>
         <p class="muted small">Passkeys erlauben die Anmeldung ohne Passwort. Der Schluessel bleibt lokal auf diesem PC.</p>
         <div class="panel">${passkeyRows(passkeys)}</div>
         <div class="actions"><button type="button" id="pkAdd">Passkey hinzufuegen</button></div>
         <p id="pkManageMsg" class="muted small" role="status" aria-live="polite"></p>
       </section>`;

  const html = page({ title: 'Sicherheit', active: 'security', user, csrf, body, notice });
  return withScripts(html, [PASSKEY_MANAGE_SCRIPT, ...scripts]);
}

function csrfField(csrf) {
  return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
}
