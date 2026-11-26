// Passkey-Anmeldung (Login-Seite). Wird als Modul von /admin/login geladen.
import { startAuthentication } from '/admin/assets/passkey-browser.js';

const button = document.getElementById('pkLogin');
const message = document.getElementById('pkMsg');

function setMessage(text) {
  if (message) message.textContent = text;
}

function errorText(payload, status) {
  if (payload && typeof payload.error === 'string' && payload.error) return payload.error;
  if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
  return `Anmeldung fehlgeschlagen (HTTP ${status}).`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
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

async function loginWithPasskey() {
  if (!button) return;
  button.disabled = true;
  setMessage('Passkey wird abgefragt ...');
  try {
    const options = await postJson('/admin/passkey/login/options', {});
    const assertion = await startAuthentication({ optionsJSON: options });
    const result = await postJson('/admin/passkey/login/verify', assertion);
    if (!result || result.ok !== true) throw new Error('Anmeldung nicht bestaetigt.');
    setMessage('Angemeldet. Weiterleitung ...');
    window.location.assign('/admin/dashboard');
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    setMessage(text);
    button.disabled = false;
  }
}

if (button) {
  button.addEventListener('click', loginWithPasskey);
  setMessage('');
}
