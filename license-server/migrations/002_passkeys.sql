-- Novora Lizenzserver - WebAuthn-Passkeys fuer Admin-Konten
-- Wird von der Auto-Migration (lib/store/mysql.mjs, readMigrationFiles) automatisch angewendet.

CREATE TABLE IF NOT EXISTS admin_passkeys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  credential_id VARCHAR(1024) NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_passkeys_credential (credential_id),
  KEY idx_admin_passkeys_user (user_id),
  CONSTRAINT fk_admin_passkeys_user FOREIGN KEY (user_id)
    REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
