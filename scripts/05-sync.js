const Sync = {
  status: "local",
  isSyncing: false,
  lastSyncedAt: null,
  lastError: "",
  timer: null,
  retryTimer: null,
  retryAttempt: 0,
  conflictOpen: false,

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
    const pending = Storage.loadPending(login);
    return Boolean(login && pending?.login === login);
  },

  queueSync() {
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    const existing = Storage.loadPending(Auth.getLogin());
    const payload = {
      login: Auth.getLogin(),
      token: Auth.getToken(),
      operationId: existing?.login === Auth.getLogin() ? existing.operationId : Utils.uid("sync"),
      baseRevision: existing?.login === Auth.getLogin()
        ? Number(existing.baseRevision) || 0
        : Store.remoteRevision,
      updatedAt: Utils.nowISO(),
      data: normalizeData(Store.data)
    };
    if (!Storage.savePending(payload)) {
      this.lastError = "Браузер не смог сохранить очередь синхронизации. Сразу экспортируйте резервную копию.";
      this.status = "error";
      UI.renderSyncState();
      UI.toast?.(this.lastError, "error");
      return;
    }
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

  async processQueue(forceProbe = false, lockAcquired = false) {
    if (!lockAcquired && navigator.locks?.request && Auth.getLogin()) {
      return navigator.locks.request(`budget-sync-${Auth.getLogin()}`, () => this.processQueue(forceProbe, true));
    }
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    const pending = Storage.loadPending(Auth.getLogin());
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
      const saveResult = await Api.save(
        pending.login,
        Auth.getToken(),
        pending.data,
        Number(pending.baseRevision) || 0
      );
      const latest = Storage.loadPending(pending.login);
      const savedCurrentPending = latest?.login === pending.login && latest?.operationId === pending.operationId && latest?.updatedAt === pending.updatedAt;
      const hasQueuedFollowUp = latest?.login === pending.login && !savedCurrentPending;
      if (savedCurrentPending) {
        Storage.clearPending(pending.login);
      }
      Store.remoteRevision = Number(saveResult?.revision) || (Number(pending.baseRevision) + 1);
      Storage.saveRevision(pending.login, Store.remoteRevision);
      if (hasQueuedFollowUp) {
        Storage.savePending({
          ...latest,
          token: Auth.getToken(),
          baseRevision: Store.remoteRevision
        });
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
      const serverCode = String(error?.payload?.code || "");
      if (serverCode === "REVISION_CONFLICT") {
        this.status = "conflict";
        this.clearRetry();
        if (!this.conflictOpen && typeof App?.handleSyncConflict === "function") {
          this.conflictOpen = true;
          try {
            await App.handleSyncConflict({ pending, error });
          } finally {
            this.conflictOpen = false;
          }
        }
        return;
      }
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

