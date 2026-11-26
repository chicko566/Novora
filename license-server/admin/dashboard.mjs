import { csrfField, esc, page } from '../lib/html.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { dayUtc, stampUtc } from '../lib/time.mjs';

export function dashboardPage({ user, csrf, stats, recentEvents, expiring, notice = null }) {
  const statCards = [
    ['Lizenzen', stats.licenses, `${stats.active} aktiv / ${stats.revoked} gesperrt`],
    ['Aktivierungen', stats.activeActivations, `${stats.activations} insgesamt`],
    ['Laeuft bald ab', stats.expiringSoon, 'innerhalb 30 Tagen'],
    ['Schluessel gesamt', stats.licenses, 'inkl. gesperrt'],
  ]
    .map(
      ([k, v, s]) => `<div class="panel stat"><div class="k">${esc(k)}</div>
        <div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`,
    )
    .join('');

  const expiringRows = expiring.length
    ? expiring
        .map(
          (lic) => `<tr>
            <td class="mono"><a href="/admin/keys/${lic.id}">${esc(keyLabel(lic.keyPrefix, lic.keyLast4))}</a></td>
            <td>${esc(lic.plan)}</td>
            <td>${esc(dayUtc(lic.expiresAt))}</td>
            <td>${esc(lic.customerEmail ?? '-')}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">Nichts in den naechsten 30 Tagen.</td></tr>';

  const eventRows = recentEvents.length
    ? recentEvents
        .map(
          (event) => `<tr>
            <td>${esc(stampUtc(event.createdAt))}</td>
            <td>${esc(event.event)}</td>
            <td class="mono small">${
              event.keyPrefix ? esc(keyLabel(event.keyPrefix, event.keyLast4)) : '-'
            }</td>
            <td class="small muted">${esc(event.detail ?? '')}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">Noch keine Ereignisse.</td></tr>';

  const totpBox = user.totpSecret
    ? `<p class="small">2FA ist <span class="badge active">aktiv</span>.</p>
       <form method="post" action="/admin/totp/disable" class="row">
         ${csrfField(csrf)}
         <div class="field"><label for="pw">Passwort zur Bestaetigung</label>
           <input id="pw" name="password" type="password" required></div>
         <div class="actions" style="margin-top:0"><button class="danger" type="submit">2FA abschalten</button></div>
       </form>`
    : `<p class="small muted">2FA ist nicht aktiv. Empfohlen fuer oeffentliche Server.</p>
       <form method="post" action="/admin/totp/enable">
         ${csrfField(csrf)}
         <button type="submit">2FA einrichten</button>
       </form>`;

  const body = `
  <h1>Dashboard</h1>
  <p class="lead">Ueberblick ueber Lizenzen, Geraete und Aktivitaet.</p>
  <div class="grid">${statCards}</div>

  <section class="block">
    <h2>Laeuft bald ab</h2>
    <div class="panel table-wrap">
      <table><thead><tr><th>Schluessel</th><th>Plan</th><th>Gueltig bis</th><th>Kunde</th></tr></thead>
      <tbody>${expiringRows}</tbody></table>
    </div>
  </section>

  <section class="block">
    <h2>Letzte Ereignisse</h2>
    <div class="panel table-wrap">
      <table><thead><tr><th>Zeit</th><th>Ereignis</th><th>Schluessel</th><th>Detail</th></tr></thead>
      <tbody>${eventRows}</tbody></table>
    </div>
    <div class="actions"><a class="btn" href="/admin/audit">Gesamtes Audit</a>
      <a class="btn" href="/admin/keys/new">Schluessel anlegen</a>
      <a class="btn" href="/admin/export.csv">CSV-Export</a></div>
  </section>

  <section class="block">
    <h2>Sicherheit</h2>
    <div class="panel">${totpBox}</div>
  </section>

  <section class="block">
    <h2>API-Endpunkte</h2>
    <div class="panel">
      <dl class="kv">
        <dt>Basis-URL</dt><dd class="mono">/api/license</dd>
        <dt>Aktivieren</dt><dd class="mono">POST /api/license/activate</dd>
        <dt>Heartbeat</dt><dd class="mono">POST /api/license/heartbeat</dd>
        <dt>Freigeben</dt><dd class="mono">POST /api/license/deactivate</dd>
        <dt>Health</dt><dd class="mono">GET /api/license/health</dd>
        <dt>Public Key</dt><dd><a href="/admin/public-key.pem">license.pub.pem herunterladen</a></dd>
      </dl>
    </div>
  </section>`;

  return page({ title: 'Dashboard', active: 'dashboard', user, csrf, body, notice });
}
