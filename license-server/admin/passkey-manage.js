// Passkey-Verwaltung (Sicherheits-Seite). Wird als Modul von /admin/security geladen.
import { startRegistration } from '/admin/assets/passkey-browser.js';

const section = document.getElementById('pkManage');
const addButton = document.getElementById('pkAdd');
const message = document.getElementById('pkManageMsg');
const csrf = section ? section.getAttribute('data-csrf') || '' : '';

function setMessage(text) {
  if (message) message.textContent = text;
}

function errorText(payload, status) {
  if (payload && typeof payload.error === 'string' && payload.error) return payload.error;
  if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
  return `Anfrage fehlgeschlagen (HTTP ${status}).`;
}

async function postJson(url, body, extraHeaders) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(csrf ? { 'x-csrf': csrf } : {}),
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(errorText(payload, response.status));
  return payload;
}

async function addPasskey() {
  if (!addButton) return;
  addButton.disabled = true;
  setMessage('Passkey wird erstellt ...');
  try {
    const options = await postJson('/admin/passkey/register/options', { _csrf: csrf });
    const registration = await startRegistration({ optionsJSON: options });
    const result = await postJson('/admin/passkey/register/verify', { ...registration, _csrf: csrf });
    if (!result || result.ok !== true) throw new Error('Passkey wurde nicht gespeichert.');
    setMessage('Passkey gespeichert. Seite wird neu geladen ...');
    window.location.reload();
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    setMessage(text);
    addButton.disabled = false;
  }
}

async function deletePasskey(id) {
  setMessage('Passkey wird entfernt ...');
  try {
    const result = await postJson('/admin/passkey/delete', { id, _csrf: csrf });
    if (!result || result.ok !== true) throw new Error('Passkey wurde nicht entfernt.');
    setMessage('Passkey entfernt. Seite wird neu geladen ...');
    window.location.reload();
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    setMessage(text);
  }
}

if (addButton) addButton.addEventListener('click', addPasskey);

if (section) {
  section.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-pk-delete]') : null;
    if (!target) return;
    const id = target.getAttribute('data-pk-delete');
    if (!id) return;
    target.disabled = true;
    deletePasskey(id);
  });
}
