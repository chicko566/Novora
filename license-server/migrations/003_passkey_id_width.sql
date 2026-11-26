-- Novora Lizenzserver - Passkey-Credential-IDs koennen laenger als 255 Zeichen sein
-- (base64url-kodierte Rohdaten). Wird von der Auto-Migration automatisch angewendet.

ALTER TABLE admin_passkeys MODIFY credential_id VARCHAR(1024) NOT NULL;
