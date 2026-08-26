const App = {
  journalFieldEdits: new Map(),
  monthStartEditSnapshot: null,
  storageErrorShownAt: 0,
  serviceWorkerRegistration: null,
  updateReloading: false,
  pwaInstallPrompt: null,

  isPwaStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches === true
      || window.navigator.standalone === true;
  },

  updatePwaInstallState() {
    const card = Utils.$("pwaInstallCard");
    const button = Utils.$("pwaInstallBtn");
    const status = Utils.$("pwaInstallStatus");
    if (!card || !button || !status) return;
    card.hidden = false;
    if (this.isPwaStandalone()) {
      button.hidden = true;
      status.textContent = "Приложение установлено и открыто в отдельном окне.";
      card.dataset.state = "installed";
      return;
    }
    if (this.pwaInstallPrompt) {
      button.hidden = false;
      status.textContent = "Можно установить на это устройство и запускать отдельно от браузера.";
      card.dataset.state = "available";
      return;
    }
    button.hidden = true;
    status.textContent = "Установка доступна через меню браузера: «Установить приложение» или «На экран Домой».";
    card.dataset.state = "manual";
  },

  setupPwaInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.pwaInstallPrompt = event;
      this.updatePwaInstallState();
      Diagnostics.report("pwa:install-available", { standalone: false });
    });
    window.addEventListener("appinstalled", () => {
      this.pwaInstallPrompt = null;
      this.updatePwaInstallState();
      UI.toast?.("Приложение установлено на устройство.", "success");
      Diagnostics.report("pwa:installed", { standalone: this.isPwaStandalone() });
    });
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => this.updatePwaInstallState());
    this.updatePwaInstallState();
  },

  async installPwa() {
    const promptEvent = this.pwaInstallPrompt;
    if (!promptEvent) {
      this.updatePwaInstallState();
      return;
    }
    this.pwaInstallPrompt = null;
    this.updatePwaInstallState();
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      Diagnostics.report("pwa:install-choice", { outcome: choice?.outcome || "unknown" });
      if (choice?.outcome !== "accepted") this.updatePwaInstallState();
    } catch (error) {
      Diagnostics.report("pwa:install-failed", { message: error?.message || String(error) }, "warning");
      this.updatePwaInstallState();
    }
  },

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    const allowLocalServiceWorker = new URLSearchParams(location.search).get("sw-test") === "1";
    if (["localhost", "127.0.0.1", "::1"].includes(location.hostname) && !allowLocalServiceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("personal-budget-shell-")).map((key) => caches.delete(key)));
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI), { scope: "./" });
      this.serviceWorkerRegistration = registration;
      const showUpdate = () => {
        const banner = Utils.$("updateBanner");
        if (banner) banner.hidden = false;
      };
      if (registration.waiting) showUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (this.updateReloading) return;
        this.updateReloading = true;
        location.reload();
      });
    } catch (error) {
      Diagnostics.report("service-worker:registration-failed", { message: error?.message || String(error) }, "warning");
    }
  },

  applyAppUpdate() {
    const waiting = this.serviceWorkerRegistration?.waiting;
    if (!waiting) {
      location.reload();
      return;
    }
    Store.saveLocal();
    waiting.postMessage({ type: "SKIP_WAITING" });
  },

  bindStorageSafety() {
    window.addEventListener("budget:storage-error", (event) => {
      const now = Date.now();
      if (now - this.storageErrorShownAt < 5000) return;
      this.storageErrorShownAt = now;
      const message = "Не удалось записать данные в хранилище браузера. Не закрывайте вкладку и сразу экспортируйте резервную копию.";
      UI.setBackupStatus?.(message, "error");
      UI.toast?.(message, "error");
      Diagnostics.report("storage:failed", event.detail || {}, "error");
    });

    window.addEventListener("storage", (event) => {
      const login = Auth.getLogin();
      if (event.key === CONFIG.SESSION_KEY && Auth.hasSession() && !event.newValue) {
        this.handleRemoteSessionInvalid({ message: "Сессия завершена в другой вкладке." });
        return;
      }
      if (!login) return;
      if (event.key === Storage.cacheKey(login) && event.newValue) {
        try {
          const incoming = normalizeData(JSON.parse(event.newValue));
          if (!isSemanticallySameData(Store.data, incoming)) {
            const merged = mergeData(Store.data, incoming);
            Store.setData(merged, { save: true });
            UI.renderDataState();
            if (Auth.isAuthenticated()) Sync.queueSync();
          }
        } catch (error) {
          Diagnostics.report("storage:cross-tab-invalid", { message: error?.message || String(error) }, "warning");
        }
      }
      if (event.key === Storage.pendingKey(login) && event.newValue && Auth.isAuthenticated() && navigator.onLine) {
        Sync.processQueue();
      }
    });
  },

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
    this.setupPwaInstall();
    this.bindStorageSafety();
    this.registerServiceWorker();
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
        if (Storage.loadPending(Auth.getLogin())?.login === Auth.getLogin()) {
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
        UI.updateScrollTopButton();
      });
    }
  },

  addBudgetQuickRow(section = "expenses") {
    const safeSection = ["incomes", "debts", "recurring", "expenses", "wishlist"].includes(section) ? section : "expenses";
    this.switchTab("overviewTab");
    this.addJournalRow(safeSection);
  },

  addJournalRow(section = "expenses") {
    const safeSection = ["incomes", "debts", "recurring", "expenses", "wishlist"].includes(section) ? section : "expenses";
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
      const firstField = row?.querySelector?.("[data-journal-field]");
      if (firstField instanceof HTMLElement) {
        try {
          firstField.focus({ preventScroll: true });
        } catch {
          firstField.focus();
        }
        firstField.select?.();
      }
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
    const syncStatus = hasPending && Sync.status === "synced" ? "pending" : Sync.status;
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
      stateValue = "Это отдельная демонстрационная среда. Ее данные не отправляются в облако и автоматически сбрасываются после перезагрузки страницы.";
    } else if (!isLocalOnly) {
      subtextValue = Auth.getExpiry()
        ? `Аккаунт активен до ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Auth.getExpiry()))}.`
        : "Аккаунт подключен в этом браузере.";
      metaValue = hasPending
        ? "Есть изменения на этом устройстве"
        : "Аккаунт подключен. Синхронизация включена";
      passwordHintValue = "До трех устройств; автовыход после 12 часов бездействия.";
      sourceValue = hasPending ? "Это устройство" : "Аккаунт и облако";
      pendingValue = hasPending ? "Ожидает отправки" : "Нет";
      lastSyncValue = Sync.lastSyncedAt ? Utils.timeSince(Sync.lastSyncedAt) : "Еще не было";
      stateValue = syncStatus === "pending"
        ? "Изменения сохранены на этом устройстве. Мы отправим их в облако автоматически; после подтверждения статус станет «В облаке»."
        : (syncStatus === "synced"
          ? (Sync.lastSyncedAt
            ? `Все синхронизировано. Последняя синхронизация была ${Utils.timeSince(Sync.lastSyncedAt)}.`
            : "Аккаунт подключен. Бюджет уже синхронизирован с облаком.")
          : (syncStatus === "syncing"
            ? (hasPending
              ? "Отправляем изменения в облако. Можно продолжать работать, данные на устройстве уже сохранены."
              : "Проверяем облако и сверяем данные аккаунта.")
            : (syncStatus === "offline"
              ? (hasPending
                ? "Интернета сейчас нет. Изменения сохранены на устройстве и отправятся автоматически, когда связь вернется."
                : "Интернета сейчас нет. Показываем последнюю сохраненную версию бюджета.")
              : (syncStatus === "conflict"
                ? "Данные изменились на двух устройствах. Выберите актуальную версию; до решения обе копии остаются сохранены."
                : (syncStatus === "error"
                ? `Не получилось обновить облако: ${Sync.lastError || "данные на устройстве сохранены, но облако пока еще не обновилось."}`
                : "Аккаунт подключен. Сверяем данные с облаком.")))));
      if (syncStatus === "syncing") {
        cloudValue = hasPending ? "Отправляем" : "Проверяем";
      } else if (syncStatus === "offline") {
        cloudValue = hasPending ? "Ждет связи" : "Нет связи";
      } else if (syncStatus === "error") {
        cloudValue = "Требует повтора";
      } else if (syncStatus === "conflict") {
        cloudValue = "Нужен выбор";
      } else if (syncStatus === "pending") {
        cloudValue = "Обновляется";
      } else if (syncStatus === "synced") {
        cloudValue = "В порядке";
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
        if (syncStatus === "pending") {
          statusTone = "is-syncing";
          statusLabel = "Отправка";
        } else if (syncStatus === "synced") {
          statusTone = "is-synced";
          statusLabel = "В облаке";
        } else if (syncStatus === "syncing") {
          statusTone = "is-syncing";
          statusLabel = hasPending ? "Отправка" : "Проверка";
        } else if (syncStatus === "offline") {
          statusTone = "is-offline";
          statusLabel = "Оффлайн";
        } else if (syncStatus === "error") {
          statusTone = "is-error";
          statusLabel = "Ошибка";
        } else if (syncStatus === "conflict") {
          statusTone = "is-error";
          statusLabel = "Конфликт";
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
    Utils.$("accountSessionsBtn")?.classList.toggle("is-hidden", isLocalOnly);
    Utils.$("accountRecoveryCodeBtn")?.classList.toggle("is-hidden", isLocalOnly);
    Utils.$("demoResetBtn")?.classList.toggle("is-hidden", !isLocalTest);
  },

  describeDataSource(data, fallbackLabel) {
    const summary = summarizeNormalizedData(normalizeData(data));
    if (!Object.values(summary).some((value) => Number(value) > 0)) {
      return `${fallbackLabel}: пока без записей`;
    }
    return `${fallbackLabel}: ${summary.months} мес. · ${Utils.formatCount(summary.transactions, "операция", "операции", "операций")} · ${Utils.formatCount(summary.templates, "сценарий", "сценария", "сценариев")} · ${Utils.formatCount(summary.favorites, "избранная операция", "избранные операции", "избранных операций")} · ${Utils.formatCount(summary.wishlist, "цель", "цели", "целей")}`;
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

  async handleSyncConflict({ pending, error }) {
    const login = Auth.getLogin();
    if (!login || pending?.login !== login) {
      return;
    }
    let remoteResult;
    try {
      remoteResult = await Api.load(login, Auth.getToken());
    } catch (loadError) {
      Sync.lastError = Api.getFriendlyMessage(loadError, "Не удалось загрузить облачную версию для разрешения конфликта");
      Sync.status = Api.isRetryable(loadError) ? "offline" : "error";
      return;
    }

    const remoteData = normalizeData(remoteResult.data);
    const localData = normalizeData(pending.data);
    Store.remoteRevision = remoteResult.revision;
    Storage.saveRevision(login, remoteResult.revision);

    if (isSemanticallySameData(localData, remoteData)) {
      Storage.clearPending(login);
      Store.setData(remoteData, { save: true });
      Sync.status = "synced";
      Sync.lastError = "";
      UI.renderApp();
      UI.toast("Конфликт разрешен автоматически: данные совпадают.", "success");
      return;
    }

    const choice = await this.promptSyncChoice({ login, guestData: localData, remoteData });
    if (choice === "cloud") {
      Storage.clearPending(login);
      Store.setData(remoteData, { save: true });
      Store.resetHistory();
      Sync.status = "synced";
      Sync.lastError = "";
      Sync.lastSyncedAt = Utils.nowISO();
      Storage.saveLastSync(login, Sync.lastSyncedAt);
      UI.renderApp();
      UI.toast("Выбрана более свежая облачная версия.", "success");
      return;
    }
    if (choice === "local") {
      Storage.savePending({
        ...pending,
        token: Auth.getToken(),
        operationId: Utils.uid("sync"),
        baseRevision: remoteResult.revision,
        updatedAt: Utils.nowISO()
      });
      Sync.status = "syncing";
      Sync.lastError = "";
      clearTimeout(Sync.timer);
      Sync.timer = setTimeout(() => Sync.processQueue(true), 100);
      UI.toast("Выбрана версия с устройства. Она будет записана поверх облачной версии после контрольной проверки.", "warning");
      return;
    }
    Sync.status = "conflict";
    Sync.lastError = "Конфликт не разрешен. Обе версии сохранены; синхронизация приостановлена.";
  },

  presentRecoveryCode(recoveryCode) {
    const code = String(recoveryCode || "");
    if (!code) return;
    const value = Utils.$("recoveryCodeValue");
    if (value) value.textContent = code;
    UI.openModal("recoveryCodeModal");
  },

  downloadRecoveryCode() {
    const code = Utils.$("recoveryCodeValue")?.textContent?.trim();
    const login = Auth.getLogin();
    if (!code || !login) return;
    const blob = new Blob([
      "Personal Budget Tracker — код восстановления\n\n",
      `Логин: ${login}\n`,
      `Код: ${code}\n\n`,
      "Храните этот файл отдельно. Каждый код используется один раз.\n"
    ], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `budget-recovery-${login}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  },

  openPasswordRecovery(source = "startup") {
    const sourceLogin = Utils.$(source === "modal" ? "modalLogin" : "startupLogin")?.value?.trim();
    Utils.$("recoveryLogin").value = sourceLogin || "";
    Utils.$("recoveryCode").value = "";
    Utils.$("recoveryNewPassword").value = "";
    UI.clearStatusNode(Utils.$("passwordRecoveryStatus"));
    UI.openModal("passwordRecoveryModal");
  },

  async submitPasswordRecovery() {
    const login = Utils.$("recoveryLogin").value.trim();
    const recoveryCode = Utils.$("recoveryCode").value.trim();
    const newPassword = Utils.$("recoveryNewPassword").value;
    const status = Utils.$("passwordRecoveryStatus");
    if (!login || !recoveryCode || newPassword.length < 8) {
      UI.setStatusNode(status, "Заполните все поля; новый пароль — не короче 8 символов.", "error");
      return;
    }
    UI.setStatusNode(status, "Проверяем код…", "info");
    try {
      const result = await Api.recoverPassword(login, recoveryCode, newPassword);
      UI.closeModal("passwordRecoveryModal");
      this.presentRecoveryCode(result.recoveryCode);
      UI.toast("Пароль изменен. Все прежние сессии завершены; сохраните новый код восстановления и войдите снова.", "success");
    } catch (error) {
      UI.setStatusNode(status, Api.getFriendlyMessage(error, "Не удалось восстановить доступ"), "error");
    }
  },

  openPasswordChange() {
    UI.closeModal("accountMenuModal");
    Utils.$("currentPassword").value = "";
    Utils.$("newPassword").value = "";
    UI.clearStatusNode(Utils.$("passwordChangeStatus"));
    UI.openModal("passwordChangeModal");
  },

  async submitPasswordChange() {
    const currentPassword = Utils.$("currentPassword").value;
    const newPassword = Utils.$("newPassword").value;
    const status = Utils.$("passwordChangeStatus");
    if (!currentPassword || newPassword.length < 8) {
      UI.setStatusNode(status, "Укажите текущий пароль и новый пароль не короче 8 символов.", "error");
      return;
    }
    UI.setStatusNode(status, "Меняем пароль…", "info");
    try {
      await Api.changePassword(Auth.getLogin(), Auth.getToken(), currentPassword, newPassword);
      UI.closeModal("passwordChangeModal");
      UI.toast("Пароль изменен. Сессии на других устройствах завершены.", "success");
    } catch (error) {
      UI.setStatusNode(status, Api.getFriendlyMessage(error, "Не удалось сменить пароль"), "error");
    }
  },

  async openSessions() {
    UI.closeModal("accountMenuModal");
    const root = Utils.$("sessionsList");
    root.replaceChildren(Utils.createElement("p", "empty-state empty-state--compact", "Загружаем список устройств…"));
    UI.openModal("sessionsModal");
    try {
      const result = await Api.listSessions(Auth.getLogin(), Auth.getToken());
      const fragment = document.createDocumentFragment();
      (result.sessions || []).forEach((session) => {
        const item = Utils.createElement("article", "account-menu__fact");
        item.setAttribute("role", "listitem");
        const title = Utils.createElement("strong", "", session.current ? `${session.deviceName} · это устройство` : session.deviceName);
        const detail = Utils.createElement("span", "", `Активность: ${Utils.timeSince(new Date(session.lastSeenAt).toISOString())}`);
        item.append(title, detail);
        if (!session.current) {
          const revoke = Utils.createElement("button", "btn btn--ghost", "Завершить");
          revoke.type = "button";
          revoke.addEventListener("click", async () => {
            await Api.revokeSession(Auth.getLogin(), Auth.getToken(), { sessionId: session.id });
            await this.openSessions();
          });
          item.append(revoke);
        }
        fragment.append(item);
      });
      root.replaceChildren(fragment);
    } catch (error) {
      root.replaceChildren(Utils.createElement("p", "empty-state empty-state--compact", Api.getFriendlyMessage(error, "Не удалось загрузить устройства")));
    }
  },

  async revokeOtherSessions() {
    try {
      await Api.revokeSession(Auth.getLogin(), Auth.getToken(), { allOther: true });
      await this.openSessions();
      UI.toast("Сессии на других устройствах завершены.", "success");
    } catch (error) {
      UI.toast(Api.getFriendlyMessage(error, "Не удалось завершить другие сессии"), "error");
    }
  },

  async regenerateRecoveryCode() {
    UI.closeModal("accountMenuModal");
    try {
      const result = await Api.regenerateRecoveryCode(Auth.getLogin(), Auth.getToken());
      this.presentRecoveryCode(result.recoveryCode);
    } catch (error) {
      UI.toast(Api.getFriendlyMessage(error, "Не удалось обновить код восстановления"), "error");
    }
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
    const remoteResult = await Api.load(login, Auth.getToken());
    const remoteData = normalizeData(remoteResult.data);
    Store.remoteRevision = remoteResult.revision;
    Storage.saveRevision(login, remoteResult.revision);
    const hasGuest = hasMeaningfulData(guestData);
    const hasRemote = hasMeaningfulData(remoteData);
    const pending = Storage.loadPending(login);

    if (pending?.login === login) {
      Store.remoteRevision = Number(pending.baseRevision) || remoteResult.revision;
      await this.applyAuthenticatedData(pending.data, {
        clearGuest: ignoreGuest,
        syncUp: false,
        toastMessage: "Найдены несинхронизированные изменения с этого устройства. Возобновляем отправку в облако.",
        toastTone: "info"
      });
      App.runAfterNextPaint(() => Sync.processQueue(true), 2);
      return;
    }

    const deviceCandidate = hasGuest ? guestData : localAccount;
    const hasDeviceCandidate = hasMeaningfulData(deviceCandidate);
    const deviceAndCloudMatch = hasDeviceCandidate && isSemanticallySameData(deviceCandidate, remoteData);

    if (!hasDeviceCandidate || deviceAndCloudMatch) {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: hasGuest,
        syncUp: false,
        toastMessage: deviceAndCloudMatch
          ? "Данные на устройстве и в облаке совпадают. Загружена облачная версия"
          : "Аккаунт подключен. Загружена актуальная версия из облака"
      });
      return;
    }

    if (!hasRemote || mode === "register") {
      await this.applyAuthenticatedData(deviceCandidate, {
        clearGuest: hasGuest,
        syncUp: true,
        toastMessage: "Аккаунт подключен. Данные с устройства синхронизированы с облаком"
      });
      return;
    }

    const choice = await this.promptSyncChoice({ login, guestData: deviceCandidate, remoteData });
    if (choice === "local") {
      await this.applyAuthenticatedData(deviceCandidate, {
        clearGuest: hasGuest,
        syncUp: true,
        toastMessage: "Выбрана версия с устройства. Она отправляется в облако"
      });
      return;
    }
    if (choice === "cloud") {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: hasGuest,
        syncUp: false,
        toastMessage: "Выбрана более свежая облачная версия"
      });
      return;
    }

    Auth.clearSession({ preservePending: true });
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";
    Store.setData(deviceCandidate, { save: false });
    Store.saveLocal();
    Store.resetHistory();
    UI.showApp();
    UI.renderApp();
    UI.toast("Вход отменен. Данные остаются на устройстве без облачной синхронизации.", "info");
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
      await Auth.setSession(login, response.token, {
        sessionId: response.id,
        serverExpiresAt: response.expiresAt,
        idleTimeoutMs: response.idleTimeoutMs
      });
      Store.remoteRevision = Number(response.revision) || 0;
      Storage.saveRevision(login, Store.remoteRevision);

      if (previousLocalOnly) {
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
      if (mode === "register" && response.recoveryCode) {
        this.presentRecoveryCode(response.recoveryCode);
      }
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
    const pending = Storage.loadPending(login);
    const localAccount = pending?.login === login ? pending.data : Storage.loadCache(login);
    const guestCache = mergeGuest ? Storage.loadCache(null) : defaultData();
    const working = mergeGuest ? mergeData(localAccount, guestCache) : localAccount;
    Store.setData(working, { save: true });
    UI.renderApp();

    try {
      const remoteResult = await Api.load(login, Auth.getToken());
      const remoteData = normalizeData(remoteResult.data);
      Store.remoteRevision = remoteResult.revision;
      Storage.saveRevision(login, remoteResult.revision);
      if (pending?.login === login) {
        Store.setData(pending.data, { save: true });
        await Sync.processQueue(true);
        return;
      }
      Store.setData(remoteData, { save: true });
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

    if (wasLocalTest && login) {
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

    if (isLocalTest && login) {
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
    UI.toast("Сессия завершена после 12 часов бездействия. Войдите снова.", "warning");
  },

  async logout() {
    UI.closeModal("accountMenuModal");
    const previousLogin = Auth.getLogin();
    const previousToken = Auth.getToken();
    const wasLocalTest = Auth.isLocalOnly() && isLocalTestLogin(previousLogin);
    const hasPending = Sync.hasPendingChanges(previousLogin);
    if (Auth.isAuthenticated() && hasPending && navigator.onLine) {
      await Sync.processQueue(true);
    }
    if (Auth.isAuthenticated() && previousLogin && previousToken && navigator.onLine && !Sync.hasPendingChanges(previousLogin)) {
      await Api.logout(previousLogin, previousToken).catch(() => {});
    }
    Auth.clearSession({ preservePending: true });
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
    UI.toast(hasPending && Sync.hasPendingChanges(previousLogin)
      ? "Сессия завершена. Неотправленные изменения сохранены на устройстве и продолжат синхронизацию после следующего входа."
      : "Сессия завершена.", "info");
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

  resetDemo() {
    if (!Auth.isLocalOnly() || !isLocalTestLogin(Auth.getLogin())) return;
    Storage.saveCache(Auth.getLogin(), buildLocalTestData());
    Store.loadLocal(Auth.getLogin());
    Store.resetHistory();
    UI.renderApp();
    UI.toast("Демо-данные восстановлены в исходное состояние.", "success");
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

  scrollToBudgetSection(section) {
    const safeSection = ["incomes", "debts", "recurring", "expenses", "wishlist"].includes(section) ? section : "";
    if (!safeSection) {
      return;
    }
    const root = document.querySelector(`[data-budget-section="${safeSection}"]`);
    if (!(root instanceof HTMLElement)) {
      return;
    }
    root.scrollIntoView({
      block: "start",
      behavior: UI.prefersReducedMotion() ? "auto" : "smooth"
    });
    root.classList.add("is-jump-target");
    window.setTimeout(() => root.classList.remove("is-jump-target"), 1100);
  },

  refreshBudgetDerivedState() {
    UI.renderSyncState();
    UI.renderHistoryState();
    if (Store.activeTab !== "overviewTab") {
      return;
    }
    UI.renderSummary();
    UI.renderMonthPlan();
    UI.renderJournalSummary();
    UI.renderTransactions();
    UI.renderBudgetLimits();
    if (typeof window.Chart !== "undefined") {
      UI.renderMonthBalanceChart();
    }
    App.runAfterNextPaint(() => UI.syncBudgetWorkspaceLayout(), 1);
  },

  updateMonthStart(value, { render = true } = {}) {
    if (!render && !this.monthStartEditSnapshot) {
      this.monthStartEditSnapshot = Store.captureSnapshot();
    }
    const hasLiveEdit = Boolean(this.monthStartEditSnapshot);
    Store.saveMonthMeta(
      Store.viewMonth,
      { start: Utils.parseSignedAmount(value) },
      {
        render: false,
        recordHistory: !hasLiveEdit
      }
    );
    if (render) {
      if (this.monthStartEditSnapshot) {
        Store.commitHistorySnapshot(this.monthStartEditSnapshot);
        this.monthStartEditSnapshot = null;
      }
      this.refreshBudgetDerivedState();
    }
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
    filterShell?.scrollIntoView({ behavior: UI.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
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
    row.scrollIntoView({ behavior: UI.prefersReducedMotion() ? "auto" : "smooth", block: "center" });
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
    UI.filteredVisibleCount = UI.filteredPageSize;
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
      this.addJournalRow(section);
      return;
    }
    if (action === "load-more" && section) {
      UI.loadMoreJournal(section);
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
    if (action === "move-month" && id) {
      this.openMoveTransaction(id);
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

  getJournalFieldEditKey(field) {
    const row = field?.closest?.("[data-entry-id]");
    const kind = field?.dataset?.journalField || "";
    return row?.dataset?.entryId && kind ? `${row.dataset.entryId}:${kind}` : "";
  },

  beginJournalFieldEdit(field) {
    const key = this.getJournalFieldEditKey(field);
    if (key && !this.journalFieldEdits.has(key)) {
      this.journalFieldEdits.set(key, Store.captureSnapshot());
    }
    return key;
  },

  hasJournalFieldEdit(field) {
    const key = this.getJournalFieldEditKey(field);
    return Boolean(key && this.journalFieldEdits.has(key));
  },

  updateJournalFieldDraft(field) {
    if (field instanceof HTMLTextAreaElement) {
      field.dataset.fulltext = field.value;
    }
    this.beginJournalFieldEdit(field);
    this.handleJournalField(field, { render: false, recordHistory: false });
  },

  commitJournalFieldEdit(field) {
    const key = this.getJournalFieldEditKey(field);
    const snapshot = (key ? this.journalFieldEdits.get(key) : null) || Store.captureSnapshot();
    const sectionRoot = field?.closest?.("[data-entry-id]")?.parentElement;
    if (field instanceof HTMLTextAreaElement) {
      field.dataset.fulltext = field.value;
    }
    const changed = this.handleJournalField(field, { render: false, recordHistory: false });
    if (key) {
      this.journalFieldEdits.delete(key);
    }
    if (sectionRoot instanceof HTMLElement) {
      sectionRoot.removeAttribute("data-render-signature");
    }
    Store.commitHistorySnapshot(snapshot);
    this.refreshBudgetDerivedState();
    return changed;
  },

  handleJournalField(field, options = {}) {
    const row = field.closest("[data-entry-id]");
    if (!row) {
      return false;
    }
    const itemId = row.dataset.entryId;
    const section = row.dataset.section;
    const kind = field.dataset.journalField;
    if (section === "wishlist") {
      if (kind === "wish-desc") {
        return Store.updateWishlistItem(itemId, { desc: field.dataset.fulltext || field.value }, options);
      }
      if (kind === "wish-amount") {
        return Store.updateWishlistItem(itemId, { amount: Math.max(0, Utils.parseAmount(field.value)) }, options);
      }
      return false;
    }

    const transaction = Store.data.transactions.find((item) => item.id === itemId);
    if (!transaction) {
      return false;
    }

    if (kind === "day") {
      const [year, month] = transaction.date.slice(0, 7).split("-").map(Number);
      const day = Utils.clampDay(year, month - 1, field.value);
      const nextDate = `${transaction.date.slice(0, 8)}${String(day).padStart(2, "0")}`;
      field.value = String(day);
      return Store.updateTransactionInline(itemId, { date: nextDate }, options);
    }
    if (kind === "date" && Utils.isISODate(field.value)) {
      const nextDate = field.value;
      const dayInput = row.querySelector('input[data-journal-field="day"]');
      if (dayInput instanceof HTMLInputElement) {
        dayInput.value = String(Number(nextDate.slice(-2)));
      }
      return Store.updateTransactionInline(itemId, { date: nextDate }, options);
    }
    if (kind === "amount") {
      return Store.updateTransactionInline(itemId, { amount: Math.max(0, Utils.parseAmount(field.value)) }, options);
    }
    if (kind === "description") {
      return Store.updateTransactionInline(itemId, { description: field.dataset.fulltext || field.value }, options);
    }
    if (kind === "categoryId" && Store.getCategory(field.value)) {
      return Store.updateTransactionInline(itemId, { categoryId: field.value }, options);
    }
    return false;
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

  openMoveTransaction(transactionId) {
    const transaction = Store.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }
    Utils.$("moveTransactionId").value = transaction.id;
    Utils.$("moveTransactionMonthInput").value = transaction.date.slice(0, 7);
    const description = transaction.description || "Операция без описания";
    Utils.$("moveTransactionSummary").textContent = `${description} · ${Utils.formatMoney(transaction.amount)} · ${transaction.date}`;
    this.updateMoveTransactionDateNote();
    UI.openModal("moveTransactionModal");
  },

  setMoveTransactionMonth(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) {
      return;
    }
    const input = Utils.$("moveTransactionMonthInput");
    if (!input) {
      return;
    }
    input.value = monthKey;
    this.updateMoveTransactionDateNote();
  },

  shiftMoveTransactionMonth(delta) {
    const input = Utils.$("moveTransactionMonthInput");
    const baseMonth = /^\d{4}-\d{2}$/.test(input?.value || "")
      ? input.value
      : Utils.monthKey(new Date());
    const [year, month] = baseMonth.split("-").map(Number);
    this.setMoveTransactionMonth(Utils.monthKey(new Date(year, month - 1 + Number(delta || 0), 1)));
  },

  updateMoveTransactionDateNote() {
    const id = Utils.$("moveTransactionId")?.value || "";
    const transaction = Store.data.transactions.find((item) => item.id === id);
    const targetMonth = Utils.$("moveTransactionMonthInput")?.value || "";
    const note = Utils.$("moveTransactionDateNote");
    if (!transaction || !/^\d{4}-\d{2}$/.test(targetMonth) || !note) {
      return;
    }
    const sourceDay = Math.max(1, Number(transaction.date.slice(-2)) || 1);
    const [year, month] = targetMonth.split("-").map(Number);
    const targetDay = Math.min(sourceDay, new Date(year, month, 0).getDate());
    note.textContent = `Новая дата: ${targetMonth}-${String(targetDay).padStart(2, "0")}. Сумма, описание и категория не изменятся.`;
  },

  saveMovedTransaction() {
    const id = Utils.$("moveTransactionId")?.value || "";
    const targetMonth = Utils.$("moveTransactionMonthInput")?.value || "";
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      UI.toast("Выберите месяц, в который нужно перенести операцию", "warning");
      return;
    }
    const changed = Store.moveTransactionToMonth(id, targetMonth);
    UI.closeModal("moveTransactionModal");
    UI.toast(
      changed ? `Операция перенесена в ${Utils.monthLabel(targetMonth).toLowerCase()}` : "Операция уже находится в выбранном месяце",
      changed ? "success" : "info"
    );
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

  exportBackup({ silent = false, filePrefix = "budget", data = Store.data } = {}) {
    if (!silent) UI.clearBackupStatus();
    try {
      const sourceData = normalizeData(data);
      const backup = {
        format: "personal-budget-tracker",
        schemaVersion: CONFIG.APP_VERSION,
        exportedAt: Utils.nowISO(),
        data: sourceData
      };
      const normalizedRoundtrip = normalizeData(backup);
      const sourceSummary = summarizeNormalizedData(sourceData);
      const roundtripSummary = summarizeNormalizedData(normalizedRoundtrip);
      const roundtripDiff = diffDataSummaries(sourceSummary, roundtripSummary);
      const signatureEqual = comparableDataSignature(sourceData) === comparableDataSignature(normalizedRoundtrip);
      Diagnostics.report("export-backup:roundtrip", {
        source: sourceSummary,
        roundtrip: roundtripSummary,
        diff: roundtripDiff,
        signatureEqual
      }, signatureEqual ? "info" : "error");
      if (!signatureEqual) {
        throw new Error("Не удалось проверить целостность резервной копии. Данные не скачаны.");
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const profile = Auth.getLogin() || "local";
      link.download = `${filePrefix}_${profile}_backup_${Utils.todayISO()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      if (!silent) {
        Storage.markBackupExported(Auth.getLogin() || "local", backup.exportedAt);
        UI.renderBackupReminder?.();
        UI.setBackupStatus("Резервная копия проверена и готова. Браузер уже начал скачивание.", "success");
        UI.toast("Резервная копия готова", "success");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подготовить резервную копию.";
      Diagnostics.report("export-backup:failed", {
        message,
        stack: error instanceof Error ? error.stack : null
      }, "error");
      if (!silent) {
        UI.setBackupStatus(message, "error");
        UI.toast(message, "error");
      }
      return false;
    }
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
    UI.setBusy(Utils.$("importBtn"), true, "Проверяем файл…");
    if (file.size > CONFIG.MAX_BACKUP_BYTES) {
      const message = "Файл резервной копии слишком большой. Выберите JSON-файл размером до 8 МБ.";
      Diagnostics.report("import-backup:file-too-large", {
        name: file.name,
        size: file.size,
        maxSize: CONFIG.MAX_BACKUP_BYTES
      }, "warning");
      UI.setBackupStatus(message, "error");
      UI.toast(message, "error");
      event.target.value = "";
      UI.setBusy(Utils.$("importBtn"), false);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      Diagnostics.report("import-backup:file-read-error", {
        name: file.name,
        size: file.size
      }, "error");
      UI.setBackupStatus("Не получилось открыть файл резервной копии.", "error");
      UI.toast("Не получилось прочитать резервную копию", "error");
      event.target.value = "";
      UI.setBusy(Utils.$("importBtn"), false);
    };
    reader.onload = async () => {
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
        const summary = audit.summary;
        const confirmed = await UI.confirmAction({
          title: "Заменить текущий бюджет?",
          message: `В файле: ${Utils.formatCount(summary.transactions, "операция", "операции", "операций")}, ${Utils.formatCount(summary.months, "месяц", "месяца", "месяцев")} и ${Utils.formatCount(summary.categories, "категория", "категории", "категорий")}. Перед заменой автоматически скачается резервная копия текущих данных.`,
          acceptLabel: "Создать копию и импортировать",
          tone: "danger"
        });
        if (!confirmed) {
          UI.setBackupStatus("Импорт отменен. Текущие данные не изменены.", "info");
          return;
        }
        if (!this.exportBackup({ silent: true, filePrefix: "before_import" })) {
          throw new Error("Не удалось создать контрольную копию перед импортом. Импорт отменен.");
        }
        Store.importBackup(parsed);
        UI.setBackupStatus("Бюджет восстановлен из резервной копии.", "success");
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
        UI.setBusy(Utils.$("importBtn"), false);
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
    return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  },

  sanitize(value, depth = 0) {
    if (depth > 3) return "[details omitted]";
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => this.sanitize(item, depth + 1));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === "data" || ["password", "token", "secret", "recovery", "cookie", "authorization"].some((part) => normalizedKey.includes(part))) {
        return [key, "[hidden]"];
      }
      if (normalizedKey.includes("login")) return [key, item ? "[account]" : null];
      return [key, this.sanitize(item, depth + 1)];
    }));
  },

  report(label, payload, level = "info") {
    const method = typeof console[level] === "function" ? level : "info";
    const safePayload = this.sanitize(payload);
    this.events.push({
      label,
      level,
      payload: safePayload,
      at: Utils.nowISO()
    });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    if (level === "error") {
      this.errorCount += 1;
    }
    if (!this.shouldLogToConsole(level) || payload?._consoleReported) {
      return;
    }
    const lineDetails = safePayload && typeof safePayload === "object"
      ? Object.entries(safePayload)
        .filter(([key]) => !key.startsWith("_"))
        .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" | ")
      : String(payload ?? "");
    console[method](`[Budget Diagnostics] ${label}${lineDetails ? ` | ${lineDetails}` : ""}`);
    console.groupCollapsed(`[Budget Audit] ${label}`);
    console[method](safePayload);
    console.groupEnd();
  },

  install() {
    if (this.installed) {
      return;
    }
    this.installed = true;
    console.info(
      `[Budget] Personal Budget Tracker v${CONFIG.APP_VERSION} · API v${Api.capabilities.apiVersion} · ${navigator.onLine ? "online" : "offline"}`
    );
    console.info("[Budget] Безопасная диагностика: BudgetTrackerDiagnostics.snapshot() и BudgetTrackerDiagnostics.help()");

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
        accountSelected: Boolean(Auth.getLogin())
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
        accountSelected: Boolean(Auth.getLogin())
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

window.BudgetTrackerDiagnostics = Object.freeze({
  snapshot: () => Diagnostics.snapshot(),
  help: () => ({
    purpose: "Безопасный снимок состояния приложения без паролей, токенов и финансовых записей.",
    support: "При ошибке API передайте код, HTTP-статус и requestId из группы [Budget API].",
    offline: "При потере сети изменения остаются на устройстве и отправляются после восстановления связи."
  })
});

if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
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
}

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
