import { fromMysqlDate, toMysqlDate } from '../time.mjs';

const SCHEMA_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const LICENSE_COLUMNS = `l.id, l.key_hash, l.key_prefix, l.key_last4, l.plan, l.seats, l.status,
  l.expires_at, l.note, l.customer_email, l.created_at`;

function mapLicense(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    keyLast4: row.key_last4,
    plan: row.plan,
    seats: Number(row.seats),
    status: row.status,
    expiresAt: fromMysqlDate(row.expires_at),
    note: row.note ?? null,
    customerEmail: row.customer_email ?? null,
    createdAt: fromMysqlDate(row.created_at),
  };
}

function mapActivation(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    licenseId: Number(row.license_id),
    installId: row.install_id,
    deviceName: row.device_name ?? null,
    platform: row.platform ?? null,
    appVersion: row.app_version ?? null,
    firstSeen: fromMysqlDate(row.first_seen),
    lastSeen: fromMysqlDate(row.last_seen),
    ipHash: row.ip_hash ?? null,
    revokedAt: fromMysqlDate(row.revoked_at),
  };
}

function mapEvent(row) {
  return {
    id: Number(row.id),
    licenseId: row.license_id == null ? null : Number(row.license_id),
    activationId: row.activation_id == null ? null : Number(row.activation_id),
    event: row.event,
    detail: row.detail ?? null,
    createdAt: fromMysqlDate(row.created_at),
    keyPrefix: row.key_prefix ?? null,
    keyLast4: row.key_last4 ?? null,
  };
}

function mapAdmin(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    passwordHash: row.password_hash,
    totpSecret: row.totp_secret ?? null,
    role: row.role,
    createdAt: fromMysqlDate(row.created_at),
  };
}

function mapPasskey(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter ?? 0),
    transports: row.transports ?? null,
    createdAt: fromMysqlDate(row.created_at),
    lastUsed: fromMysqlDate(row.last_used),
  };
}

export async function createMysqlStore(cfg, { mysqlOverride } = {}) {
  let mysql = mysqlOverride;
  if (!mysql) {
    try {
      mysql = await import('mysql2/promise');
    } catch {
      throw new Error(
        'mysql2 ist nicht installiert. Im Ordner license-server ausfuehren: npm install mysql2',
      );
    }
  }

  const pool = mysql.createPool({
    host: cfg.db.host,
    port: cfg.db.port,
    user: cfg.db.user,
    password: cfg.db.password,
    database: cfg.db.name,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  const query = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  };
  const execute = async (sql, params = []) => {
    const [result] = await pool.execute(sql, params);
    return result;
  };

  async function migrate() {
    await pool.query(SCHEMA_TABLE);
    const { readMigrationFiles } = await import('../sql.mjs');
    const files = readMigrationFiles(cfg.migrationsDir);
    for (const file of files) {
      const done = await query('SELECT name FROM schema_migrations WHERE name = ? LIMIT 1', [file.name]);
      if (done.length) continue;
      for (const statement of file.statements) {
        await pool.query(statement);
      }
      try {
        await execute('INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP())', [file.name]);
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
      }
      console.log(`[db] Migration angewendet: ${file.name}`);
    }
  }

  const store = {
    kind: 'mysql',

    async init() {
      await migrate();
    },

    async close() {
      await pool.end();
    },

    async createLicense(data) {
      const result = await execute(
        `INSERT INTO licenses (key_hash, key_prefix, key_last4, plan, seats, status, expires_at, note,
           customer_email, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        [
          data.keyHash,
          data.keyPrefix,
          data.keyLast4,
          data.plan ?? 'standard',
          data.seats ?? 1,
          toMysqlDate(data.expiresAt ?? null),
          data.note ?? null,
          data.customerEmail ?? null,
          toMysqlDate(data.createdAt ?? Date.now()),
        ],
      );
      return store.getLicense(result.insertId);
    },

    async getLicense(id) {
      const rows = await query(`SELECT ${LICENSE_COLUMNS} FROM licenses l WHERE l.id = ? LIMIT 1`, [id]);
      return mapLicense(rows[0]);
    },

    async findLicenseByKeyHash(hash) {
      const rows = await query(`SELECT ${LICENSE_COLUMNS} FROM licenses l WHERE l.key_hash = ? LIMIT 1`, [hash]);
      return mapLicense(rows[0]);
    },

    async listLicenses({ q = '', limit = 50, offset = 0 } = {}) {
      const needle = String(q ?? '').trim();
      const where = [];
      const params = [];
      if (needle) {
        const like = `%${needle}%`;
        where.push(
          '(l.key_prefix LIKE ? OR l.key_last4 LIKE ? OR l.note LIKE ? OR l.customer_email LIKE ? OR CAST(l.id AS CHAR) = ?)',
        );
        params.push(like, like, like, like, needle);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const totals = await query(`SELECT COUNT(*) AS n FROM licenses l ${whereSql}`, params);
      const rows = await query(
        `SELECT ${LICENSE_COLUMNS},
           (SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id AND a.revoked_at IS NULL) AS active_seats
         FROM licenses l ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)],
      );
      return {
        total: Number(totals[0]?.n ?? 0),
        items: rows.map((row) => ({ ...mapLicense(row), activeSeats: Number(row.active_seats ?? 0) })),
      };
    },

    async updateLicense(id, patch) {
      const fields = [];
      const params = [];
      const set = (column, value) => {
        fields.push(`${column} = ?`);
        params.push(value);
      };
      if (patch.plan !== undefined) set('plan', patch.plan);
      if (patch.seats !== undefined) set('seats', patch.seats);
      if (patch.status !== undefined) set('status', patch.status);
      if (patch.expiresAt !== undefined) set('expires_at', toMysqlDate(patch.expiresAt));
      if (patch.note !== undefined) set('note', patch.note);
      if (patch.customerEmail !== undefined) set('customer_email', patch.customerEmail);
      if (!fields.length) return store.getLicense(id);
      params.push(id);
      await execute(`UPDATE licenses SET ${fields.join(', ')} WHERE id = ?`, params);
      return store.getLicense(id);
    },

    async findActivation(licenseId, installId) {
      const rows = await query(
        'SELECT * FROM activations WHERE license_id = ? AND install_id = ? LIMIT 1',
        [licenseId, installId],
      );
      return mapActivation(rows[0]);
    },

    async getActivation(id) {
      const rows = await query('SELECT * FROM activations WHERE id = ? LIMIT 1', [id]);
      return mapActivation(rows[0]);
    },

    async createActivation(data) {
      const firstSeen = data.firstSeen ?? data.lastSeen ?? Date.now();
      const result = await execute(
        `INSERT INTO activations (license_id, install_id, device_name, platform, app_version,
           first_seen, last_seen, ip_hash, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          data.licenseId,
          data.installId,
          data.deviceName ?? null,
          data.platform ?? null,
          data.appVersion ?? null,
          toMysqlDate(firstSeen),
          toMysqlDate(data.lastSeen ?? firstSeen),
          data.ipHash ?? null,
        ],
      );
      return store.getActivation(result.insertId);
    },

    async updateActivation(id, patch) {
      const fields = [];
      const params = [];
      const set = (column, value) => {
        fields.push(`${column} = ?`);
        params.push(value);
      };
      if (patch.lastSeen !== undefined) set('last_seen', toMysqlDate(patch.lastSeen));
      if (patch.deviceName !== undefined) set('device_name', patch.deviceName);
      if (patch.platform !== undefined) set('platform', patch.platform);
      if (patch.appVersion !== undefined) set('app_version', patch.appVersion);
      if (patch.ipHash !== undefined) set('ip_hash', patch.ipHash);
      if (patch.revokedAt !== undefined) set('revoked_at', toMysqlDate(patch.revokedAt));
      if (!fields.length) return store.getActivation(id);
      params.push(id);
      await execute(`UPDATE activations SET ${fields.join(', ')} WHERE id = ?`, params);
      return store.getActivation(id);
    },

    async deleteActivation(id) {
      const result = await execute('DELETE FROM activations WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },

    async deleteLicense(id) {
      // Activations and events are removed by ON DELETE CASCADE.
      const result = await execute('DELETE FROM licenses WHERE id = ?', [Number(id)]);
      return result.affectedRows > 0;
    },

    async deleteActivationsForLicense(licenseId) {
      const result = await execute('DELETE FROM activations WHERE license_id = ?', [licenseId]);
      return result.affectedRows;
    },

    async listActivations(licenseId) {
      const rows = await query(
        'SELECT * FROM activations WHERE license_id = ? ORDER BY last_seen DESC, id DESC',
        [licenseId],
      );
      return rows.map(mapActivation);
    },

    async countActiveActivations(licenseId) {
      const rows = await query(
        'SELECT COUNT(*) AS n FROM activations WHERE license_id = ? AND revoked_at IS NULL',
        [licenseId],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async logEvent(data) {
      await execute(
        `INSERT INTO license_events (license_id, activation_id, event, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          data.licenseId ?? null,
          data.activationId ?? null,
          data.event,
          data.detail ?? null,
          toMysqlDate(data.createdAt ?? Date.now()),
        ],
      );
    },

    async listEvents({ licenseId, limit = 50 } = {}) {
      const params = [];
      let whereSql = '';
      if (licenseId != null) {
        whereSql = 'WHERE e.license_id = ?';
        params.push(licenseId);
      }
      params.push(Number(limit));
      const rows = await query(
        `SELECT e.*, l.key_prefix, l.key_last4
         FROM license_events e
         LEFT JOIN licenses l ON l.id = e.license_id
         ${whereSql}
         ORDER BY e.id DESC
         LIMIT ?`,
        params,
      );
      return rows.map(mapEvent);
    },

    async countAdminUsers() {
      const rows = await query('SELECT COUNT(*) AS n FROM admin_users');
      return Number(rows[0]?.n ?? 0);
    },

    async createAdminUser(data) {
      const result = await execute(
        `INSERT INTO admin_users (email, password_hash, totp_secret, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          String(data.email).toLowerCase(),
          data.passwordHash,
          data.totpSecret ?? null,
          data.role ?? 'admin',
          toMysqlDate(data.createdAt ?? Date.now()),
        ],
      );
      return store.getAdminUser(result.insertId);
    },

    async findAdminByEmail(email) {
      const rows = await query('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [
        String(email).toLowerCase(),
      ]);
      return mapAdmin(rows[0]);
    },

    async getAdminUser(id) {
      const rows = await query('SELECT * FROM admin_users WHERE id = ? LIMIT 1', [id]);
      return mapAdmin(rows[0]);
    },

    async updateAdminUser(id, patch) {
      const fields = [];
      const params = [];
      const set = (column, value) => {
        fields.push(`${column} = ?`);
        params.push(value);
      };
      if (patch.passwordHash !== undefined) set('password_hash', patch.passwordHash);
      if (patch.totpSecret !== undefined) set('totp_secret', patch.totpSecret);
      if (patch.role !== undefined) set('role', patch.role);
      if (!fields.length) return store.getAdminUser(id);
      params.push(id);
      await execute(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`, params);
      return store.getAdminUser(id);
    },

    async listAdminUsers(limit = 50) {
      const rows = await query('SELECT * FROM admin_users ORDER BY id ASC LIMIT ?', [
        Math.max(1, Number(limit) || 50),
      ]);
      return rows.map(mapAdmin);
    },

    async createPasskey(data) {
      const result = await execute(
        `INSERT INTO admin_passkeys (user_id, credential_id, public_key, counter, transports, created_at, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(data.userId),
          String(data.credentialId),
          String(data.publicKey),
          Number(data.counter ?? 0),
          data.transports ?? null,
          toMysqlDate(data.createdAt ?? Date.now()),
          toMysqlDate(data.lastUsed ?? null),
        ],
      );
      const rows = await query('SELECT * FROM admin_passkeys WHERE id = ? LIMIT 1', [result.insertId]);
      return mapPasskey(rows[0]);
    },

    async listPasskeysByUser(userId) {
      const rows = await query(
        'SELECT * FROM admin_passkeys WHERE user_id = ? ORDER BY created_at ASC, id ASC',
        [Number(userId)],
      );
      return rows.map(mapPasskey);
    },

    async findPasskeyByCredentialId(credentialId) {
      const rows = await query('SELECT * FROM admin_passkeys WHERE credential_id = ? LIMIT 1', [
        String(credentialId),
      ]);
      return mapPasskey(rows[0]);
    },

    async countPasskeys(userId = null) {
      const params = [];
      let whereSql = '';
      if (userId != null) {
        whereSql = 'WHERE user_id = ?';
        params.push(Number(userId));
      }
      const rows = await query(`SELECT COUNT(*) AS n FROM admin_passkeys ${whereSql}`, params);
      return Number(rows[0]?.n ?? 0);
    },

    async updatePasskeyCounter(id, counter, lastUsed = Date.now()) {
      await execute('UPDATE admin_passkeys SET counter = ?, last_used = ? WHERE id = ?', [
        Number(counter),
        toMysqlDate(lastUsed),
        Number(id),
      ]);
      const rows = await query('SELECT * FROM admin_passkeys WHERE id = ? LIMIT 1', [Number(id)]);
      return mapPasskey(rows[0]);
    },

    async deletePasskey(id, userId = null) {
      const params = [Number(id)];
      let sql = 'DELETE FROM admin_passkeys WHERE id = ?';
      if (userId != null) {
        sql += ' AND user_id = ?';
        params.push(Number(userId));
      }
      const result = await execute(sql, params);
      return result.affectedRows > 0;
    },

    async createSession(data) {
      const result = await execute(
        `INSERT INTO admin_sessions (user_id, token_hash, csrf, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          data.userId,
          data.tokenHash,
          data.csrf,
          toMysqlDate(data.expiresAt),
          toMysqlDate(data.createdAt ?? Date.now()),
        ],
      );
      const rows = await query('SELECT * FROM admin_sessions WHERE id = ? LIMIT 1', [result.insertId]);
      const row = rows[0];
      return row
        ? {
            id: Number(row.id),
            userId: Number(row.user_id),
            tokenHash: row.token_hash,
            csrf: row.csrf,
            expiresAt: fromMysqlDate(row.expires_at),
            createdAt: fromMysqlDate(row.created_at),
          }
        : null;
    },

    async findSession(tokenHash) {
      const rows = await query('SELECT * FROM admin_sessions WHERE token_hash = ? LIMIT 1', [tokenHash]);
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        userId: Number(row.user_id),
        tokenHash: row.token_hash,
        csrf: row.csrf,
        expiresAt: fromMysqlDate(row.expires_at),
        createdAt: fromMysqlDate(row.created_at),
      };
    },

    async deleteSession(tokenHash) {
      await execute('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
    },

    async deleteExpiredSessions(nowMs = Date.now()) {
      await execute('DELETE FROM admin_sessions WHERE expires_at <= ?', [toMysqlDate(nowMs)]);
    },

    async stats(nowMs = Date.now()) {
      const rows = await query(
        `SELECT
           (SELECT COUNT(*) FROM licenses) AS lic_total,
           (SELECT COUNT(*) FROM licenses WHERE status = 'active') AS lic_active,
           (SELECT COUNT(*) FROM licenses WHERE status = 'revoked') AS lic_revoked,
           (SELECT COUNT(*) FROM licenses WHERE status = 'active' AND expires_at IS NOT NULL
              AND expires_at > ? AND expires_at <= ?) AS lic_soon,
           (SELECT COUNT(*) FROM activations) AS act_total,
           (SELECT COUNT(*) FROM activations WHERE revoked_at IS NULL) AS act_active`,
        [toMysqlDate(nowMs), toMysqlDate(nowMs + 30 * 86400000)],
      );
      const row = rows[0] ?? {};
      return {
        licenses: Number(row.lic_total ?? 0),
        active: Number(row.lic_active ?? 0),
        revoked: Number(row.lic_revoked ?? 0),
        expiringSoon: Number(row.lic_soon ?? 0),
        activations: Number(row.act_total ?? 0),
        activeActivations: Number(row.act_active ?? 0),
      };
    },
  };

  return { store, pool, migrate };
}
