const App = {
  runAfterNextPaint(callback, frames = 2) {
    if (typeof callback !== "function") {
      return;
    }
    const step = (remaining) => {
      if (remaining <= 0) {
        callback();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(Math.max(0, Number(frames) || 0));
  },

  async init() {
    UI.init();
    await Auth.init();
    Sync.init();
    try {
      const savedTab = sessionStorage.getItem("activeTab");
      if (["overviewTab", "analyticsTab", "monthsTab", "settingsTab"].includes(savedTab)) {
        Store.activeTab = savedTab;
      }
      const savedQuickMode = sessionStorage.getItem("settingsQuickMode");
      if (savedQuickMode) {
        UI.settingsQuickMode = normalizeSettingsQuickMode(savedQuickMode);
      }
    } catch {}
    if (Utils.$("dateInput")) {
      Utils.$("dateInput").value = Utils.todayISO();
    }
    if (Utils.$("editDateInput")) {
      Utils.$("editDateInput").value = Utils.todayISO();
    }
    if (Utils.$("templateTypeInput")) {
      Utils.$("templateTypeInput").value = "expense";
    }

    if (Auth.hasSession()) {
      Store.loadLocal(Auth.getLogin());
      Store.resetHistory();
      UI.showApp();
      UI.renderApp();
      UI.finishBoot();
      if (Auth.isAuthenticated()) {
        if (navigator.onLine) {
          await Api.probeConnection();
        }
        await this.loadRemoteIntoStore({ silent: true, mergeGuest: false });
        if (Storage.loadPending()?.login === Auth.getLogin()) {
          Sync.processQueue(true);
        }
      }
    } else {
      Store.loadLocal(null);
      Store.resetHistory();
      UI.showStartupAuth();
      UI.finishBoot();
    }
  },

  switchTab(tabId) {
    if (!["overviewTab", "analyticsTab", "monthsTab", "settingsTab"].includes(tabId)) {
      return;
    }
    Store.activeTab = tabId;
    try {
      sessionStorage.setItem("activeTab", tabId);
    } catch {}
    UI.setMobileDrawerOpen(false);
    UI.setMobileQuickAddOpen(false);
    UI.renderTabs();
    UI.renderActiveTabContent(tabId);
    UI.renderHistoryState();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        UI.updateScrollTopButton();
      });
    }
  },

  addBudgetQuickRow(section = "expenses") {
    const safeSection = ["incomes", "debts", "recurring", "expenses", "wishlist"].includes(section) ? section : "expenses";
    this.switchTab("overviewTab");
    Store.addSectionRow(safeSection);
    UI.setMobileQuickAddOpen(false);
    UI.toast("Новая строка добавлена", "info");
    App.runAfterNextPaint(() => {
      const sectionRoots = {
        incomes: "incomesList",
        debts: "debtsList",
        recurring: "recurringBudgetList",
        expenses: "expensesList",
        wishlist: "wishList"
      };
      const row = Utils.$(sectionRoots[safeSection])?.lastElementChild;
      row?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }, 2);
  },

  openAccountEntry() {
    if (Auth.hasSession()) {
      this.renderAccountMenu();
      UI.openModal("accountMenuModal");
      return;
    }
    UI.clearAuthStatus("modal");
    UI.clearAuthFieldError(Utils.$("modalLogin"));
    UI.clearAuthFieldError(Utils.$("modalPassword"));
    UI.openModal("authModal");
  },

  renderAccountMenu() {
    const title = Utils.$("accountMenuTitle");
    const subtext = Utils.$("accountMenuSubtext");
    const state = Utils.$("accountMenuState");
    const passwordHint = Utils.$("accountPasswordHint");
    const identity = Utils.$("accountMenuIdentity");
    const meta = Utils.$("accountMenuMeta");
    const avatar = Utils.$("accountMenuAvatar");
    const status = Utils.$("accountMenuStatus");
    const source = Utils.$("accountMenuSource");
    const cloud = Utils.$("accountMenuCloud");
    const pending = Utils.$("accountMenuPending");
    const lastSync = Utils.$("accountMenuLastSync");
    const login = Auth.getLogin();
    const isLocalOnly = Auth.isLocalOnly();
    const isLocalTest = isLocalOnly && isLocalTestLogin(login);
    const hasPending = !isLocalOnly && Sync.hasPendingChanges(login);
    let statusTone = "is-local";
    let statusLabel = "На устройстве";
    let subtextValue = "Бюджет хранится только на этом устройстве.";
    let metaValue = "Бюджет пока живет только на этом устройстве";
    let stateValue = "Сейчас главным источником остается это устройство. Подключите аккаунт, если нужен один и тот же бюджет на компьютере и телефоне.";
    let passwordHintValue = "Для локальной сессии отдельный пароль не нужен.";
    let sourceValue = "Это устройство";
    let cloudValue = "Не используется";
    let pendingValue = "Нет";
    let lastSyncValue = "—";

    if (isLocalTest) {
      statusLabel = "Демо";
      subtextValue = "Демо доступно только в этом браузере.";
      metaValue = "Демо-данные живут отдельно от вашего аккаунта";
      stateValue = "Это отдельная демонстрационная среда. Ее данные не отправляются в облако и не попадут в ваш рабочий бюджет.";
    } else if (!isLocalOnly) {
      subtextValue = Auth.getExpiry()
        ? `Аккаунт активен до ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Auth.getExpiry()))}.`
        : "Аккаунт подключен в этом браузере.";
      metaValue = "Аккаунт подключен и готов к синхронизации";
      passwordHintValue = "Смену пароля добавим чуть позже.";
      sourceValue = "Аккаунт";
      pendingValue = hasPending ? "Есть изменения" : "Нет";
      lastSyncValue = Sync.lastSyncedAt ? Utils.timeSince(Sync.lastSyncedAt) : "Еще не было";
      stateValue = Sync.status === "synced"
        ? (hasPending
          ? "На этом устройстве есть новые изменения. Мы уже держим их в очереди и скоро отправим в облако."
          : (Sync.lastSyncedAt
            ? `Все синхронизировано. Последняя синхронизация была ${Utils.timeSince(Sync.lastSyncedAt)}.`
            : "Аккаунт подключен. Бюджет уже синхронизирован с облаком."))
        : (Sync.status === "syncing"
          ? "Сейчас отправляем последние изменения в облако."
          : (Sync.status === "offline"
            ? "Связи с облаком сейчас нет. Новые изменения уже сохранены на устройстве и отправятся позже."
            : (Sync.status === "error"
              ? `Не получилось обновить облако: ${Sync.lastError || "данные на устройстве сохранены, но облако пока еще не обновилось."}`
              : "Аккаунт подключен. Сверяем данные с облаком.")));
      if (Sync.status === "syncing") {
        cloudValue = "Сверяем";
      } else if (Sync.status === "offline") {
        cloudValue = "Нет связи";
      } else if (Sync.status === "error") {
        cloudValue = "Есть сбой";
      } else if (Sync.status === "synced") {
        cloudValue = hasPending ? "Ждет отправки" : "В порядке";
      } else {
        cloudValue = "Подключено";
      }
    }

    if (title) {
      title.textContent = "Сессия и синхронизация";
    }
    if (subtext) {
      subtext.textContent = subtextValue;
    }
    if (identity) {
      identity.textContent = login || "Локальная сессия";
    }
    if (meta) {
      meta.textContent = metaValue;
    }
    if (avatar) {
      avatar.textContent = (login || "A").trim().charAt(0).toUpperCase() || "A";
    }
    if (state) {
      state.textContent = stateValue;
      if (!isLocalOnly) {
        if (Sync.status === "synced" && hasPending) {
          statusTone = "is-syncing";
          statusLabel = "Изменения";
        } else if (Sync.status === "synced") {
          statusTone = "is-synced";
          statusLabel = "В облаке";
        } else if (Sync.status === "syncing") {
          statusTone = "is-syncing";
          statusLabel = "Отправка";
        } else if (Sync.status === "offline") {
          statusTone = "is-offline";
          statusLabel = "Оффлайн";
        } else if (Sync.status === "error") {
          statusTone = "is-error";
          statusLabel = "Ошибка";
        }
      }
    }
    if (passwordHint) {
      passwordHint.textContent = passwordHintValue;
    }
    if (source) {
      source.textContent = sourceValue;
    }
    if (cloud) {
      cloud.textContent = cloudValue;
    }
    if (pending) {
      pending.textContent = pendingValue;
    }
    if (lastSync) {
      lastSync.textContent = lastSyncValue;
    }
    if (status) {
      status.className = `account-menu__status ${statusTone}`;
      status.textContent = statusLabel;
    }
    Utils.$("accountSyncNowBtn")?.classList.toggle("is-hidden", isLocalOnly);
    Utils.$("accountPasswordInfoBtn")?.classList.toggle("is-hidden", isLocalOnly);
  },

  describeDataSource(data, fallbackLabel) {
    const summary = summarizeNormalizedData(normalizeData(data));
    if (!Object.values(summary).some((value) => Number(value) > 0)) {
      return `${fallbackLabel}: пока без записей`;
    }
    return `${fallbackLabel}: ${summary.months} мес. · ${summary.transactions} операций · ${summary.templates} сценариев · ${summary.favorites} избранных · ${summary.wishlist} целей`;
  },

  promptSyncChoice({ login, guestData, remoteData }) {
    const localSummary = Utils.$("syncChoiceLocalSummary");
    const cloudSummary = Utils.$("syncChoiceCloudSummary");
    const title = Utils.$("syncChoiceTitle");
    if (title) {
      title.textContent = `Данные для аккаунта ${login}`;
    }
    if (localSummary) {
      localSummary.textContent = this.describeDataSource(guestData, "Данные на устройстве");
    }
    if (cloudSummary) {
      cloudSummary.textContent = this.describeDataSource(remoteData, "Данные в аккаунте");
    }

    return new Promise((resolve) => {
      UI.syncChoiceResolver = resolve;
      UI.openModal("syncChoiceModal");
    });
  },

  resolveSyncChoice(choice) {
    if (typeof UI.syncChoiceResolver === "function") {
      UI.syncChoiceResolver(choice);
    }
    UI.syncChoiceResolver = null;
    UI.closeModal("syncChoiceModal");
  },

  async applyAuthenticatedData(data, {
    clearGuest = false,
    syncUp = false,
    toastMessage = "",
    toastTone = "success"
  } = {}) {
    Store.setData(data, { save: true });
    Store.resetHistory();
    Auth.touchSession();
    Sync.retryAttempt = 0;
    Sync.clearRetry();
    Sync.lastError = "";
    if (clearGuest) {
      Storage.saveCache(null, defaultData());
    }
    UI.showApp();
    UI.renderApp();

    if (syncUp) {
      Sync.queueSync();
      App.runAfterNextPaint(() => Sync.processQueue(true), 2);
    } else {
      Sync.lastSyncedAt = Utils.nowISO();
      Storage.saveLastSync(Auth.getLogin(), Sync.lastSyncedAt);
      Sync.status = Auth.isAuthenticated() ? "synced" : "local";
      UI.renderSyncState();
    }

    if (toastMessage) {
      UI.toast(toastMessage, toastTone);
    }
  },

  async resolveAuthenticatedDataFlow({ mode, ignoreGuest = false }) {
    const login = Auth.getLogin();
    if (!login) {
      return;
    }
    const guestData = normalizeData(ignoreGuest ? defaultData() : Storage.loadCache(null));
    const localAccount = normalizeData(Storage.loadCache(login));
    const remoteRaw = await Api.load(login, Auth.getToken());
    const remoteData = normalizeData(remoteRaw);
    const hasGuest = hasMeaningfulData(guestData);
    const hasRemote = hasMeaningfulData(remoteData);

    if (!hasGuest) {
      const sameAsRemote = isSemanticallySameData(remoteData, localAccount);
      const nextData = sameAsRemote
        ? remoteData
        : mergeData(remoteRaw, localAccount);
      await this.applyAuthenticatedData(nextData, {
        clearGuest: false,
        syncUp: !sameAsRemote,
        toastMessage: sameAsRemote
          ? "Аккаунт подключен. Бюджет синхронизирован из облака"
          : "Аккаунт подключен. Данные на устройстве синхронизированы с облаком"
      });
      return;
    }

    if (!hasRemote || mode === "register") {
      await this.applyAuthenticatedData(guestData, {
        clearGuest: true,
        syncUp: true,
        toastMessage: "Аккаунт подключен. Данные с устройства синхронизированы с облаком"
      });
      return;
    }

    if (isSemanticallySameData(guestData, remoteData)) {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: true,
        syncUp: false,
        toastMessage: "Аккаунт подключен. Данные уже синхронизированы"
      });
      return;
    }

    const choice = await this.promptSyncChoice({ login, guestData, remoteData });
    if (choice === "local") {
      await this.applyAuthenticatedData(guestData, {
        clearGuest: true,
        syncUp: true,
        toastMessage: "Оставили данные с устройства и синхронизировали их с облаком"
      });
      return;
    }
    if (choice === "cloud") {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: true,
        syncUp: false,
        toastMessage: "Данные на устройстве синхронизированы с аккаунтом"
      });
      return;
    }

    Auth.clearSession();
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";
    Store.setData(guestData, { save: false });
    Store.saveLocal();
    Store.resetHistory();
    UI.showApp();
    UI.renderApp();
    UI.toast("Вход отменен. Продолжаем работу с данными на этом устройстве.", "info");
  },

  async authenticate(source, mode) {
    const loginField = source === "startup" ? Utils.$("startupLogin") : Utils.$("modalLogin");
    const passwordField = source === "startup" ? Utils.$("startupPassword") : Utils.$("modalPassword");
    const actionButton = source === "startup"
      ? (mode === "login" ? Utils.$("startupLoginBtn") : Utils.$("startupRegisterBtn"))
      : (mode === "login" ? Utils.$("modalLoginBtn") : Utils.$("modalRegisterBtn"));

    UI.clearAuthStatus(source);
    UI.clearAuthFieldError(loginField);
    UI.clearAuthFieldError(passwordField);

    const login = loginField.value.trim();
    const password = passwordField.value.trim();
    const previousLocalOnly = Auth.isLocalOnly();
    const afterLocalTestLogout = (() => {
      try {
        return sessionStorage.getItem(LOCAL_TEST_EXIT_FLAG) === "1";
      } catch {
        return false;
      }
    })();
    if (!login || !password) {
      if (!login) {
        UI.markAuthFieldInvalid(loginField);
      }
      if (!password) {
        UI.markAuthFieldInvalid(passwordField);
      }
      UI.shakeAuthCard(source);
      UI.setAuthStatus(source, "Введите логин и пароль.", "error");
      (login ? passwordField : loginField)?.focus?.();
      UI.toast("Введите логин и пароль", "warning");
      return;
    }

    if (mode === "login" && login === LOCAL_TEST_CREDENTIALS.login && password === LOCAL_TEST_CREDENTIALS.password) {
      Storage.saveCache(login, buildLocalTestData());
      await Auth.setSession(login, "", { localOnly: true });
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
      Store.loadLocal(login);
      Store.resetHistory();
      clearTimeout(Sync.timer);
      Sync.clearRetry();
      Sync.retryAttempt = 0;
      Sync.status = "local";
      Sync.lastSyncedAt = null;
      Sync.lastError = "";
      UI.showApp();
      UI.renderApp();
      if (source === "modal") {
        UI.closeModal("authModal");
      }
      passwordField.value = "";
      UI.syncAuthFieldState(passwordField);
      UI.clearAuthStatus(source);
      return;
    }

    UI.setAuthButtonLoading(actionButton, true, mode);
    UI.setAuthStatus(source, mode === "login" ? "Проверяем данные..." : "Создаем аккаунт...", "info");

    try {
      const probe = await Api.probeConnection();
      if (!probe.ok) {
        throw Api.createError(probe.code, probe.message);
      }
      let response;
      if (mode === "login") {
        response = await Api.login(login, password);
      } else {
        response = await Api.register(login, password);
      }
      await Auth.setSession(login, response.token);

      if (previousLocalOnly) {
        Storage.clearPending();
        Storage.remove(Storage.cacheKey(LOCAL_TEST_CREDENTIALS.login));
        Storage.saveCache(null, defaultData());
      }
      if (afterLocalTestLogout) {
        Storage.remove(Storage.cacheKey(LOCAL_TEST_CREDENTIALS.login));
        Storage.saveCache(null, defaultData());
      }

      const appShell = Utils.$("appShell");
      const appShellHidden = !appShell || appShell.classList.contains("is-hidden");
      if (previousLocalOnly || appShellHidden) {
        Store.loadLocal(login);
      }

      await this.resolveAuthenticatedDataFlow({ mode, ignoreGuest: previousLocalOnly || afterLocalTestLogout });
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}

      if (source === "modal") {
        UI.closeModal("authModal");
      }

      if (source === "startup") {
        Utils.$("startupPassword").value = "";
        UI.syncAuthFieldState(Utils.$("startupPassword"));
      } else {
        Utils.$("modalPassword").value = "";
        UI.syncAuthFieldState(Utils.$("modalPassword"));
      }
      UI.clearAuthStatus(source);
    } catch (error) {
      if (Auth.hasSession()) {
        UI.showApp();
        UI.renderDataState();
      }
      UI.markAuthFieldInvalid(passwordField);
      UI.shakeAuthCard(source);
      const message = Api.getFriendlyMessage(error, mode === "login" ? "Не удалось войти" : "Не удалось создать аккаунт");
      UI.setAuthStatus(source, message, "error");
      Diagnostics.report("auth:failed", {
        source,
        mode,
        code: error?.code || null,
        message,
        online: navigator.onLine
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      UI.toast(message, "error");
    } finally {
      UI.setAuthButtonLoading(actionButton, false, mode);
    }
  },

  async loadRemoteIntoStore({ silent = false, mergeGuest = false } = {}) {
    const login = Auth.getLogin();
    if (!login) {
      return;
    }
    const localAccount = Storage.loadCache(login);
    const guestCache = mergeGuest ? Storage.loadCache(null) : defaultData();
    const working = mergeGuest ? mergeData(localAccount, guestCache) : localAccount;
    Store.setData(working, { save: true });
    UI.renderApp();

    try {
      const remoteRaw = await Api.load(login, Auth.getToken());
      const remoteData = normalizeData(remoteRaw);
      const merged = isSemanticallySameData(remoteData, working)
        ? remoteData
        : mergeData(remoteData, working);
      Store.setData(merged, { save: true });
      Store.resetHistory();
      Auth.touchSession();
      Sync.retryAttempt = 0;
      Sync.clearRetry();
      Sync.lastSyncedAt = Utils.nowISO();
      Sync.lastError = "";
      Storage.saveLastSync(login, Sync.lastSyncedAt);
      Sync.status = "synced";
      UI.showApp();
      UI.renderApp();
      if (mergeGuest) {
        Storage.saveCache(null, defaultData());
      }
      if (!silent) {
        UI.toast("Аккаунт подключен. Бюджет синхронизирован из облака", "success");
      }

      if (!isSemanticallySameData(remoteData, merged)) {
        Sync.queueSync();
        await Sync.processQueue(true);
      }
    } catch (error) {
      if (Api.isAuthSessionError(error)) {
        this.handleRemoteSessionInvalid({
          message: "Сессия аккаунта завершилась. Войдите снова, чтобы продолжить работу с облаком."
        });
        return;
      }
      const message = Api.getFriendlyMessage(error, "Не удалось загрузить данные аккаунта");
      Sync.lastError = message;
      Sync.status = ["OFFLINE", "NETWORK_UNAVAILABLE", "TIMEOUT"].includes(error?.code) ? "offline" : "error";
      Diagnostics.report("remote-load:failed", {
        code: error?.code || null,
        message,
        silent,
        mergeGuest
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      UI.renderSyncState();
      UI.showApp();
      UI.renderApp();
      if (!silent) {
        const toastType = Sync.status === "offline" ? "warning" : "error";
        UI.toast(`${message}. Продолжаем работать с данными на устройстве`, toastType);
        }
      }
    },

  handleRemoteSessionInvalid({ message = "Сессия аккаунта завершилась. Войдите снова." } = {}) {
    const login = Auth.getLogin();
    const wasLocalTest = Auth.isLocalOnly() && isLocalTestLogin(login);
    UI.closeModal("accountMenuModal");
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";

    if (!wasLocalTest) {
      Storage.saveCache(null, normalizeData(Store.data));
    } else if (login) {
      Storage.remove(Storage.cacheKey(login));
    }

    Auth.clearSession({ preservePending: true });
    Store.loadLocal(null);
    Store.resetHistory();
    UI.showStartupAuth();
    UI.toast(message, "warning");
  },

  handleSessionExpired({ login, token = "", localOnly = false, isLocalTest = false } = {}) {
    UI.closeModal("accountMenuModal");
    if (!localOnly && login && token && navigator.onLine) {
      Api.logout(login, token).catch(() => {});
    }
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";

    if (!isLocalTest) {
      Storage.saveCache(null, normalizeData(Store.data));
    } else if (login) {
      Storage.remove(Storage.cacheKey(login));
    }

    if (isLocalTest) {
      try {
        sessionStorage.setItem(LOCAL_TEST_EXIT_FLAG, "1");
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
    }

    Store.loadLocal(null);
    Store.resetHistory();
    UI.showStartupAuth();
    UI.toast("Сессия завершена после 30 минут бездействия. Войдите снова.", "warning");
  },

  logout() {
    UI.closeModal("accountMenuModal");
    const previousLogin = Auth.getLogin();
    const previousToken = Auth.getToken();
    const wasLocalTest = Auth.isLocalOnly() && isLocalTestLogin(previousLogin);
    if (Auth.isAuthenticated() && previousLogin && previousToken && navigator.onLine) {
      Api.logout(previousLogin, previousToken).catch(() => {});
    }
    Auth.clearSession();
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";
    if (wasLocalTest) {
      Storage.remove(Storage.cacheKey(previousLogin));
      try {
        sessionStorage.setItem(LOCAL_TEST_EXIT_FLAG, "1");
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
    }
    Store.loadLocal(null);
    Store.resetHistory();
    UI.showStartupAuth();
    UI.toast("Сессия завершена.", "info");
  },

  async syncNow() {
    UI.closeModal("accountMenuModal");
    if (!Auth.isAuthenticated()) {
      UI.toast("Сначала подключите аккаунт", "warning");
      return;
    }
    Sync.queueSync();
    UI.toast("Проверяем данные и отправляем изменения в облако", "info");
    await Sync.processQueue(true);
    if (Sync.status === "synced" && !Sync.lastError) {
      UI.toast("Данные синхронизированы", "success");
      return;
    }
    if (Sync.status === "offline") {
      UI.toast("Сейчас нет связи с облаком. Изменения сохранены на этом устройстве и отправятся позже.", "warning");
      return;
    }
    if (Sync.status === "error") {
      UI.toast(Sync.lastError || "Не получилось обновить облако. Данные на устройстве сохранены.", "error");
    }
  },

  undo() {
    const changed = Store.undo();
    if (!changed) {
      UI.toast("Больше нечего отменять", "info");
    }
  },

  redo() {
    const changed = Store.redo();
    if (!changed) {
      UI.toast("Больше нечего возвращать", "info");
    }
  },

  toggleTheme() {
    const nextTheme = Store.data.profile.theme === "dark" ? "light" : "dark";
    if (Store.data.profile.theme === nextTheme) {
      return;
    }
    Store.data.profile.theme = nextTheme;
    Store.data.meta.updatedAt = Utils.nowISO();
    Store.saveLocal();
    if (Auth.isAuthenticated()) {
      Sync.queueSync();
    }
    UI.applyTheme();
    if (Store.activeTab === "analyticsTab") {
      UI.ensureChartsReady().then(() => {
        if (Store.activeTab === "analyticsTab") {
          UI.renderCharts();
        }
      }).catch(() => {});
      return;
    }
    if (Store.activeTab === "overviewTab") {
      UI.ensureChartsReady().then(() => {
        if (Store.activeTab === "overviewTab") {
          UI.renderMonthBalanceChart();
        }
      }).catch(() => {});
    }
  },

  shiftMonth(delta) {
    const [year, month] = Store.viewMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    Store.viewMonth = Utils.monthKey(next);
    Store.detailMonth = Store.viewMonth;
    UI.heatmapMonth = Store.viewMonth;
    UI.renderApp();
  },

  goToCurrentMonth() {
    Store.viewMonth = Utils.monthKey(new Date());
    Store.detailMonth = Store.viewMonth;
    UI.heatmapMonth = Store.viewMonth;
    UI.renderApp();
  },

  updateMonthStart(value) {
    Store.saveMonthMeta(Store.viewMonth, {
      start: Utils.parseSignedAmount(value)
    });
    UI.renderApp();
  },

  toggleManualMonthStart(enabled) {
    const current = Store.getMonthMeta(Store.viewMonth);
    const stats = Store.statsForMonth(Store.viewMonth);
    Store.saveMonthMeta(Store.viewMonth, {
      manualStart: Boolean(enabled),
      start: enabled && Utils.roundMoney(current.start || 0) === 0 ? stats.startBalance : current.start
    });
    UI.renderApp();
  },

  openMonth(monthKey) {
    Store.detailMonth = monthKey;
    if (Store.activeTab === "monthsTab") {
      document.querySelectorAll("[data-action='open-month'][data-month]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.month === monthKey);
      });
      UI.runPanelTransition(Utils.$("monthDetail"), () => {
        UI.renderMonthDetail();
      });
      return;
    }
    UI.renderApp();
  },

  shiftHeatmapMonth(delta) {
    if (!delta) {
      return;
    }
    const base = UI.heatmapMonth || Store.viewMonth;
    const [year, month] = base.split("-").map(Number);
    UI.heatmapMonth = Utils.monthKey(new Date(year, month - 1 + delta, 1));
    UI.runPanelTransition(Utils.$("heatmapWrap"), () => {
      UI.renderHeatmap();
      UI.syncAnalyticsPairLayouts();
    });
  },

  setBudgetFiltersCollapsed(collapsed) {
    const nextValue = Boolean(collapsed);
    UI.budgetFiltersCollapsed = nextValue;
    Storage.writeText(CONFIG.BUDGET_FILTERS_KEY, nextValue ? "1" : "0");
  },

  applyBudgetNavigationState({
    month = Store.viewMonth,
    filters = {},
    collapsed = true
  } = {}) {
    Store.viewMonth = month;
    Object.assign(Store.filters, {
      period: "all",
      type: "all",
      categoryId: "all",
      sort: "date-desc",
      search: "",
      dateFrom: "",
      dateTo: "",
      ...filters
    });
    this.setBudgetFiltersCollapsed(collapsed);
  },

  focusBudgetFilterShell({ selectSearch = true } = {}) {
    const filterShell = Utils.$("budgetFilterShell");
    const searchInput = Utils.$("searchInput");
    filterShell?.scrollIntoView({ behavior: this.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    filterShell?.classList.add("is-target");
    setTimeout(() => filterShell?.classList.remove("is-target"), 1800);
    if (selectSearch && searchInput) {
      try {
        searchInput.focus({ preventScroll: true });
      } catch {
        searchInput.focus();
      }
      searchInput.select?.();
    }
  },

  highlightBudgetRow(transactionId) {
    const row = document.querySelector(`.entry-row[data-entry-id="${transactionId}"]`);
    if (!row) {
      return;
    }
    row.scrollIntoView({ behavior: this.prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    row.classList.add("is-budget-target");
    setTimeout(() => row.classList.remove("is-budget-target"), 1800);
  },

  openRecurringInBudget(query) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      return;
    }
    this.applyBudgetNavigationState({
      filters: {
        period: "all",
        type: "expense",
        search: normalizedQuery
      },
      collapsed: false
    });
    this.switchTab("overviewTab");
    this.runAfterNextPaint(() => this.focusBudgetFilterShell(), 3);
  },

  openTransactionInBudget(transactionId) {
    const transaction = Store.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }
    this.applyBudgetNavigationState({
      month: transaction.date.slice(0, 7),
      filters: {
        period: "month",
        type: "all"
      },
      collapsed: true
    });
    this.switchTab("overviewTab");
    this.runAfterNextPaint(() => this.highlightBudgetRow(transactionId), 3);
  },

  updateFilter(field, value) {
    Store.filters[field] = value;
    if ((field === "search" && String(value || "").trim()) || (field === "dateFrom" && value) || (field === "dateTo" && value)) {
      this.setBudgetFiltersCollapsed(false);
    }
    if (field === "period" || field === "type" || field === "categoryId" || field === "sort" || field === "search" || field === "dateFrom" || field === "dateTo") {
      UI.renderTransactions();
      UI.renderBudgetFilters();
    }
  },

  openPicker(kind, context = null) {
    UI.pickerState.kind = kind;
    UI.pickerState.context = context;
    UI.pickerState.ids = kind === "category" && context?.selectedId ? new Set([context.selectedId]) : new Set();
    UI.renderPicker();
    UI.openModal("pickerModal");
  },

  openEditFormCategoryPicker() {
    const type = document.querySelector('input[name="editTransactionType"]:checked')?.value || "expense";
    this.openPicker("category", {
      target: "edit-form",
      type,
      selectedId: Utils.$("editCategoryInput")?.value || ""
    });
  },

  openTemplateFormCategoryPicker() {
    const type = Utils.$("templateTypeInput")?.value || "expense";
    this.openPicker("category", {
      target: "template-form",
      type,
      selectedId: Utils.$("templateCategoryInput")?.value || ""
    });
  },

  togglePickerItem(itemId) {
    if (!UI.pickerState.kind) {
      return;
    }
    if (UI.pickerState.kind === "category") {
      UI.pickerState.ids = new Set([itemId]);
      UI.renderPicker();
      return;
    }
    if (UI.pickerState.ids.has(itemId)) {
      UI.pickerState.ids.delete(itemId);
    } else {
      UI.pickerState.ids.add(itemId);
    }
    UI.renderPicker();
  },

  applyPickerSelection() {
    const ids = Array.from(UI.pickerState.ids);
    if (!ids.length) {
      UI.toast("Сначала выберите хотя бы один элемент", "warning");
      return;
    }
    if (UI.pickerState.kind === "category") {
      const selectedId = ids[0];
      const context = UI.pickerState.context || {};
      if (!Store.getCategory(selectedId)) {
        UI.toast("Категория не найдена", "warning");
        return;
      }
      if (context.target === "transaction-row" && context.transactionId) {
        Store.updateTransactionInline(context.transactionId, { categoryId: selectedId });
      } else if (context.target === "template-setting" && context.id) {
        const current = Store.data.settings.templates.find((item) => item.id === context.id);
        if (current) {
          Store.saveTemplate({
            id: current.id,
            kind: "template",
            bucket: current.bucket,
            desc: current.desc,
            amount: current.amount,
            type: current.type,
            categoryId: selectedId,
            flowKind: current.flowKind || "recurring"
          });
        }
      } else if (context.target === "favorite-setting" && context.id) {
        const current = Store.data.settings.favorites.find((item) => item.id === context.id);
        if (current) {
          Store.saveTemplate({
            id: current.id,
            kind: "favorite",
            desc: current.desc,
            amount: current.amount,
            type: "expense",
            categoryId: selectedId,
            flowKind: current.flowKind || "standard"
          });
        }
      } else if (context.target === "edit-form") {
        Utils.$("editCategoryInput").value = selectedId;
        UI.setCategoryTrigger("editCategoryTriggerBtn", selectedId, "Категория");
      } else if (context.target === "template-form") {
        Utils.$("templateCategoryInput").value = selectedId;
        UI.setCategoryTrigger("templateCategoryTriggerBtn", selectedId, "Категория");
      } else if (context.target === "create-form") {
        Utils.$("categoryInput").value = selectedId;
      }
      UI.closeModal("pickerModal");
      return;
    }
    if (UI.pickerState.kind === "favorites") {
      Store.applyFavoriteSelection(ids);
      UI.toast("Избранные операции добавлены", "success");
    } else {
      const templateBucket = UI.pickerState.kind?.startsWith?.("templates-")
        ? UI.pickerState.kind.replace("templates-", "")
        : "recurring";
      const templateMeta = getTemplateBucketMeta(templateBucket);
      Store.applyTemplateSelection(ids, templateBucket);
      UI.toast(`${templateMeta.title} добавлены в бюджет`, "success");
    }
    UI.closeModal("pickerModal");
  },

  createQuickItem(kind) {
    this.openTemplateModal(null, normalizeSettingsQuickMode(kind));
  },

  handleJournalAction(button) {
    const action = button.dataset.journalAction;
    const id = button.dataset.id;
    const section = button.dataset.section;
    const sortSection = button.dataset.sectionSortBtn;
    if (action === "toggle-section-sort" && sortSection) {
      UI.toggleJournalSectionSort(sortSection);
      return;
    }
    if (action === "add-row" && section) {
      Store.addSectionRow(section);
      UI.toast("Новая строка добавлена", "info");
      return;
    }
    if (action === "delete" && id) {
      this.deleteTransaction(id);
      return;
    }
    if (action === "template" && id) {
      const templateBucket = button.dataset.templateBucket || Store.getTemplateBucketForTransaction(Store.data.transactions.find((item) => item.id === id));
      const templateMeta = getTemplateBucketMeta(templateBucket);
      const isTemplate = Store.isTemplateTransaction(id, templateBucket);
      const changed = isTemplate
        ? Store.removeTemplateFromTransaction(id, templateBucket)
        : Store.addTemplateFromTransaction(id, templateBucket);
      UI.toast(
        isTemplate
          ? (changed ? `${templateMeta.itemLabel} удален из шаблонов` : "Шаблон уже был удален")
          : (changed ? `${templateMeta.itemLabel} добавлен в шаблоны` : "Такой шаблон уже существует"),
        changed ? "success" : "info"
      );
      return;
    }
    if (action === "favorite" && id) {
      const isFavorite = Store.isFavoriteTransaction(id);
      const changed = isFavorite
        ? Store.removeFavoriteFromTransaction(id)
        : Store.addFavoriteFromTransaction(id);
      UI.toast(
        isFavorite
          ? (changed ? "Операция удалена из избранного" : "Операция уже была удалена из избранного")
          : (changed ? "Операция добавлена в избранное" : "Такая операция уже есть в избранном"),
        changed ? "success" : "info"
      );
      return;
    }
    if (action === "pick-day" && id) {
      if (button instanceof HTMLElement) {
        UI.openBudgetDayPad(button);
      }
      return;
    }
    if (action === "open-category-picker" && id) {
      const transaction = Store.data.transactions.find((item) => item.id === id);
      if (!transaction) {
        return;
      }
      this.openPicker("category", {
        target: "transaction-row",
        transactionId: id,
        type: transaction.type,
        selectedId: transaction.categoryId
      });
      return;
    }
    if (action === "delete-wish" && id) {
      Store.deleteWishlistItem(id);
      UI.toast("Хотелка удалена", "info");
      return;
    }
    if (action === "fulfill-wish" && id) {
      Store.fulfillWishlistItem(id);
      UI.toast("Хотелка перенесена в расходы", "success");
    }
  },

  handleJournalField(field) {
    const row = field.closest("[data-entry-id]");
    if (!row) {
      return;
    }
    const itemId = row.dataset.entryId;
    const section = row.dataset.section;
    const kind = field.dataset.journalField;
    if (section === "wishlist") {
      if (kind === "wish-desc") {
        Store.updateWishlistItem(itemId, { desc: field.dataset.fulltext || field.value });
      }
      if (kind === "wish-amount") {
        Store.updateWishlistItem(itemId, { amount: Math.max(0, Utils.parseAmount(field.value)) });
      }
      return;
    }

    const transaction = Store.data.transactions.find((item) => item.id === itemId);
    if (!transaction) {
      return;
    }

    if (kind === "day") {
      const [year, month] = transaction.date.slice(0, 7).split("-").map(Number);
      const day = Utils.clampDay(year, month - 1, field.value);
      const nextDate = `${transaction.date.slice(0, 8)}${String(day).padStart(2, "0")}`;
      field.value = String(day);
      Store.updateTransactionInline(itemId, { date: nextDate });
      return;
    }
    if (kind === "date" && Utils.isISODate(field.value)) {
      const nextDate = field.value;
      const dayInput = row.querySelector('input[data-journal-field="day"]');
      if (dayInput instanceof HTMLInputElement) {
        dayInput.value = String(Number(nextDate.slice(-2)));
      }
      Store.updateTransactionInline(itemId, { date: nextDate });
      return;
    }
    if (kind === "amount") {
      Store.updateTransactionInline(itemId, { amount: Math.max(0, Utils.parseAmount(field.value)) });
      return;
    }
    if (kind === "description") {
      Store.updateTransactionInline(itemId, { description: field.dataset.fulltext || field.value });
      return;
    }
    if (kind === "categoryId" && Store.getCategory(field.value)) {
      Store.updateTransactionInline(itemId, { categoryId: field.value });
    }
  },

  handleSettingsAction(button) {
    const action = button.dataset.settingAction;
    const id = button.dataset.id;
    const mode = normalizeSettingsQuickMode(button.dataset.mode || "template-recurring");
    if (action === "edit-template" && id) {
      this.openTemplateModal(id, mode);
      return;
    }
    if (action === "edit-favorite" && id) {
      this.openTemplateModal(id, "favorite");
      return;
    }
    if (action === "delete-template" && id) {
      Store.deleteTemplate(id, "template");
      UI.setSettingsStatus("Шаблон удален.", "info");
      UI.toast("Шаблон удален", "info");
      return;
    }
    if (action === "delete-favorite" && id) {
      Store.deleteTemplate(id, "favorite");
      UI.setSettingsStatus("Элемент избранного удален.", "info");
      UI.toast("Избранное удалено", "info");
      return;
    }
    if (action === "pick-template-category" && id) {
      const current = Store.data.settings.templates.find((item) => item.id === id);
      if (!current) {
        return;
      }
      this.openPicker("category", {
        target: "template-setting",
        id,
        mode,
        type: current.type,
        selectedId: current.categoryId
      });
      return;
    }
    if (action === "pick-favorite-category" && id) {
      const current = Store.data.settings.favorites.find((item) => item.id === id);
      if (!current) {
        return;
      }
      this.openPicker("category", {
        target: "favorite-setting",
        id,
        type: "expense",
        selectedId: current.categoryId
      });
    }
  },

  handleSettingsField(field) {
    const id = field.dataset.id;
    if (!id) {
      return;
    }
    const kind = field.dataset.settingField;
    if (kind === "template-desc" || kind === "template-amount" || kind === "template-category") {
      const current = Store.data.settings.templates.find((item) => item.id === id);
      if (!current) {
        return;
      }
      Store.saveTemplate({
        id,
        kind: "template",
        bucket: current.bucket,
        desc: kind === "template-desc" ? (Utils.wrapText(field.dataset.fulltext || field.value) || "Новый шаблон") : current.desc,
        amount: kind === "template-amount" ? Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) : current.amount,
        type: current.type,
        categoryId: kind === "template-category" ? field.value : current.categoryId,
        flowKind: current.flowKind || "recurring"
      });
      return;
    }
    if (kind === "favorite-desc" || kind === "favorite-amount" || kind === "favorite-category") {
      const current = Store.data.settings.favorites.find((item) => item.id === id);
      if (!current) {
        return;
      }
      Store.saveTemplate({
        id,
        kind: "favorite",
        desc: kind === "favorite-desc" ? (Utils.wrapText(field.dataset.fulltext || field.value) || "Новая покупка") : current.desc,
        amount: kind === "favorite-amount" ? Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) : current.amount,
        type: "expense",
        categoryId: kind === "favorite-category" ? field.value : current.categoryId,
        flowKind: "standard"
      });
    }
  },

  reorderSection(section, draggedId, targetId) {
    Store.reorderSection(section, draggedId, targetId);
  },

  buildTransactionPayload(prefix = "") {
    const isEdit = prefix === "edit";
    if (!isEdit) {
      UI.mountTransactionForm();
    }
    const type = document.querySelector(`input[name="${isEdit ? "editTransactionType" : "transactionType"}"]:checked`)?.value || "expense";
    const amount = Utils.parseAmount(Utils.$(isEdit ? "editAmountInput" : "amountInput").value);
    const categoryId = Utils.$(isEdit ? "editCategoryInput" : "categoryInput").value;
    const flowKind = type === "income" ? "standard" : Utils.$(isEdit ? "editFlowKindInput" : "flowKindInput").value;
    const date = Utils.$(isEdit ? "editDateInput" : "dateInput").value;
    const description = Utils.wrapText(Utils.$(isEdit ? "editDescriptionInput" : "descriptionInput").value);

    if (!amount) {
      throw new Error("Введите корректную сумму");
    }
    if (!Utils.isISODate(date)) {
      throw new Error("Укажите корректную дату");
    }
    if (!Store.getCategory(categoryId)) {
      throw new Error("Выберите категорию");
    }

    return {
      type,
      flowKind,
      amount,
      categoryId,
      date,
      description
    };
  },

  createTransaction() {
    try {
      const form = UI.mountTransactionForm();
      const payload = this.buildTransactionPayload();
      Store.addTransaction(payload);
      form?.reset();
      Utils.$("dateInput").value = Utils.todayISO();
      document.querySelector('input[name="transactionType"][value="expense"]').checked = true;
      UI.renderFormCategories();
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      UI.toast("Операция сохранена", "success");
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  openEditTransaction(transactionId) {
    const transaction = Store.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }
    Utils.$("editTransactionId").value = transaction.id;
    const radio = document.querySelector(`input[name="editTransactionType"][value="${transaction.type}"]`);
    if (radio) {
      radio.checked = true;
    }
    Utils.$("editAmountInput").value = transaction.amount;
    Utils.$("editDateInput").value = transaction.date;
    Utils.$("editDescriptionInput").value = transaction.description;
    Utils.$("editFlowKindInput").value = transaction.flowKind;
    UI.renderEditCategories(transaction.categoryId, transaction.type);
    UI.openModal("transactionModal");
  },

  saveEditedTransaction() {
    try {
      const id = Utils.$("editTransactionId").value;
      const payload = this.buildTransactionPayload("edit");
      Store.updateTransaction(id, payload);
      UI.closeModal("transactionModal");
      UI.toast("Изменения сохранены", "success");
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  deleteTransaction(transactionId) {
    Store.deleteTransaction(transactionId);
    UI.toast("Операция удалена", "info");
  },

  openCategoryModal(categoryId = null) {
    const category = categoryId ? Store.getCategory(categoryId) : null;
    Utils.$("categoryModalTitle").textContent = category ? "Редактирование категории" : "Новая категория";
    Utils.$("categoryIdInput").value = category?.id || "";
    Utils.$("categoryNameInput").value = category?.name || "";
    Utils.$("categoryColorInput").value = category?.color || "#58a6ff";
    Utils.$("categoryLimitInput").value = category?.limit || "";
    document.querySelectorAll('input[name="categoryType"]').forEach((input) => {
      input.checked = input.value === (category?.type || "expense");
    });
    UI.renderCategoryColorValue();
    Utils.$("deleteCategoryBtn").classList.toggle("is-hidden", !category);
    UI.openModal("categoryModal");
  },

  saveCategory() {
    const id = Utils.$("categoryIdInput").value.trim();
    const name = Utils.wrapText(Utils.$("categoryNameInput").value).slice(0, 48);
    const type = document.querySelector('input[name="categoryType"]:checked')?.value || "expense";
    const color = Utils.$("categoryColorInput").value;
    const limit = Math.max(0, Utils.parseAmount(Utils.$("categoryLimitInput").value));
    if (!name) {
      UI.toast("Введите название категории", "warning");
      return;
    }
    const duplicate = Store.getCategories(type).some((category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== id);
    if (duplicate) {
      UI.toast("Категория с таким названием уже есть", "warning");
      return;
    }
    Store.saveCategory({ id, name, type, color, limit });
    UI.closeModal("categoryModal");
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  },

  deleteCurrentCategory() {
    const id = Utils.$("categoryIdInput").value;
    this.deleteCategory(id);
    UI.closeModal("categoryModal");
  },

  deleteCategory(categoryId) {
    try {
      Store.deleteCategory(categoryId);
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  openGoalModal(goalId = null) {
    const goal = goalId ? (Store.data.settings.goals || []).find((item) => item.id === goalId) : null;
    Utils.$("goalModalTitle").textContent = goal ? "Редактирование цели" : "Новая цель";
    Utils.$("goalIdInput").value = goal?.id || "";
    Utils.$("goalNameInput").value = goal?.name || "";
    Utils.$("goalTargetInput").value = goal?.target || "";
    Utils.$("goalModeInput").value = goal?.mode || "balance";
    Utils.$("goalSavedInput").value = goal?.saved || "";
    Utils.$("goalColorInput").value = goal?.color || "#58a6ff";
    Utils.$("goalNoteInput").value = goal?.note || "";
    Utils.$("deleteGoalBtn").classList.toggle("is-hidden", !goal);
    UI.renderGoalColorValue();
    UI.syncGoalModeFields();
    UI.openModal("goalModal");
  },

  saveGoal() {
    const id = Utils.$("goalIdInput").value.trim();
    const name = Utils.wrapText(Utils.$("goalNameInput").value).slice(0, 64);
    const target = Math.max(0, Utils.parseAmount(Utils.$("goalTargetInput").value));
    const mode = Utils.$("goalModeInput").value;
    const saved = Math.max(0, Utils.parseAmount(Utils.$("goalSavedInput").value));
    const color = Utils.$("goalColorInput").value;
    const note = Utils.wrapText(Utils.$("goalNoteInput").value).slice(0, 180);
    if (!name || !target) {
      UI.toast("Заполните цель корректно", "warning");
      return;
    }
    Store.saveGoal({ id, name, target, mode, saved, color, note });
    UI.closeModal("goalModal");
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    UI.toast("Цель сохранена", "success");
  },

  deleteCurrentGoal() {
    const id = Utils.$("goalIdInput").value.trim();
    if (!id) {
      return;
    }
    this.deleteGoal(id);
    UI.closeModal("goalModal");
  },

  deleteGoal(goalId) {
    Store.deleteGoal(goalId);
    UI.toast("Цель удалена", "info");
  },

  syncTemplateFormState(kind = Utils.$("templateKindInput")?.value || "template-recurring") {
    const mode = normalizeSettingsQuickMode(kind);
    const isFavorite = mode === "favorite";
    const templateBucket = getQuickTemplateBucket(mode);
    const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
    const typeField = Utils.$("templateTypeField");
    const flowField = Utils.$("templateFlowKindField");
    const typeInput = Utils.$("templateTypeInput");
    const flowInput = Utils.$("templateFlowKindInput");
    if (typeField) {
      typeField.classList.toggle("is-hidden", isFavorite || Boolean(templateMeta));
    }
    if (flowField) {
      flowField.classList.toggle("is-hidden", isFavorite || Boolean(templateMeta));
    }
    if (typeInput) {
      if (isFavorite) {
        typeInput.value = "expense";
      } else if (templateMeta) {
        typeInput.value = templateMeta.type;
      }
      typeInput.disabled = isFavorite || Boolean(templateMeta);
    }
    if (flowInput) {
      if (isFavorite) {
        flowInput.value = "standard";
      } else if (templateMeta) {
        flowInput.value = templateMeta.flowKind;
      }
      flowInput.disabled = isFavorite || Boolean(templateMeta);
    }
  },

  openTemplateModal(itemId = null, kind = "template-recurring") {
    const safeMode = kind === "favorite" ? "favorite" : normalizeSettingsQuickMode(kind);
    const safeKind = safeMode === "favorite" ? "favorite" : "template";
    const list = safeKind === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
    const current = itemId ? list.find((item) => item.id === itemId) : null;
    const currentMode = current && safeKind === "template"
      ? getTemplateBucketMeta(current.bucket, current.type, current.flowKind).quickMode
      : safeMode;
    const templateBucket = getQuickTemplateBucket(currentMode);
    const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
    const eyebrow = Utils.$("templateModal")?.querySelector(".eyebrow");
    Utils.$("templateForm").reset();
    Utils.$("templateIdInput").value = current?.id || "";
    Utils.$("templateKindInput").value = currentMode;
    if (eyebrow) {
      eyebrow.textContent = safeKind === "favorite" ? "Избранное" : (templateMeta?.title || "Шаблон");
    }
    Utils.$("templateModalTitle").textContent = safeKind === "favorite"
      ? (current ? "Редактирование избранного" : "Новая строка избранного")
      : (current ? `Редактирование: ${templateMeta?.itemLabel?.toLowerCase() || "шаблона"}` : (templateMeta?.createText || "Новый шаблон"));
    Utils.$("templateSubmitBtn").textContent = safeKind === "favorite"
      ? (current ? "Сохранить избранное" : "Добавить в избранное")
      : "Сохранить шаблон";
    Utils.$("templateDescInput").value = current?.desc || "";
    Utils.$("templateAmountInput").value = current?.amount || "";
    Utils.$("templateTypeInput").value = safeKind === "favorite"
      ? "expense"
      : (templateMeta?.type || current?.type || "expense");
    Utils.$("templateFlowKindInput").value = safeKind === "favorite"
      ? "standard"
      : (templateMeta?.flowKind || current?.flowKind || "recurring");
    Utils.$("templateCategoryInput").value = current?.categoryId || "";
    this.syncTemplateFormState(currentMode);
    UI.renderTemplateCategories(current?.categoryId || null);
    UI.openModal("templateModal");
  },

  saveTemplate() {
    const id = Utils.$("templateIdInput").value.trim();
    const mode = normalizeSettingsQuickMode(Utils.$("templateKindInput").value);
    const kind = mode === "favorite" ? "favorite" : "template";
    const templateBucket = getQuickTemplateBucket(mode);
    const list = kind === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
    const current = id ? list.find((item) => item.id === id) : null;
    const desc = Utils.wrapText(Utils.$("templateDescInput").value).slice(0, 180);
    const amount = Utils.parseAmount(Utils.$("templateAmountInput").value);
    const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
    const type = kind === "favorite" ? "expense" : (templateMeta?.type || Utils.$("templateTypeInput").value);
    const categoryId = Utils.$("templateCategoryInput").value;
    const flowKind = kind === "favorite"
      ? "standard"
      : (templateMeta?.flowKind || (type === "income" ? "standard" : Utils.$("templateFlowKindInput").value));
    if (!desc || !amount || !Store.getCategory(categoryId)) {
      UI.toast("Заполните шаблон корректно", "warning");
      return;
    }
    Store.saveTemplate({
      id: id || undefined,
      kind,
      bucket: kind === "template" ? templateBucket : undefined,
      desc,
      amount,
      type,
      categoryId,
      flowKind
    });
    UI.closeModal("templateModal");
    UI.toast(
      kind === "favorite"
        ? "Избранное сохранено"
        : `${templateMeta?.itemLabel || "Шаблон"} сохранен`,
      "success"
    );
  },

  applyTemplate(templateId) {
    Store.applyTemplate(templateId);
    UI.toast("Шаблон применен на сегодняшнюю дату", "success");
  },

  exportBackup() {
    UI.clearBackupStatus();
    const backup = Store.exportLegacyBackup();
    const sourceSummary = summarizeNormalizedData(Store.data);
    const roundtripSummary = summarizeNormalizedData(normalizeData(backup));
    const roundtripDiff = diffDataSummaries(sourceSummary, roundtripSummary);
    Diagnostics.report("export-backup:roundtrip", {
      source: sourceSummary,
      roundtrip: roundtripSummary,
      diff: roundtripDiff
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const profile = Auth.getLogin() || "local";
    link.download = `budget_${profile}_backup_${Utils.todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    UI.setBackupStatus("Резервная копия готова. Браузер уже начал скачивание.", "success");
    UI.toast("Резервная копия готова", "success");
  },

  getBackupErrorMessage(error) {
    if (error instanceof SyntaxError) {
      return "Файл бэкапа содержит некорректный JSON.";
    }
    return error instanceof Error ? error.message : "Не удалось прочитать бэкап.";
  },

  importBackup(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    UI.clearBackupStatus();
    const reader = new FileReader();
    reader.onerror = () => {
      Diagnostics.report("import-backup:file-read-error", {
        name: file.name,
        size: file.size
      }, "error");
      UI.setBackupStatus("Не получилось открыть файл резервной копии.", "error");
      UI.toast("Не получилось прочитать резервную копию", "error");
      event.target.value = "";
    };
    reader.onload = () => {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("Файл бэкапа прочитан в неподдерживаемом формате.");
        }
        const parsed = JSON.parse(reader.result);
        const audit = validateBackupPayload(parsed);
        Diagnostics.report("import-backup:file-selected", {
          file: {
            name: file.name,
            size: file.size
          },
          audit
        });
        Store.importBackup(parsed);
        UI.setBackupStatus("Резервная копия загружена. Бюджет уже на месте.", "success");
        UI.toast("Резервная копия загружена", "success");
      } catch (error) {
        const message = this.getBackupErrorMessage(error);
        Diagnostics.report("import-backup:failed", {
          file: {
            name: file.name,
            size: file.size
          },
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null
        }, "warning");
        UI.setBackupStatus(message, "error");
        UI.toast(message, "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }
};

const Diagnostics = {
  installed: false,
  events: [],
  maxEvents: 40,
  errorCount: 0,

  shouldLogToConsole(level = "info") {
    if (level === "error" || level === "warning") {
      return true;
    }
    try {
      return window.__BUDGET_DEBUG__ === true || localStorage.getItem("budgetDebug") === "1";
    } catch {
      return false;
    }
  },

  report(label, payload, level = "info") {
    const method = typeof console[level] === "function" ? level : "info";
    this.events.push({
      label,
      level,
      payload,
      at: Utils.nowISO()
    });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    if (level === "error") {
      this.errorCount += 1;
    }
    if (!this.shouldLogToConsole(level)) {
      return;
    }
    const lineDetails = payload && typeof payload === "object"
      ? Object.entries(payload)
        .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" | ")
      : String(payload ?? "");
    console[method](`[Budget Diagnostics] ${label}${lineDetails ? ` | ${lineDetails}` : ""}`);
    console.groupCollapsed(`[Budget Audit] ${label}`);
    console[method](payload);
    console.groupEnd();
  },

  install() {
    if (this.installed) {
      return;
    }
    this.installed = true;

    window.addEventListener("error", (event) => {
      this.report("runtime-error", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack || null
      }, "error");
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error
        ? { message: event.reason.message, stack: event.reason.stack }
        : { reason: event.reason };
      this.report("unhandled-rejection", reason, "error");
    });
  },

  auditStartup() {
    this.report("startup-state", {
      auth: {
        isAuthenticated: Auth.isAuthenticated(),
        login: Auth.getLogin() || null
      },
      syncStatus: Sync.status,
      data: summarizeNormalizedData(Store.data)
    });
  },

  snapshot() {
    return {
      errorCount: this.errorCount,
      online: navigator.onLine,
      session: {
        authenticated: Auth.isAuthenticated(),
        login: Auth.getLogin() || null
      },
      sync: {
        status: Sync.status,
        lastSyncedAt: Sync.lastSyncedAt,
        lastError: Sync.lastError || null
      },
      events: this.events.slice()
    };
  }
};

window.BudgetTrackerDebug = {
  normalizeData,
  mergeDataPreview: (remote, local) => normalizeData(mergeData(remote, local)),
  validateBackupPayload,
  summarizeNormalizedData,
  comparableDataSignature,
  isSemanticallySameData,
  hasMeaningfulData,
  roundtripBackupAudit: () => {
    const backup = Store.exportLegacyBackup();
    const sourceSummary = summarizeNormalizedData(Store.data);
    const roundtripSummary = summarizeNormalizedData(normalizeData(backup));
    const diff = diffDataSummaries(sourceSummary, roundtripSummary);
    const sourceComparable = JSON.parse(comparableDataSignature(Store.data));
    const roundtripComparable = JSON.parse(comparableDataSignature(backup));
    return {
      backup,
      sourceSummary,
      roundtripSummary,
      diff,
      isEqual: Object.values(diff).every((value) => Number(value || 0) === 0),
      signatureEqual: JSON.stringify(sourceComparable) === JSON.stringify(roundtripComparable),
      firstSignatureDiff: findFirstDiffPath(sourceComparable, roundtripComparable)
    };
  },
  exportBackupData: () => Store.exportLegacyBackup(),
  importBackupData: (data) => Store.importBackup(data),
  getStoreData: () => Utils.clone(Store.data),
  statsForMonth: (monthKey) => Utils.clone(Store.statsForMonth(monthKey)),
  getCategories: (type = "all") => Utils.clone(Store.getCategories(type)),
  setViewMonth: (monthKey) => {
    Store.viewMonth = monthKey;
    Store.detailMonth = monthKey;
    UI.heatmapMonth = monthKey;
    UI.renderApp();
  },
  toggleTheme: () => App.toggleTheme(),
  renderApp: () => UI.renderApp(),
  saveCategory: (payload) => Store.saveCategory(payload),
  deleteCategory: (categoryId) => Store.deleteCategory(categoryId),
  undo: () => Store.undo(),
  redo: () => Store.redo(),
  canUndo: () => Store.canUndo(),
  canRedo: () => Store.canRedo(),
  getDiagnostics: () => Diagnostics.snapshot()
};

document.addEventListener("DOMContentLoaded", () => {
  Diagnostics.install();
  App.init().catch((error) => {
    document.body?.classList.remove("app-booting");
    document.body?.classList.add("app-ready");
    Diagnostics.report("app-init:failed", {
      code: error?.code || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    }, "error");
    console.error(error);
    UI.toast("Приложение запустилось с ограничениями", "warning");
  }).finally(() => {
    Diagnostics.auditStartup();
  });
});
