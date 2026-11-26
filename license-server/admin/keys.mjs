import { badgeForStatus, csrfField, esc, page } from '../lib/html.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { PLANS, planLabel } from '../lib/plans.mjs';
import { dayUtc, stampUtc } from '../lib/time.mjs';

function planOptions(selected = 'standard') {
  return Object.entries(PLANS)
    .map(
      ([value, meta]) =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(meta.label)} (${meta.defaultSeats} ${meta.defaultSeats === 1 ? 'Platz' : 'Plätze'})</option>`,
    )
    .join('');
}

export function keysPage({ user, csrf, items, total, q = '', pageNo = 1, pageSize = 25, notice = null }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const rows = items.length
    ? items
        .map(
          (lic) => `<tr>
            <td style="width:32px"><input type="checkbox" class="row-sel" name="id" value="${esc(lic.id)}" aria-label="Schlüssel ${esc(keyLabel(lic.keyPrefix, lic.keyLast4))} auswählen"></td>
            <td class="mono"><a href="/admin/keys/${lic.id}">${esc(keyLabel(lic.keyPrefix, lic.keyLast4))}</a></td>
            <td>${esc(planLabel(lic.plan))}</td>
            <td>${lic.activeSeats ?? 0} / ${esc(lic.seats)}</td>
            <td>${badgeForStatus(lic.status, lic.expiresAt)}</td>
            <td>${esc(dayUtc(lic.expiresAt))}</td>
            <td class="small muted">${esc(lic.customerEmail ?? lic.note ?? '-')}</td>
            <td class="small">${esc(stampUtc(lic.createdAt))}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="8" class="muted">Keine Schlüssel gefunden.</td></tr>';

  const pager = pages > 1
    ? `<div class="actions">
        ${pageNo > 1 ? `<a class="btn" href="/admin/keys?page=${pageNo - 1}&q=${encodeURIComponent(q)}">Zurück</a>` : ''}
        <span class="muted small">Seite ${pageNo} von ${pages}</span>
        ${pageNo < pages ? `<a class="btn" href="/admin/keys?page=${pageNo + 1}&q=${encodeURIComponent(q)}">Weiter</a>` : ''}
      </div>`
    : '';

  const body = `
  <h1>Schlüssel</h1>
  <p class="lead">${esc(total)} Lizenzen. Suche nach Prefix, Endung, Notiz, Kunde oder ID.</p>
  <form method="get" action="/admin/keys" class="panel" style="padding:12px 14px;margin-bottom:16px">
    <div class="row">
      <div class="field"><label for="q">Suche</label>
        <input id="q" name="q" value="${esc(q)}" placeholder="z. B. NVR-23456 oder Kunde"></div>
      <div class="actions" style="margin-top:0"><button class="primary" type="submit">Suchen</button>
        <a class="btn" href="/admin/keys">Zurücksetzen</a></div>
    </div>
  </form>
  <form method="post" action="/admin/keys/delete-bulk" data-confirm="Ausgewählte Schlüssel endgültig löschen? Aktivierungen und Verlauf gehen verloren.">
    ${csrfField(csrf)}
    <div class="panel table-wrap">
      <table><thead><tr>
        <th style="width:32px"><input type="checkbox" id="selAll" aria-label="Alle auswählen"></th>
        <th>Schlüssel</th><th>Plan</th><th>Plätze</th><th>Status</th><th>Gültig bis</th><th>Kunde/Notiz</th><th>Angelegt</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="bulk-bar">
      <div class="actions" style="margin-top:0">
        <a class="btn primary" href="/admin/keys/new">Neue Schlüssel</a>
        <a class="btn" href="/admin/export.csv">CSV-Export</a>
      </div>
      <div class="actions" style="margin-top:0">
        <span id="bulkSelCount" class="muted small"></span>
        <button id="bulkDelBtn" class="danger" type="submit" disabled>Ausgewählte löschen</button>
      </div>
    </div>
  </form>
  ${pager}`;

  return page({ title: 'Schlüssel', active: 'keys', user, csrf, body, notice, scripts: ['/admin/assets/keys-manage.js'] });
}

export function keysNewPage({ user, csrf, notice = null }) {
  const body = `
  <h1>Schluessel anlegen</h1>
  <p class="lead">Der volle Schluessel wird nur einmal nach dem Anlegen angezeigt. Danach speichert der Server nur HMAC-Hash, Prefix und Endung.</p>

  <section class="block">
    <h2>Einzeln oder in Menge</h2>
    <form method="post" action="/admin/keys/new" class="panel">
      ${csrfField(csrf)}
      <input type="hidden" name="mode" value="single">
      <div class="row">
        <div class="field"><label for="plan">Plan</label>
          <select id="plan" name="plan">${planOptions('standard')}</select></div>
        <div class="field"><label for="seats">Plaetze (Geraete)</label>
          <input id="seats" name="seats" type="number" min="1" max="100" value="1"></div>
        <div class="field"><label for="days">Laufzeit in Tagen (0 = unbegrenzt)</label>
          <input id="days" name="days" type="number" min="0" max="3650" value="365"></div>
        <div class="field"><label for="count">Anzahl</label>
          <input id="count" name="count" type="number" min="1" max="100" value="1"></div>
      </div>
      <div class="row" style="margin-top:14px">
        <div class="field"><label for="note">Notiz</label>
          <input id="note" name="note" maxlength="255" placeholder="z. B. Sammelbestellung 11/2026"></div>
        <div class="field"><label for="email">Kunden-E-Mail (optional)</label>
          <input id="email" name="customer_email" type="email" maxlength="190"></div>
      </div>
      <div class="actions"><button class="primary" type="submit">Anlegen</button></div>
    </form>
  </section>

  <section class="block">
    <h2>CSV-Import</h2>
    <form method="post" action="/admin/keys/new" class="panel">
      ${csrfField(csrf)}
      <input type="hidden" name="mode" value="csv">
      <div class="field">
        <label for="csv">Zeilen: plan;sitze;tage;notiz;email (Felder optional, Trenner ; oder ,)</label>
        <textarea id="csv" name="csv" placeholder="standard;1;365;Kunde Meier;meier@example.org&#10;pro;3;730;Firma Beispiel;buero@example.org&#10;standard"></textarea>
      </div>
      <div class="actions"><button class="primary" type="submit">CSV anlegen</button></div>
    </form>
  </section>`;

  return page({ title: 'Schluessel anlegen', active: 'new', user, csrf, body, notice });
}

export function keysCreatedPage({ user, csrf, created, notice = null }) {
  const lines = created.map((entry) => `${entry.formatted}   ${entry.plan}   ${entry.seats} Platz/Plaetze   ${entry.expiresAt ? 'bis ' + dayUtc(entry.expiresAt) : 'unbegrenzt'}`).join('\n');
  const body = `
  <h1>Schluessel angelegt</h1>
  <div class="notice info">Diese Schluessel werden <strong>nur jetzt</strong> im Klartext angezeigt. Jetzt kopieren und sicher uebergeben.</div>
  <div class="panel">
    <pre class="keys">${esc(lines)}</pre>
  </div>
  <div class="actions">
    <a class="btn primary" href="/admin/keys">Zur Schluesselliste</a>
    <a class="btn" href="/admin/keys/new">Weitere anlegen</a>
  </div>`;

  return page({ title: 'Schluessel angelegt', active: 'new', user, csrf, body, notice });
}
