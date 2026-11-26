// In-Memory-Store fuer Tests und lokale Laeufe (DB_DRIVER=memory).
// Zeitwerte sind durchgehend Epoch-Millisekunden (UTC).

export function createMemoryStore() {
  const state = {
    licenses: new Map(),
    activations: new Map(),
    events: [],
    adminUsers: new Map(),
    sessions: new Map(),
    passkeys: new Map(),
  };
  const seq = { license: 0, activation: 0, event: 0, admin: 0, session: 0, passkey: 0 };
  const copy = (row) => (row ? { ...row } : null);

  return {
    kind: 'memory',

    async init() {},
    async close() {},

    async createLicense(data) {
      seq.license += 1;
      const row = {
        id: seq.license,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        keyLast4: data.keyLast4,
        plan: data.plan ?? 'standard',
        seats: data.seats ?? 1,
        status: 'active',
        expiresAt: data.expiresAt ?? null,
        note: data.note ?? null,
        customerEmail: data.customerEmail ?? null,
        createdAt: data.createdAt ?? Date.now(),
      };
      state.licenses.set(row.id, row);
      return copy(row);
    },

    async getLicense(id) {
      return copy(state.licenses.get(Number(id)));
    },

    async findLicenseByKeyHash(hash) {
      for (const row of state.licenses.values()) if (row.keyHash === hash) return copy(row);
      return null;
    },

    async listLicenses({ q = '', limit = 50, offset = 0 } = {}) {
      const needle = String(q ?? '').trim().toLowerCase();
      let rows = [...state.licenses.values()];
      if (needle) {
        rows = rows.filter((row) =>
          [row.keyPrefix, row.keyLast4, row.note ?? '', row.customerEmail ?? '', row.plan, String(row.id)]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );
      }
      rows.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
      const total = rows.length;
      const items = rows.slice(offset, offset + limit).map((row) => ({
        ...row,
        activeSeats: [...state.activations.values()].filter(
          (a) => a.licenseId === row.id && !a.revokedAt,
        ).length,
      }));
      return { items, total };
    },

    async updateLicense(id, patch) {
      const row = state.licenses.get(Number(id));
      if (!row) return null;
      Object.assign(row, patch);
      return copy(row);
    },

    async findActivation(licenseId, installId) {
      for (const row of state.activations.values()) {
        if (row.licenseId === Number(licenseId) && row.installId === installId) return copy(row);
      }
      return null;
    },

    async getActivation(id) {
      return copy(state.activations.get(Number(id)));
    },

    async createActivation(data) {
      seq.activation += 1;
      const now = data.firstSeen ?? Date.now();
      const row = {
        id: seq.activation,
        licenseId: Number(data.licenseId),
        installId: data.installId,
        deviceName: data.deviceName ?? null,
        platform: data.platform ?? null,
        appVersion: data.appVersion ?? null,
        firstSeen: now,
        lastSeen: data.lastSeen ?? now,
        ipHash: data.ipHash ?? null,
        revokedAt: null,
      };
      state.activations.set(row.id, row);
      return copy(row);
    },

    async updateActivation(id, patch) {
      const row = state.activations.get(Number(id));
      if (!row) return null;
      Object.assign(row, patch);
      return copy(row);
    },

    async deleteActivation(id) {
      return state.activations.delete(Number(id));
    },

    async deleteLicense(id) {
      const key = Number(id);
      if (!state.licenses.has(key)) return false;
      for (const [aid, row] of [...state.activations.entries()]) {
        if (row.licenseId === key) state.activations.delete(aid);
      }
      state.events = state.events.filter((e) => e.licenseId !== key);
      return state.licenses.delete(key);
    },

    async deleteActivationsForLicense(licenseId) {
      let removed = 0;
      for (const [key, row] of [...state.activations.entries()]) {
        if (row.licenseId === Number(licenseId)) {
          state.activations.delete(key);
          removed += 1;
        }
      }
      return removed;
    },

    async listActivations(licenseId) {
      return [...state.activations.values()]
        .filter((row) => row.licenseId === Number(licenseId))
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .map(copy);
    },

    async countActiveActivations(licenseId) {
      let count = 0;
      for (const row of state.activations.values()) {
        if (row.licenseId === Number(licenseId) && !row.revokedAt) count += 1;
      }
      return count;
    },

    async logEvent(data) {
      seq.event += 1;
      const row = {
        id: seq.event,
        licenseId: data.licenseId == null ? null : Number(data.licenseId),
        activationId: data.activationId == null ? null : Number(data.activationId),
        event: data.event,
        detail: data.detail ?? null,
        createdAt: data.createdAt ?? Date.now(),
      };
      state.events.push(row);
      return copy(row);
    },

    async listEvents({ licenseId, limit = 50 } = {}) {
      let rows = state.events;
      if (licenseId != null) rows = rows.filter((row) => row.licenseId === Number(licenseId));
      rows = [...rows].sort((a, b) => b.id - a.id).slice(0, limit);
      return rows.map((row) => {
        const license = row.licenseId == null ? null : state.licenses.get(row.licenseId);
        return {
          ...copy(row),
          keyPrefix: license?.keyPrefix ?? null,
          keyLast4: license?.keyLast4 ?? null,
        };
      });
    },

    async countAdminUsers() {
      return state.adminUsers.size;
    },

    async createAdminUser(data) {
      seq.admin += 1;
      const row = {
        id: seq.admin,
        email: String(data.email).toLowerCase(),
        passwordHash: data.passwordHash,
        totpSecret: data.totpSecret ?? null,
        role: data.role ?? 'admin',
        createdAt: data.createdAt ?? Date.now(),
      };
      state.adminUsers.set(row.id, row);
      return copy(row);
    },

    async findAdminByEmail(email) {
      const needle = String(email).toLowerCase();
      for (const row of state.adminUsers.values()) if (row.email === needle) return copy(row);
      return null;
    },

    async getAdminUser(id) {
      return copy(state.adminUsers.get(Number(id)));
    },

    async listAdminUsers(limit = 50) {
      return [...state.adminUsers.values()]
        .sort((a, b) => a.id - b.id)
        .slice(0, Math.max(1, Number(limit) || 50))
        .map(copy);
    },

    async createPasskey(data) {
      seq.passkey += 1;
      const row = {
        id: seq.passkey,
        userId: Number(data.userId),
        credentialId: String(data.credentialId),
        publicKey: String(data.publicKey),
        counter: Number(data.counter ?? 0),
        transports: data.transports ?? null,
        createdAt: data.createdAt ?? Date.now(),
        lastUsed: data.lastUsed ?? null,
      };
      state.passkeys.set(row.id, row);
      return copy(row);
    },

    async listPasskeysByUser(userId) {
      return [...state.passkeys.values()]
        .filter((row) => row.userId === Number(userId))
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
        .map(copy);
    },

    async findPasskeyByCredentialId(credentialId) {
      const needle = String(credentialId ?? '');
      for (const row of state.passkeys.values()) {
        if (row.credentialId === needle) return copy(row);
      }
      return null;
    },

    async countPasskeys(userId = null) {
      if (userId == null) return state.passkeys.size;
      let n = 0;
      for (const row of state.passkeys.values()) if (row.userId === Number(userId)) n += 1;
      return n;
    },

    async updatePasskeyCounter(id, counter, lastUsed = Date.now()) {
      const row = state.passkeys.get(Number(id));
      if (!row) return null;
      row.counter = Number(counter);
      row.lastUsed = lastUsed;
      return copy(row);
    },

    async deletePasskey(id, userId = null) {
      const row = state.passkeys.get(Number(id));
      if (!row) return false;
      if (userId != null && row.userId !== Number(userId)) return false;
      return state.passkeys.delete(Number(id));
    },

    async updateAdminUser(id, patch) {
      const row = state.adminUsers.get(Number(id));
      if (!row) return null;
      Object.assign(row, patch);
      return copy(row);
    },

    async createSession(data) {
      seq.session += 1;
      const row = {
        id: seq.session,
        userId: Number(data.userId),
        tokenHash: data.tokenHash,
        csrf: data.csrf,
        expiresAt: data.expiresAt,
        createdAt: data.createdAt ?? Date.now(),
      };
      state.sessions.set(row.id, row);
      return copy(row);
    },

    async findSession(tokenHash) {
      for (const row of state.sessions.values()) if (row.tokenHash === tokenHash) return copy(row);
      return null;
    },

    async deleteSession(tokenHash) {
      for (const [key, row] of [...state.sessions.entries()]) {
        if (row.tokenHash === tokenHash) state.sessions.delete(key);
      }
    },

    async deleteExpiredSessions(nowMs = Date.now()) {
      for (const [key, row] of [...state.sessions.entries()]) {
        if (row.expiresAt <= nowMs) state.sessions.delete(key);
      }
    },

    async stats(nowMs = Date.now()) {
      const licenses = [...state.licenses.values()];
      const activations = [...state.activations.values()];
      const soon = nowMs + 30 * 86400000;
      return {
        licenses: licenses.length,
        active: licenses.filter((row) => row.status === 'active').length,
        revoked: licenses.filter((row) => row.status === 'revoked').length,
        expiringSoon: licenses.filter(
          (row) => row.status === 'active' && row.expiresAt && row.expiresAt > nowMs && row.expiresAt <= soon,
        ).length,
        activations: activations.length,
        activeActivations: activations.filter((row) => !row.revokedAt).length,
      };
    },
  };
}
