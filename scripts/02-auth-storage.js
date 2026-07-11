const Storage = {
  lastError: null,

  reportError(operation, key, error) {
    this.lastError = {
      operation,
      key,
      message: error instanceof Error ? error.message : String(error || "Storage error"),
      at: Utils?.nowISO?.() || new Date().toISOString()
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("budget:storage-error", { detail: this.lastError }));
    }
  },

  read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      this.reportError("read", key, error);
      return fallback;
    }
  },

  readText(key, fallback = "") {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (error) {
      this.reportError("read", key, error);
      return fallback;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      this.reportError("write", key, error);
      return false;
    }
  },

  writeText(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (error) {
      this.reportError("write", key, error);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      this.reportError("remove", key, error);
      return false;
    }
  },

  cacheKey(login) {
    return `${CONFIG.CACHE_PREFIX}${login || "guest"}`;
  },

  loadCache(login) {
    if (isLocalTestLogin(login)) {
      // Demo-account is a fully isolated seeded sandbox.
      // We always load a fresh demo snapshot so user data can never bleed into it.
      return buildLocalTestData();
    }
    const data = normalizeData(this.read(this.cacheKey(login), defaultData()));
    return data;
  },

  saveCache(login, data) {
    return this.write(this.cacheKey(login), normalizeData(data));
  },

  loadSession() {
    const session = this.read(CONFIG.SESSION_KEY, null);
    if (!session?.login || !session?.expiresAt || !session?.lastActivityAt) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    if (!session?.localOnly && !session?.token) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    return session;
  },

  saveSession(session) {
    this.write(CONFIG.SESSION_KEY, session);
    return session;
  },

  clearSession() {
    this.remove(CONFIG.SESSION_KEY);
  },

  pendingKey(login) {
    return `${CONFIG.QUEUE_PREFIX}${login || "unknown"}`;
  },

  loadPending(login = (typeof Auth !== "undefined" ? Auth.getLogin() : null)) {
    const current = login ? this.read(this.pendingKey(login), null) : null;
    if (current) {
      return current;
    }
    const legacy = this.read(CONFIG.LEGACY_QUEUE_KEY, null);
    if (!legacy || (login && legacy.login !== login)) {
      return null;
    }
    const migrated = {
      ...legacy,
      operationId: legacy.operationId || Utils.uid("sync"),
      baseRevision: Number.isSafeInteger(Number(legacy.baseRevision)) ? Number(legacy.baseRevision) : 0
    };
    if (migrated.login && this.write(this.pendingKey(migrated.login), migrated)) {
      this.remove(CONFIG.LEGACY_QUEUE_KEY);
    }
    return migrated;
  },

  savePending(payload) {
    return payload?.login ? this.write(this.pendingKey(payload.login), payload) : false;
  },

  clearPending(login = (typeof Auth !== "undefined" ? Auth.getLogin() : null)) {
    return login ? this.remove(this.pendingKey(login)) : false;
  },

  loadLastSync(login) {
    return this.read(`${CONFIG.LAST_SYNC_PREFIX}${login}`, null);
  },

  saveLastSync(login, value) {
    return this.write(`${CONFIG.LAST_SYNC_PREFIX}${login}`, value);
  },

  loadRevision(login) {
    const revision = Number(this.readText(`${CONFIG.REVISION_PREFIX}${login}`, "0"));
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
  },

  saveRevision(login, revision) {
    const value = Number(revision);
    if (!login || !Number.isSafeInteger(value) || value < 0) {
      return false;
    }
    return this.writeText(`${CONFIG.REVISION_PREFIX}${login}`, String(value));
  }
};

const Auth = {
  session: null,
  activityBound: false,
  activityTimer: null,
  lastPersistAt: 0,
  lastServerTouchAt: 0,

  getIdleTimeoutMs() {
    return Math.max(1, Number(CONFIG.SESSION_IDLE_MINUTES) || 30) * 60 * 1000;
  },

  isSessionExpired(session = this.session) {
    if (!session?.expiresAt) {
      return true;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  },

  bindActivityTracking() {
    if (this.activityBound || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const passiveListener = { passive: true };
    const markActivity = () => this.recordActivity();
    const markImmediate = () => this.recordActivity(true);

    ["pointerdown", "mousedown", "touchstart", "wheel"].forEach((eventName) => {
      window.addEventListener(eventName, markActivity, passiveListener);
    });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markImmediate);
    window.addEventListener("pagehide", () => this.persistSession(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.persistSession(true);
        return;
      }
      if (this.isSessionExpired()) {
        this.handleSessionExpired();
        return;
      }
      markImmediate();
    });

    this.activityBound = true;
  },

  persistSession(force = false) {
    if (!this.session) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastPersistAt < CONFIG.SESSION_ACTIVITY_THROTTLE_MS) {
      return;
    }
    Storage.saveSession(this.session);
    this.lastPersistAt = now;
  },

  scheduleExpiryCheck() {
    clearTimeout(this.activityTimer);
    if (!this.session) {
      this.activityTimer = null;
      return;
    }
    const expiresAt = Date.parse(this.session.expiresAt);
    const delay = !Number.isFinite(expiresAt)
      ? 250
      : Math.max(250, expiresAt - Date.now());
    this.activityTimer = setTimeout(() => this.handleSessionExpired(), delay + 50);
  },

  async init() {
    this.bindActivityTracking();
    const session = Storage.loadSession();
    if (!session) {
      this.session = null;
      return;
    }
    this.session = session;
    this.lastPersistAt = 0;
    this.scheduleExpiryCheck();
  },

  isAuthenticated() {
    return Boolean(this.session?.login && this.session?.token && !this.session?.localOnly);
  },

  hasSession() {
    return Boolean(this.session?.login);
  },

  isLocalOnly() {
    return Boolean(this.session?.login && this.session?.localOnly);
  },

  getLogin() {
    return this.session?.login || null;
  },

  getToken() {
    return this.session?.token || null;
  },

  getExpiry() {
    return this.session?.expiresAt || null;
  },

  getSessionAgeMs() {
    const lastActivityAt = Date.parse(this.session?.lastActivityAt || 0);
    if (!Number.isFinite(lastActivityAt)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, Date.now() - lastActivityAt);
  },

  async setSession(login, token, { localOnly = false, sessionId = "", serverExpiresAt = 0, idleTimeoutMs = 0 } = {}) {
    const now = Date.now();
    const idleMs = Math.max(1, Number(idleTimeoutMs) || this.getIdleTimeoutMs());
    const absoluteExpiry = Number(serverExpiresAt);
    const localExpiry = now + idleMs;
    this.session = {
      login,
      token,
      localOnly,
      sessionId: String(sessionId || ""),
      serverExpiresAt: Number.isFinite(absoluteExpiry) ? absoluteExpiry : 0,
      lastActivityAt: new Date(now).toISOString(),
      expiresAt: new Date(Number.isFinite(absoluteExpiry) && absoluteExpiry > 0 ? Math.min(localExpiry, absoluteExpiry) : localExpiry).toISOString()
    };
    this.persistSession(true);
    this.syncPendingToken();
    this.scheduleExpiryCheck();
  },

  syncPendingToken() {
    if (!this.session?.login || !this.session?.token || this.session?.localOnly) {
      return;
    }
    const pending = Storage.loadPending(this.session.login);
    if (!pending || pending.login !== this.session.login) {
      return;
    }
    pending.token = this.session.token;
    Storage.savePending(pending);
  },

  touchSession(forcePersist = false) {
    if (!this.session) {
      return;
    }
    const now = Date.now();
    this.session.lastActivityAt = new Date(now).toISOString();
    const localExpiry = now + this.getIdleTimeoutMs();
    const serverExpiry = Number(this.session.serverExpiresAt);
    this.session.expiresAt = new Date(Number.isFinite(serverExpiry) && serverExpiry > 0 ? Math.min(localExpiry, serverExpiry) : localExpiry).toISOString();
    this.persistSession(forcePersist);
    this.scheduleExpiryCheck();
  },

  recordActivity(force = false) {
    if (!this.session) {
      return;
    }
    if (this.isSessionExpired()) {
      this.handleSessionExpired();
      return;
    }
    const lastActivityAt = Date.parse(this.session.lastActivityAt || 0);
    if (!force && Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt < CONFIG.SESSION_ACTIVITY_THROTTLE_MS) {
      return;
    }
    this.touchSession(force);
    const now = Date.now();
    if (
      !this.session?.localOnly &&
      navigator.onLine !== false &&
      now - this.lastServerTouchAt >= CONFIG.SESSION_SERVER_TOUCH_MS
    ) {
      this.lastServerTouchAt = now;
      void Api.touchSession(this.session.login, this.session.token).catch(() => {
        // The next authenticated load or sync surfaces revoked and expired sessions.
      });
    }
  },

  handleSessionExpired() {
    if (!this.session) {
      return;
    }
    if (!this.isSessionExpired()) {
      this.scheduleExpiryCheck();
      return;
    }
    const login = this.getLogin();
    const token = this.getToken();
    const localOnly = this.isLocalOnly();
    this.clearSession({ preservePending: true });
    if (typeof App !== "undefined" && typeof App.handleSessionExpired === "function") {
      App.handleSessionExpired({
        login,
        token,
        localOnly,
        isLocalTest: localOnly && isLocalTestLogin(login)
      });
    }
  },

  clearSession({ preservePending = true } = {}) {
    const login = this.getLogin();
    this.session = null;
    this.lastServerTouchAt = 0;
    clearTimeout(this.activityTimer);
    this.activityTimer = null;
    Storage.clearSession();
    if (!preservePending) {
      const pending = Storage.loadPending(login);
      if (pending?.login === login) {
        Storage.clearPending(login);
      }
    }
  }
};

