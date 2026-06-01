const Sync = {
  status: "local",
  isSyncing: false,
  lastSyncedAt: null,
  lastError: "",
  timer: null,
  retryTimer: null,
  retryAttempt: 0,

  init() {
    if (Auth.isAuthenticated()) {
      this.lastSyncedAt = Storage.loadLastSync(Auth.getLogin());
      this.lastError = "";
      this.status = navigator.onLine ? "synced" : "offline";
    } else if (Auth.isLocalOnly()) {
      this.lastSyncedAt = null;
      this.lastError = "";
      this.status = "local";
    } else {
      this.lastError = "";
      this.status = "local";
    }
    window.addEventListener("online", () => {
      if (Auth.isAuthenticated()) {
        this.retryAttempt = 0;
        this.processQueue(true);
      } else {
        this.lastError = "";
        this.status = "local";
        UI.renderSyncState();
      }
    });
    window.addEventListener("offline", () => {
      this.lastError = "Нет подключения к интернету";
      this.status = Auth.isAuthenticated() ? "offline" : "local";
      UI.renderSyncState();
    });
  },

  clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  },

  scheduleRetry() {
    if (!Auth.isAuthenticated()) {
      return;
    }
    const backoff = [1500, 4000, 9000, 20000];
    this.retryAttempt = Math.min(this.retryAttempt + 1, backoff.length);
    const delay = backoff[this.retryAttempt - 1];
    this.clearRetry();
    this.retryTimer = setTimeout(() => this.processQueue(true), delay);
  },

  hasPendingChanges(login = Auth.getLogin()) {
    const pending = Storage.loadPending();
    return Boolean(login && pending?.login === login);
  },

  queueSync() {
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    Storage.savePending({
      login: Auth.getLogin(),
      token: Auth.getToken(),
      updatedAt: Utils.nowISO(),
      data: normalizeData(Store.data)
    });
    this.lastError = "";
    this.retryAttempt = 0;
    this.clearRetry();
    this.status = navigator.onLine ? "syncing" : "offline";
    UI.renderSyncState();
    clearTimeout(this.timer);
    if (navigator.onLine) {
      this.timer = setTimeout(() => this.processQueue(), 800);
    }
  },

  async processQueue(forceProbe = false) {
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    const pending = Storage.loadPending();
    if (!pending || pending.login !== Auth.getLogin()) {
      this.lastError = "";
      this.retryAttempt = 0;
      this.clearRetry();
      this.status = "synced";
      UI.renderSyncState();
      return;
    }
    if (!navigator.onLine) {
      this.lastError = "Нет подключения к интернету";
      this.status = "offline";
      UI.renderSyncState();
      return;
    }
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    this.status = "syncing";
    UI.renderSyncState();

    try {
      if (forceProbe) {
        const probe = await Api.probeConnection();
        if (!probe.ok) {
          throw Api.createError(probe.code, probe.message);
        }
      }
      await Api.save(pending.login, pending.token, pending.data);
      const latest = Storage.loadPending();
      const savedCurrentPending = latest?.login === pending.login && latest?.updatedAt === pending.updatedAt;
      const hasQueuedFollowUp = latest?.login === pending.login && !savedCurrentPending;
      if (savedCurrentPending) {
        Storage.clearPending();
      }
      Auth.touchSession();
      this.retryAttempt = 0;
      this.clearRetry();
      this.lastSyncedAt = Utils.nowISO();
      Storage.saveLastSync(Auth.getLogin(), this.lastSyncedAt);
      this.lastError = "";
      if (hasQueuedFollowUp) {
        this.status = "syncing";
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.processQueue(), 120);
      } else {
        this.status = "synced";
      }
    } catch (error) {
      this.lastError = Api.getFriendlyMessage(error, "Не удалось синхронизировать изменения");
      if (Api.isAuthSessionError(error)) {
        let sessionStillValid = false;
        try {
          sessionStillValid = await Api.confirmSession(pending.login, pending.token);
        } catch (confirmError) {
          this.lastError = Api.getFriendlyMessage(confirmError, this.lastError);
          Diagnostics.report("sync:session-confirm-failed", {
            code: confirmError?.code || null,
            message: this.lastError
          }, String(confirmError?.code || "").startsWith("HTTP_4") ? "warning" : "error");
          if (Api.isRetryable(confirmError)) {
            this.scheduleRetry();
            this.status = ["OFFLINE", "NETWORK_UNAVAILABLE", "TIMEOUT"].includes(confirmError?.code)
              ? "offline"
              : "error";
            return;
          }
        }

        if (sessionStillValid) {
          this.lastError = "Облако еще подтверждает новую сессию. Повторяем синхронизацию автоматически.";
          this.status = "syncing";
          Diagnostics.report("sync:session-confirmed", {
            login: pending.login,
            forceProbe
          }, "warning");
          this.scheduleRetry();
          return;
        }

        const freshSession = typeof Auth.getSessionAgeMs === "function" && Auth.getSessionAgeMs() <= 15000;
        if (freshSession) {
          this.lastError = "Новая сессия еще подтверждается облаком. Повторяем синхронизацию автоматически.";
          this.status = "syncing";
          Diagnostics.report("sync:session-fresh-retry", {
            login: pending.login,
            forceProbe,
            sessionAgeMs: Auth.getSessionAgeMs()
          }, "warning");
          this.scheduleRetry();
          return;
        }

        this.status = "error";
        this.isSyncing = false;
        UI.renderSyncState();
        if (typeof App !== "undefined" && typeof App.handleRemoteSessionInvalid === "function") {
          App.handleRemoteSessionInvalid({
            message: "Сессия аккаунта истекла или больше не действует. Войдите снова, чтобы продолжить синхронизацию."
          });
        }
        return;
      }
      Diagnostics.report("sync:failed", {
        code: error?.code || null,
        message: this.lastError,
        forceProbe
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      if (Api.isRetryable(error)) {
        this.scheduleRetry();
      }
      this.status = ["OFFLINE", "NETWORK_UNAVAILABLE", "TIMEOUT"].includes(error?.code) ? "offline" : "error";
    } finally {
      this.isSyncing = false;
      UI.renderSyncState();
    }
  }
};

