// Wrapper: buendelt das installierte Browser-Bundle (lokal, keine CDN-URLs).
// Ausgeliefert als /admin/assets/passkey-browser.js, importiert das Bundle
// relativ unter /admin/assets/passkey/esm/.
import * as simplewebauthn from './passkey/esm/index.js';

export const {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsPasskeys,
  platformAuthenticatorIsAvailable,
} = simplewebauthn;

export const browser = simplewebauthn;
export default simplewebauthn;
