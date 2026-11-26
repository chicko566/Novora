import { badgeForStatus, csrfField, esc, page } from '../lib/html.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { PLANS, planLabel } from '../lib/plans.mjs';
import { dayUtc, stampUtc } from '../lib/time.mjs';

function planOptions(selected) {
  return Object.entries(PLANS)
    .map(
      ([value, meta]) =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(meta.label)}</option>`,
    )
    .join('');
}

export function keyDetailPage({ user, csrf, license, activations, events, createdKey = null, notice = null }) {
  const seatsUsed = activations.length;

  const activationRows = activations.length
    ? activations
        .map(
          (act) => `<tr>
            <td class="small mono">${esc(act.installId)}</td>
            <td class="small">${esc(act.deviceName ?? '-')}</td>
            <td class="small">${esc(act.platform ?? '-')}</td>
            <td class="small">${esc(act.appVersion ?? '-')}</td>
            <td class="small">${esc(stampUtc(act.lastSeen))}</td>
            <td>
              <form method="post" action="/admin/keys/${license.id}/activations/${act.id}/reset"
                    data-confirm="Gerät freigeben?">
                ${csrfField(csrf)}
                <button class="danger" type="submit">Freigeben</button>
              </form>
            </td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="muted">Keine Geraete aktiviert.</td></tr>';

  const eventRows = events.length
    ? events
        .map(
          (event) => `<tr>
            <td class="small">${esc(stampUtc(event.createdAt))}</td>
            <td class="small">${esc(event.event)}</td>
            <td class="small muted">${esc(event.detail ?? '')}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="muted">Keine Ereignisse.</td></tr>';

  const body = `
  <h1>${esc(keyLabel(license.keyPrefix, license.keyLast4))}</h1>
  <p class="lead">${badgeForStatus(license.status, license.expiresAt)}
    ${esc(planLabel(license.plan))} &middot; ${seatsUsed}/${esc(license.seats)} Plaetze belegt
    &middot; ID ${esc(license.id)}</p>

  ${createdKey ? `<div class="notice info">Neu erzeugter Schluessel (nur jetzt sichtbar):<br><code>${esc(createdKey)}</code></div>` : ''}

  <section class="block">
    <div class="panel">
      <dl class="kv">
        <dt>Status</dt><dd>${esc(license.status)}</dd>
        <dt>Plan</dt><dd>${esc(planLabel(license.plan))}</dd>
        <dt>Plaetze</dt><dd>${esc(license.seats)}</dd>
        <dt>Gueltig bis</dt><dd>${license.expiresAt ? esc(dayUtc(license.expiresAt)) : 'unbegrenzt'}</dd>
        <dt>Kunde</dt><dd>${esc(license.customerEmail ?? '-')}</dd>
        <dt>Notiz</dt><dd>${esc(license.note ?? '-')}</dd>
        <dt>Angelegt</dt><dd>${esc(stampUtc(license.createdAt))}</dd>
      </dl>
    </div>
  </section>

  <section class="block">
    <h2>Bearbeiten</h2>
    <form method="post" action="/admin/keys/${license.id}/update" class="panel">
      ${csrfField(csrf)}
      <div class="row">
        <div class="field"><label for="plan">Plan</label>
          <select id="plan" name="plan">${planOptions(license.plan)}</select></div>
        <div class="field"><label for="seats">Plaetze</label>
          <input id="seats" name="seats" type="number" min="1" max="100" value="${esc(license.seats)}"></div>
        <div class="field"><label for="note">Notiz</label>
          <input id="note" name="note" maxlength="255" value="${esc(license.note ?? '')}"></div>
        <div class="field"><label for="email">Kunden-E-Mail</label>
          <input id="email" name="customer_email" type="email" maxlength="190" value="${esc(license.customerEmail ?? '')}"></div>
      </div>
      <div class="actions"><button class="primary" type="submit">Speichern</button></div>
    </form>
  </section>

  <section class="block">
    <h2>Laufzeit</h2>
    <form method="post" action="/admin/keys/${license.id}/extend" class="panel">
      ${csrfField(csrf)}
      <div class="row">
        <div class="field"><label for="days">Verlaengern um Tage</label>
          <input id="days" name="days" type="number" min="1" max="3650" value="365"></div>
        <div class="field"><label for="until">oder festes Datum (YYYY-MM-DD)</label>
          <input id="until" name="until" placeholder="2027-12-31" pattern="\\d{4}-\\d{2}-\\d{2}"></div>
      </div>
      <div class="actions">
        <button class="primary" type="submit">Verlaengern</button>
      </div>
    </form>
    <div class="actions" style="margin-top:14px">
      ${license.status === 'active'
        ? `<form method="post" action="/admin/keys/${license.id}/revoke" class="inline">
            ${csrfField(csrf)}<button class="danger" type="submit">Lizenz sperren</button></form>`
        : `<form method="post" action="/admin/keys/${license.id}/restore" class="inline">
            ${csrfField(csrf)}<button type="submit">Sperre aufheben</button></form>`}
      <form method="post" action="/admin/keys/${license.id}/reset" class="inline"
            data-confirm="Alle Geräte freigeben?">
        ${csrfField(csrf)}<button type="submit">Alle Geräte freigeben</button>
      </form>
      <form method="post" action="/admin/keys/${license.id}/delete" class="inline"
            data-confirm="Schlüssel endgültig löschen? Aktivierungen und Verlauf gehen verloren.">
        ${csrfField(csrf)}<button class="danger" type="submit">Schlüssel löschen</button>
      </form>
    </div>
  </section>

  <section class="block">
    <h2>Aktivierungen (${activations.length})</h2>
    <div class="panel table-wrap">
      <table><thead><tr><th>Install-ID</th><th>Geraet</th><th>Plattform</th><th>App</th><th>Zuletzt</th><th></th></tr></thead>
      <tbody>${activationRows}</tbody></table>
    </div>
  </section>

  <section class="block">
    <h2>Ereignisse</h2>
    <div class="panel table-wrap">
      <table><thead><tr><th>Zeit</th><th>Ereignis</th><th>Detail</th></tr></thead>
      <tbody>${eventRows}</tbody></table>
    </div>
    <div class="actions"><a class="btn" href="/admin/keys">Zurueck zur Liste</a></div>
  </section>`;

  return page({ title: keyLabel(license.keyPrefix, license.keyLast4), active: 'keys', user, csrf, body, notice, scripts: ['/admin/assets/keys-manage.js'] });
}
