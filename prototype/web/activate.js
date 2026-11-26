// Aktivierungsseite: Key eingeben, lokal gegen den Lizenzserver aktivieren.
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const formCard = $('#formCard');
  const statusCard = $('#statusCard');
  const form = $('#keyForm');
  const keyInput = $('#key');
  const activateBtn = $('#activateBtn');
  const msg = $('#msg');
  const statusMsg = $('#statusMsg');
  const changeBtn = $('#changeBtn');
  const releaseBtn = $('#releaseBtn');

  const PLAN_NAMES = {
    solo: 'Solo',
    duo: 'Duo',
    family: 'Familie',
    team: 'Team',
    business: 'Business'
  };

  let busy = false;
  let releaseArmed = false;
  let releaseTimer = null;

  function setMsg(el, text, kind) {
    el.textContent = text || '';
    el.classList.toggle('err', kind === 'err');
    el.classList.toggle('ok', kind === 'ok');
  }

  function planName(plan) {
    if (!plan) return '–';
    const key = String(plan).toLowerCase();
    if (PLAN_NAMES[key]) return PLAN_NAMES[key];
    return String(plan).charAt(0).toUpperCase() + String(plan).slice(1);
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async function request(path, options) {
    const res = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options && options.headers) }
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, ok: res.ok, data };
  }

  function normalizedKey(value) {
    return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  function formatKey(value) {
    const raw = normalizedKey(value).slice(0, 23);
    if (!raw) return '';
    const tail = raw.startsWith('NVR') ? raw.slice(3) : raw;
    const groups = tail.match(/.{1,5}/g);
    if (!groups) return raw.startsWith('NVR') ? 'NVR-' : '';
    const prefix = raw.startsWith('NVR') ? 'NVR-' : '';
    return prefix + groups.join('-');
  }

  keyInput.addEventListener('input', () => {
    const formatted = formatKey(keyInput.value);
    if (formatted !== keyInput.value) {
      const atEnd = keyInput.selectionStart === keyInput.value.length;
      keyInput.value = formatted;
      if (atEnd) keyInput.setSelectionRange(formatted.length, formatted.length);
    }
    keyInput.setAttribute('aria-invalid', 'false');
    if (msg.classList.contains('err')) setMsg(msg, '', '');
  });

  function showStatus(status) {
    const s = status && status.status ? status.status : status || {};
    $('#fPlan').textContent = planName(s.plan);
    // Lizenzlaufzeit des Keys; Token (7 Tage) erscheint nur als Hinweis.
    $('#fExp').textContent = s.licenseExpiresAt === null
      ? 'unbegrenzt'
      : fmtDate(s.licenseExpiresAt || s.expiresAt);
    $('#fKey').textContent = s.keyHint ? '…' + String(s.keyHint) : '–';
    showTokenNote();
    formCard.classList.add('hidden');
    statusCard.classList.remove('hidden');
    setMsg(statusMsg, s.error || '', s.error ? 'err' : '');
    changeBtn.focus();
  }

  // Eine kleine Zeile unter den Fakten: Token wird automatisch erneuert.
  function showTokenNote() {
    if (document.getElementById('fToken')) return;
    const dl = $('#fExp') && $('#fExp').closest('dl');
    if (!dl || !dl.parentNode) return;
    const p = document.createElement('p');
    p.className = 'note';
    p.id = 'fToken';
    p.textContent = 'Token wird automatisch erneuert.';
    dl.parentNode.insertBefore(p, dl.nextSibling);
  }

  function showForm(text, kind) {
    statusCard.classList.add('hidden');
    formCard.classList.remove('hidden');
    setMsg(msg, text || '', kind || '');
    keyInput.focus();
  }

  async function refreshStatus() {
    try {
      const r = await request('/api/license/local/status', { method: 'GET' });
      if (r.ok && r.data && r.data.licensed) {
        showStatus(r.data);
        return true;
      }
    } catch {
      // Server noch nicht bereit: Formular bleibt sichtbar.
    }
    return false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const key = normalizedKey(keyInput.value);
    if (!/^NVR[0-9A-Z]{20}$/.test(key)) {
      keyInput.setAttribute('aria-invalid', 'true');
      setMsg(msg, 'Bitte vollständigen Schlüssel im Format NVR-XXXXX-XXXXX-XXXXX-XXXXX eingeben.', 'err');
      keyInput.focus();
      return;
    }

    busy = true;
    activateBtn.disabled = true;
    activateBtn.textContent = 'Wird geprüft …';
    setMsg(msg, 'Lizenz wird beim Server geprüft …', '');

    try {
      const r = await request('/api/license/local/activate', {
        method: 'POST',
        body: JSON.stringify({ key })
      });
      if (r.ok && r.data && r.data.ok) {
        setMsg(msg, '', '');
        showStatus(r.data.status || r.data);
        setMsg(statusMsg, 'Aktiviert. Diese Installation ist jetzt lizenziert.', 'ok');
        return;
      }
      const text = (r.data && r.data.message) || 'Aktivierung fehlgeschlagen. Bitte Schlüssel prüfen.';
      setMsg(msg, text, 'err');
      keyInput.setAttribute('aria-invalid', 'true');
      keyInput.focus();
    } catch {
      setMsg(msg, 'Lizenzserver nicht erreichbar. Der PC muss online sein.', 'err');
    } finally {
      busy = false;
      activateBtn.disabled = false;
      activateBtn.textContent = 'Aktivieren';
    }
  });

  changeBtn.addEventListener('click', () => {
    if (busy) return;
    keyInput.value = '';
    keyInput.setAttribute('aria-invalid', 'false');
    showForm('Neuen Schlüssel eingeben. Der bisherige Key wird ersetzt.', '');
  });

  function disarmRelease() {
    releaseArmed = false;
    releaseBtn.textContent = 'Gerät freigeben';
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
  }

  releaseBtn.addEventListener('click', async () => {
    if (busy) return;

    if (!releaseArmed) {
      releaseArmed = true;
      releaseBtn.textContent = 'Wirklich freigeben? Erneut klicken';
      setMsg(statusMsg, 'Freigeben trennt die Lizenz von diesem PC. Erneut klicken zum Bestätigen.', '');
      releaseTimer = setTimeout(disarmRelease, 6000);
      return;
    }

    disarmRelease();
    busy = true;
    releaseBtn.disabled = true;
    setMsg(statusMsg, 'Gerät wird freigegeben …', '');

    try {
      const r = await request('/api/license/local/deactivate', { method: 'POST' });
      const warning = r.data && r.data.warning;
      keyInput.value = '';
      showForm(
        warning || 'Gerät wurde freigegeben. Zum Weiternutzen erneut aktivieren.',
        warning ? 'err' : 'ok'
      );
    } catch {
      setMsg(statusMsg, 'Freigabe fehlgeschlagen: Server nicht erreichbar.', 'err');
    } finally {
      busy = false;
      releaseBtn.disabled = false;
    }
  });

  // Beim Laden: schon lizenziert? Dann direkt die Statuskarte zeigen.
  refreshStatus();
})();
