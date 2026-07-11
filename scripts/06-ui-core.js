const UI = {
  charts: {
    flow: null,
    category: null,
    monthBalance: null
  },
  chartResizeFrame: 0,
  scrollTopFrame: 0,
  chartLibraryPromise: null,
  chartWarmupScheduled: false,
  chartSizeCache: new WeakMap(),
  flowChartSignature: "",
  categoryChartSignature: "",
  appliedTheme: "",
  budgetFiltersCollapsed: true,
  analyticsAdvancedView: "deep",
  calendarSelectedDate: "",
  heatmapMonth: "",
  heatmapHintOpen: false,
  budgetNumpadState: {
    open: false,
    source: "journal",
    itemId: "",
    field: "",
    targetId: "",
    value: ""
  },
  budgetDayPadState: {
    open: false,
    itemId: "",
    monthKey: "",
    year: 0,
    monthIndex: 0,
    value: 1
  },
  budgetPointerActionGuard: null,
  budgetFlowPending: null,
  budgetSidePage: 0,
  budgetRenderCache: {
    summary: "",
    monthPlan: ""
  },
  settingsQuickMode: "template-recurring",
  settingsQuickScrollResetToken: 0,
  journalSectionSorts: {
    incomes: "date-desc",
    debts: "date-desc",
    recurring: "date-desc",
    expenses: "date-desc"
  },
  pickerState: {
    kind: null,
    ids: new Set(),
    context: null
  },
  syncChoiceResolver: null,
  modalFocusRestore: new Map(),
  dragState: {
    id: null,
    section: null,
    blocked: false
  },
  journalPageSize: 200,
  journalVisibleCounts: new Map(),
  filteredPageSize: 300,
  filteredVisibleCount: 300,

  loadMoreJournal(section) {
    const key = `${Store.viewMonth}:${section}`;
    const current = this.journalVisibleCounts.get(key) || this.journalPageSize;
    this.journalVisibleCounts.set(key, current + this.journalPageSize);
    const root = Utils.$({ incomes: "incomesList", debts: "debtsList", recurring: "recurringBudgetList", expenses: "expensesList", wishlist: "wishList" }[section]);
    if (root) delete root.dataset.renderSignature;
    this.renderJournal();
  },

  prefersReducedMotion() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  getFocusableElements(root) {
    if (!(root instanceof HTMLElement)) {
      return [];
    }
    return Array.from(root.querySelectorAll(
      "button:not([disabled]), [href], input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )).filter((element) => {
      if (!(element instanceof HTMLElement) || element.hasAttribute("hidden") || element.closest("[hidden]")) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && element.getClientRects().length > 0;
    });
  },

  getOpenModal() {
    return document.querySelector(".modal.is-open");
  },

  focusModalPrimary(modal) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    const focusables = this.getFocusableElements(modal);
    if (!focusables.length) {
      return;
    }
    const preferred = focusables.find((element) =>
      element.matches("input:not([type='hidden']), textarea, select, button:not(.modal__close)")
    ) || focusables[0];
    try {
      preferred.focus({ preventScroll: true });
    } catch {
      preferred.focus();
    }
  },

  trapModalFocus(event) {
    if (event.key !== "Tab") {
      return false;
    }
    const modal = this.getOpenModal();
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    const focusables = this.getFocusableElements(modal);
    if (!focusables.length) {
      event.preventDefault();
      return true;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  },

  isOverviewChartVisible() {
    return Store.activeTab === "overviewTab";
  },

  updateScrollTopButton() {
    const button = Utils.$("scrollTopBtn");
    if (!button) {
      return;
    }
    const appVisible = !Utils.$("appShell")?.classList.contains("is-hidden");
    const threshold = Math.max(520, Math.round((window.innerHeight || 0) * 0.65));
    const shouldShow = Boolean(appVisible && window.scrollY > threshold);
    button.classList.toggle("is-visible", shouldShow);
    button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    button.tabIndex = shouldShow ? 0 : -1;
  },

  scheduleScrollTopButtonUpdate() {
    if (this.scrollTopFrame) {
      return;
    }
    this.scrollTopFrame = requestAnimationFrame(() => {
      this.scrollTopFrame = 0;
      this.updateScrollTopButton();
    });
  },

  shouldRunChartResize() {
    return Store.activeTab === "analyticsTab" || this.isOverviewChartVisible();
  },

  setAnalyticsAdvancedView(view) {
    if (!["deep", "forecast", "recurring"].includes(view)) {
      return;
    }
    this.analyticsAdvancedView = view;
    if (Store.activeTab === "analyticsTab") {
      this.renderAnalyticsAdvancedContent(view);
    }
    this.renderAnalyticsAdvancedState();
  },

  renderAnalyticsAdvancedContent(view = this.analyticsAdvancedView) {
    if (view === "forecast") {
      this.renderForecast();
      return;
    }
    if (view === "recurring") {
      this.renderRecurring();
      return;
    }
    this.renderDeepStats();
  },

  renderAnalyticsAdvancedState() {
    const body = Utils.$("analyticsAdvancedBody");
    if (!body) {
      return;
    }
    body.querySelectorAll("[data-analytics-pane]").forEach((pane) => {
      const isActive = pane.dataset.analyticsPane === this.analyticsAdvancedView;
      pane.id ||= `analyticsPane${pane.dataset.analyticsPane?.charAt(0).toUpperCase()}${pane.dataset.analyticsPane?.slice(1)}`;
      pane.setAttribute("role", "tabpanel");
      pane.hidden = !isActive;
      pane.classList.toggle("is-active", isActive);
      pane.setAttribute("aria-hidden", String(!isActive));
    });
    document.querySelectorAll("[data-analytics-view]").forEach((button) => {
      const isActive = button.dataset.analyticsView === this.analyticsAdvancedView;
      const paneId = `analyticsPane${button.dataset.analyticsView?.charAt(0).toUpperCase()}${button.dataset.analyticsView?.slice(1)}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", paneId);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });
  },

  renderGoalColorValue() {
    this.renderColorFieldValue("goalColorInput", "goalColorValue");
  },

  resetSettingsQuickScroll(root = Utils.$("manageQuickList")) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    let parent = root;
    while (parent instanceof HTMLElement) {
      if (parent.id === "settingsTab" || parent.matches(".settings-layout, .settings-panel--quick, .settings-quick-list")) {
        parent.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        parent.scrollTop = 0;
        parent.scrollLeft = 0;
      }
      if (parent.id === "settingsTab") {
        break;
      }
      parent = parent.parentElement;
    }
    root.scrollTop = 0;
    root.scrollLeft = 0;
    root.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  },

  rememberBudgetPointerAction(action = "", button = null) {
    if (!(button instanceof HTMLElement) || !action) {
      return;
    }
    this.budgetPointerActionGuard = {
      action,
      entryId: button.closest?.("[data-entry-id]")?.dataset?.entryId || "",
      field: button.dataset?.numpadField || "",
      targetId: button.dataset?.numpadTargetId || "",
      expiresAt: Date.now() + 400
    };
  },

  shouldSkipBudgetClickAction(action = "", button = null) {
    const guard = this.budgetPointerActionGuard;
    if (!guard || Date.now() > guard.expiresAt || !(button instanceof HTMLElement)) {
      if (guard && Date.now() > guard.expiresAt) {
        this.budgetPointerActionGuard = null;
      }
      return false;
    }
    const entryId = button.closest?.("[data-entry-id]")?.dataset?.entryId || "";
    const field = button.dataset?.numpadField || "";
    const targetId = button.dataset?.numpadTargetId || "";
    const matches = guard.action === action
      && guard.entryId === entryId
      && guard.field === field
      && guard.targetId === targetId;
    if (matches) {
      this.budgetPointerActionGuard = null;
    }
    return matches;
  },

  scheduleSettingsQuickScrollReset(frames = [0, 1, 3]) {
    const token = Date.now();
    this.settingsQuickScrollResetToken = token;
    const runReset = () => {
      if (this.settingsQuickScrollResetToken !== token || Store.activeTab !== "settingsTab") {
        return;
      }
      this.resetSettingsQuickScroll();
    };
    const steps = Array.isArray(frames) ? frames : [frames];
    steps.forEach((frame) => {
      const nextFrame = Math.max(0, Number(frame) || 0);
      if (nextFrame === 0) {
        runReset();
        return;
      }
      App.runAfterNextPaint(runReset, nextFrame);
    });
  },

  setSettingsQuickMode(mode = "template-recurring") {
    const nextMode = normalizeSettingsQuickMode(mode);
    this.settingsQuickMode = nextMode;
    try {
      sessionStorage.setItem("settingsQuickMode", nextMode);
    } catch {}
    if (Store.activeTab === "settingsTab") {
      this.renderQuickSettings();
      this.scheduleSettingsQuickScrollReset();
      const templateBucket = getQuickTemplateBucket(nextMode);
      const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
      UI.setSettingsStatus(
        nextMode === "favorite"
          ? "Показано избранное."
          : `Показаны: ${templateMeta?.title || "шаблоны"}.`,
        "info"
      );
    }
  },

  isBudgetSidePagerEnabled() {
    return Store.activeTab === "overviewTab"
      && typeof window !== "undefined"
      && window.matchMedia("(min-width: 1281px)").matches;
  },

  shiftBudgetSidePage(delta = 1) {
    const workspace = document.querySelector(".budget-workspace");
    const main = workspace?.querySelector(".budget-workspace__main");
    const side = workspace?.querySelector(".budget-workspace__side");
    const panel = document.querySelector(".budget-side-panel");
    const sections = Array.from(document.querySelectorAll(".budget-side-panel [data-budget-side-page]"));
    if (!sections.length) {
      return;
    }
    const stableHeight = (
      panel?.getBoundingClientRect?.().height ||
      side?.getBoundingClientRect?.().height ||
      main?.getBoundingClientRect?.().height ||
      0
    );
    if (stableHeight > 0) {
      this.setSyncedHeight?.(side, stableHeight);
      this.setSyncedHeight?.(panel, stableHeight);
    }
    this.budgetSidePage = (this.budgetSidePage + Number(delta || 0) + sections.length) % sections.length;
    this.syncBudgetSidePager(stableHeight);
    this.syncBudgetWorkspaceLayout?.(stableHeight);
  },

  syncBudgetSidePager(stableHeight = 0) {
    const panel = document.querySelector(".budget-side-panel");
    const pager = Utils.$("budgetSidePager");
    const index = Utils.$("budgetSidePagerIndex");
    const pages = panel?.querySelector(".budget-side-panel__pages");
    const sections = Array.from(panel?.querySelectorAll?.("[data-budget-side-page]") || []);
    if (!(panel instanceof HTMLElement) || !sections.length) {
      return;
    }

    const isPaged = this.isBudgetSidePagerEnabled();
    panel.classList.toggle("is-paged", isPaged);
    if (pager instanceof HTMLElement) {
      pager.hidden = !isPaged;
      pager.setAttribute("aria-hidden", String(!isPaged));
    }

    if (!isPaged) {
      this.clearPanelHeightSync?.(pages, ...sections);
      sections.forEach((section) => {
        section.hidden = false;
        section.classList.remove("is-active");
        section.setAttribute("aria-hidden", "false");
      });
      return;
    }

    const safeIndex = ((this.budgetSidePage % sections.length) + sections.length) % sections.length;
    this.budgetSidePage = safeIndex;
    sections.forEach((section, sectionIndex) => {
      const isActive = safeIndex === sectionIndex;
      section.hidden = !isActive;
      section.classList.toggle("is-active", isActive);
      section.setAttribute("aria-hidden", String(!isActive));
    });

    if (index) {
      index.textContent = `${safeIndex + 1} / ${sections.length}`;
    }

    if (stableHeight > 0 && pager instanceof HTMLElement && pages instanceof HTMLElement && typeof this.setSyncedHeight === "function") {
      const panelGap = parseFloat(getComputedStyle(panel).rowGap || getComputedStyle(panel).gap || "0") || 0;
      const pagerHeight = pager.getBoundingClientRect().height;
      const pagesHeight = Math.max(0, stableHeight - pagerHeight - panelGap);
      this.setSyncedHeight(pages, pagesHeight);
      sections.forEach((section) => this.setSyncedHeight(section, pagesHeight));
    } else {
      this.clearPanelHeightSync?.(pages, ...sections);
    }
  },

  getJournalSectionSortMode(section) {
    const mode = this.journalSectionSorts?.[section];
    return ["date-desc", "date-asc"].includes(mode) ? mode : "date-desc";
  },

  toggleJournalSectionSort(section) {
    if (!["incomes", "debts", "recurring", "expenses"].includes(section)) {
      return;
    }
    const currentMode = this.getJournalSectionSortMode(section);
    this.journalSectionSorts[section] = currentMode === "date-desc" ? "date-asc" : "date-desc";
    Storage.writeText(CONFIG.JOURNAL_SORT_KEY, JSON.stringify(this.journalSectionSorts));
    Store.sortSectionTransactions(section, currentMode);
  },

  renderJournalSortButtons() {
    document.querySelectorAll("[data-section-sort-btn]").forEach((button) => {
      const section = button.dataset.sectionSortBtn || "";
      const mode = this.getJournalSectionSortMode(section);
      const isAsc = mode === "date-asc";
      button.classList.toggle("is-active", true);
      button.classList.toggle("is-manual", false);
      button.title = isAsc ? "Одноразово показать старые даты сверху" : "Одноразово показать новые даты сверху";
      button.setAttribute(
        "aria-label",
        isAsc
          ? "Одноразовая сортировка по дате: старые сверху"
          : "Одноразовая сортировка по дате: новые сверху"
      );
      button.setAttribute("aria-pressed", "false");
      const icon = button.querySelector(".journal-sort-inline__icon");
      if (icon) {
        icon.textContent = isAsc ? "↑" : "↓";
      } else {
        button.textContent = isAsc ? "↑" : "↓";
      }
    });
  },

  syncGoalModeFields() {
    const mode = Utils.$("goalModeInput")?.value || "balance";
    const savedField = Utils.$("goalSavedField");
    if (savedField) {
      savedField.classList.toggle("is-hidden", mode !== "saved");
    }
  },

  setHeatmapHintOpen(nextOpen) {
    const shouldOpen = Boolean(nextOpen);
    this.heatmapHintOpen = shouldOpen;
    document.querySelectorAll(".heatmap-v2__hint").forEach((button) => {
      button.classList.toggle("is-open", shouldOpen);
      button.setAttribute("aria-expanded", String(shouldOpen));
      button.setAttribute("aria-pressed", String(shouldOpen));
    });
    document.querySelectorAll(".heatmap-v2__hint-bubble").forEach((bubble) => {
      bubble.classList.toggle("is-open", shouldOpen);
      bubble.toggleAttribute("hidden", !shouldOpen);
    });
  },

  getBudgetNumpadRoot() {
    return Utils.$("budgetAmountPad");
  },

  getBudgetDayPadRoot() {
    return Utils.$("budgetDayPad");
  },

  getBudgetDayPadTitleNode() {
    return Utils.$("budgetDayPadTitle");
  },

  getBudgetDayPadGrid() {
    return Utils.$("budgetDayPadGrid");
  },

  getBudgetDayPadTodayButton() {
    return Utils.$("budgetDayPadTodayBtn");
  },

  getBudgetDayPadField() {
    if (!this.budgetDayPadState.itemId) {
      return null;
    }
    const row = document.querySelector(`.entry-row[data-entry-id="${this.budgetDayPadState.itemId}"]`);
    const input = row?.querySelector('[data-journal-field="day"]');
    return input instanceof HTMLInputElement ? input : null;
  },

  getBudgetDayPadTrigger() {
    if (!this.budgetDayPadState.itemId) {
      return null;
    }
    const row = document.querySelector(`.entry-row[data-entry-id="${this.budgetDayPadState.itemId}"]`);
    const button = row?.querySelector('[data-journal-action="pick-day"]');
    return button instanceof HTMLElement ? button : null;
  },

  renderBudgetDayPad() {
    const titleNode = this.getBudgetDayPadTitleNode();
    const grid = this.getBudgetDayPadGrid();
    const todayButton = this.getBudgetDayPadTodayButton();
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    const { monthKey, year, monthIndex, value } = this.budgetDayPadState;
    const daysInMonth = year && Number.isInteger(monthIndex)
      ? new Date(year, monthIndex + 1, 0).getDate()
      : 31;
    if (titleNode) {
      titleNode.textContent = monthKey ? Utils.monthLabel(monthKey) : "Выберите день";
    }
    const buttons = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      buttons.push(`
        <button
          class="budget-daypad__day${day === value ? " is-active" : ""}"
          type="button"
          data-budget-day-value="${day}"
          aria-pressed="${day === value ? "true" : "false"}"
        >${day}</button>
      `);
    }
    grid.innerHTML = buttons.join("");

    if (todayButton) {
      const today = new Date();
      const isCurrentMonth = monthKey === Utils.monthKey(today);
      todayButton.hidden = !isCurrentMonth;
      if (isCurrentMonth) {
        todayButton.textContent = "Сегодня";
      }
    }
  },

  positionBudgetDayPad() {
    if (!this.budgetDayPadState.open) {
      return;
    }
    const root = this.getBudgetDayPadRoot();
    const trigger = this.getBudgetDayPadTrigger();
    if (!(root instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const padRect = root.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 8;
    let left = triggerRect.right - padRect.width;
    let top = triggerRect.bottom + gap;
    if (left < 12) {
      left = 12;
    }
    if (left + padRect.width > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - padRect.width - 12);
    }
    if (top + padRect.height > viewportHeight - 12) {
      top = Math.max(12, triggerRect.top - padRect.height - gap);
    }
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  },

  openBudgetDayPad(button) {
    const row = button?.closest?.("[data-entry-id]");
    if (!(button instanceof HTMLElement) || !(row instanceof HTMLElement)) {
      return;
    }
    const itemId = row.dataset.entryId || "";
    const transaction = Store.data.transactions.find((item) => item.id === itemId);
    const root = this.getBudgetDayPadRoot();
    if (!transaction || !(root instanceof HTMLElement)) {
      return;
    }
    if (this.budgetDayPadState.open && this.budgetDayPadState.itemId === itemId) {
      this.closeBudgetDayPad({ restoreFocus: true });
      return;
    }
    const monthKey = transaction.date.slice(0, 7);
    const [year, month] = monthKey.split("-").map(Number);
    this.closeBudgetNumpad({ commit: true, restoreFocus: false });
    this.closeBudgetDayPad({ restoreFocus: false });
    this.budgetDayPadState = {
      open: true,
      itemId,
      monthKey,
      year,
      monthIndex: month - 1,
      value: Number(transaction.date.slice(-2)) || 1
    };
    button.classList.add("is-active");
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    this.renderBudgetDayPad();
    this.positionBudgetDayPad();
  },

  closeBudgetDayPad({ restoreFocus = false } = {}) {
    const root = this.getBudgetDayPadRoot();
    const trigger = this.getBudgetDayPadTrigger();
    if (root instanceof HTMLElement) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.style.removeProperty("left");
      root.style.removeProperty("top");
    }
    if (trigger instanceof HTMLElement) {
      trigger.classList.remove("is-active");
      if (restoreFocus) {
        trigger.focus({ preventScroll: true });
      }
    }
    this.budgetDayPadState = {
      open: false,
      itemId: "",
      monthKey: "",
      year: 0,
      monthIndex: 0,
      value: 1
    };
  },

  applyBudgetDayValue(value) {
    if (!this.budgetDayPadState.open) {
      return;
    }
    const field = this.getBudgetDayPadField();
    if (!(field instanceof HTMLInputElement)) {
      this.closeBudgetDayPad({ restoreFocus: false });
      return;
    }
    const day = Utils.clampDay(this.budgetDayPadState.year, this.budgetDayPadState.monthIndex, value);
    field.value = String(day);
    App.commitJournalFieldEdit(field);
    this.closeBudgetDayPad({ restoreFocus: true });
  },

  getBudgetNumpadValueNode() {
    return Utils.$("budgetAmountPadValue");
  },

  getBudgetNumpadField() {
    const { source, itemId, field, targetId } = this.budgetNumpadState;
    if (source === "field") {
      const input = targetId ? Utils.$(targetId) : null;
      return input instanceof HTMLInputElement ? input : null;
    }
    if (!itemId || !field) {
      return null;
    }
    const row = document.querySelector(`.entry-row[data-entry-id="${itemId}"]`);
    const input = row?.querySelector(`[data-journal-field="${field}"]`);
    return input instanceof HTMLInputElement ? input : null;
  },

  getBudgetNumpadTrigger() {
    const { source, itemId, field, targetId } = this.budgetNumpadState;
    if (source === "field") {
      if (!targetId) {
        return null;
      }
      const button = document.querySelector(`[data-journal-action="open-amount-keypad"][data-numpad-target-id="${targetId}"]`);
      return button instanceof HTMLElement ? button : null;
    }
    if (!itemId || !field) {
      return null;
    }
    const row = document.querySelector(`.entry-row[data-entry-id="${itemId}"]`);
    const button = row?.querySelector(`[data-journal-action="open-amount-keypad"][data-numpad-field="${field}"]`);
    return button instanceof HTMLElement ? button : null;
  },

  renderBudgetNumpad() {
    const valueNode = this.getBudgetNumpadValueNode();
    if (valueNode) {
      valueNode.textContent = this.budgetNumpadState.value || "0";
    }
  },

  positionBudgetNumpad() {
    if (!this.budgetNumpadState.open) {
      return;
    }
    const root = this.getBudgetNumpadRoot();
    const trigger = this.getBudgetNumpadTrigger();
    if (!(root instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const padRect = root.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 8;
    let left = triggerRect.right - padRect.width;
    let top = triggerRect.bottom + gap;
    if (left < 12) {
      left = 12;
    }
    if (left + padRect.width > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - padRect.width - 12);
    }
    if (top + padRect.height > viewportHeight - 12) {
      top = Math.max(12, triggerRect.top - padRect.height - gap);
    }
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  },

  syncBudgetNumpadFieldValue() {
    const field = this.getBudgetNumpadField();
    if (field) {
      field.value = this.budgetNumpadState.value;
    }
    return field;
  },

  openBudgetNumpad(button) {
    const directTargetId = button?.dataset?.numpadTargetId || "";
    const row = button?.closest?.("[data-entry-id]");
    const fieldName = button?.dataset?.numpadField || "amount";
    const input = directTargetId
      ? Utils.$(directTargetId)
      : row?.querySelector?.(`[data-journal-field="${fieldName}"]`);
    const root = this.getBudgetNumpadRoot();
    if (!(button instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(root instanceof HTMLElement)) {
      return;
    }
    if (!directTargetId && !(row instanceof HTMLElement)) {
      return;
    }
    if (
      this.budgetNumpadState.open &&
      (
        (directTargetId && this.budgetNumpadState.source === "field" && this.budgetNumpadState.targetId === directTargetId) ||
        (!directTargetId && this.budgetNumpadState.source === "journal" && this.budgetNumpadState.itemId === row.dataset.entryId && this.budgetNumpadState.field === fieldName)
      )
    ) {
      this.closeBudgetNumpad({ commit: true, restoreFocus: true });
      return;
    }
    this.closeBudgetNumpad({ commit: true, restoreFocus: false });
    this.budgetNumpadState = {
      open: true,
      source: directTargetId ? "field" : "journal",
      itemId: directTargetId ? "" : (row.dataset.entryId || ""),
      field: directTargetId ? "" : fieldName,
      targetId: directTargetId,
      value: String(input.value || "")
    };
    document.querySelectorAll("[data-journal-action='open-amount-keypad'].is-active").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    this.renderBudgetNumpad();
    this.positionBudgetNumpad();
  },

  closeBudgetNumpad({ commit = true, restoreFocus = false } = {}) {
    const root = this.getBudgetNumpadRoot();
    const trigger = this.getBudgetNumpadTrigger();
    const field = this.syncBudgetNumpadFieldValue();
    const wasOpen = this.budgetNumpadState.open;
    if (wasOpen && commit && field) {
      if (this.budgetNumpadState.source === "journal") {
        App.commitJournalFieldEdit(field);
      } else {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (root instanceof HTMLElement) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.style.removeProperty("left");
      root.style.removeProperty("top");
    }
    if (trigger instanceof HTMLElement) {
      trigger.classList.remove("is-active");
      if (restoreFocus) {
        trigger.focus({ preventScroll: true });
      }
    }
    this.budgetNumpadState = {
      open: false,
      source: "journal",
      itemId: "",
      field: "",
      targetId: "",
      value: ""
    };
  },

  applyBudgetNumpadToken(token) {
    if (!this.budgetNumpadState.open) {
      return;
    }
    const raw = String(this.budgetNumpadState.value || "");
    let next = raw;
    if (token === "backspace") {
      next = raw.slice(0, -1);
    } else if (token === "clear") {
      next = "";
    } else if (token === ",") {
      if (!raw.includes(".") && !raw.includes(",")) {
        next = raw ? `${raw},` : "0,";
      }
    } else if (/^\d$/.test(token)) {
      next = raw === "0" ? token : `${raw}${token}`;
    }
    next = next.replace(/[^\d,.]/g, "");
    const commaIndex = next.search(/[,.]/);
    if (commaIndex !== -1) {
      const integer = next.slice(0, commaIndex).replace(/[,.]/g, "");
      const fraction = next.slice(commaIndex + 1).replace(/[,.]/g, "");
      next = `${integer || "0"},${fraction.slice(0, 2)}`;
    } else {
      next = next.replace(/[,.]/g, "");
    }
    this.budgetNumpadState.value = next;
    this.syncBudgetNumpadFieldValue();
    this.renderBudgetNumpad();
    this.positionBudgetNumpad();
  },

  ensureFieldNumpadControl(inputId, labelText) {
    const input = Utils.$(inputId);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    input.type = "text";
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    let wrapper = input.parentElement;
    if (!(wrapper instanceof HTMLElement) || !wrapper.classList.contains("field-affix-control")) {
      wrapper = document.createElement("div");
      wrapper.className = "field-affix-control";
      if (inputId === "monthStartInput") {
        wrapper.classList.add("field-affix-control--month-balance");
      }
      input.parentNode?.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
    let button = wrapper.querySelector(`[data-journal-action="open-amount-keypad"][data-numpad-target-id="${inputId}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "entry-amount-keypad entry-control-affix field-affix-control__button";
      button.dataset.journalAction = "open-amount-keypad";
      button.dataset.numpadTargetId = inputId;
      button.setAttribute("aria-label", labelText);
      button.title = labelText;
      button.innerHTML = Utils.icon("dialpad");
      wrapper.appendChild(button);
    }
  },

  decorateStaticNumpadTargets() {
    [
      ["monthStartInput", "Открыть цифровой блок для начального остатка"],
      ["editAmountInput", "Открыть цифровой блок для суммы"],
      ["templateAmountInput", "Открыть цифровой блок для суммы"],
      ["categoryLimitInput", "Открыть цифровой блок для лимита"],
      ["goalTargetInput", "Открыть цифровой блок для целевой суммы"],
      ["goalSavedInput", "Открыть цифровой блок для накопленной суммы"],
      ["amountInput", "Открыть цифровой блок для суммы"]
    ].forEach(([inputId, labelText]) => this.ensureFieldNumpadControl(inputId, labelText));
  },

  getBudgetRowFlowTargets(row) {
    if (!(row instanceof HTMLElement)) {
      return [];
    }
    const selectors = row.classList.contains("entry-row--wishlist")
      ? [
        '[data-journal-field="wish-desc"]',
        '[data-journal-field="wish-amount"]',
        '[data-journal-action="fulfill-wish"]'
      ]
      : [
        '[data-journal-field="day"]',
        '[data-journal-field="amount"]',
        '[data-journal-field="description"]'
      ];
    return selectors
      .map((selector) => row.querySelector(selector))
      .filter((element) => element instanceof HTMLElement && !element.hasAttribute("disabled"));
  },

  focusBudgetFlowTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    target.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.select?.();
    }
  },

  getBudgetFlowSelector(target) {
    if (!(target instanceof HTMLElement)) {
      return "";
    }
    if (target.matches('[data-journal-field="day"]')) {
      return '[data-journal-field="day"]';
    }
    if (target.matches('[data-journal-field="amount"]')) {
      return '[data-journal-field="amount"]';
    }
    if (target.matches('[data-journal-field="description"]')) {
      return '[data-journal-field="description"]';
    }
    if (target.matches('[data-journal-field="wish-desc"]')) {
      return '[data-journal-field="wish-desc"]';
    }
    if (target.matches('[data-journal-field="wish-amount"]')) {
      return '[data-journal-field="wish-amount"]';
    }
    if (target.matches('[data-journal-action="fulfill-wish"]')) {
      return '[data-journal-action="fulfill-wish"]';
    }
    return "";
  },

  queueBudgetFlowFocus(parentRoot, rowIndex, selector) {
    if (!(parentRoot instanceof HTMLElement) || !selector) {
      return;
    }
    App.runAfterNextPaint(() => {
      const rows = Array.from(parentRoot.querySelectorAll(".entry-row"));
      const nextRow = rows[rowIndex];
      const nextTarget = nextRow?.querySelector(selector);
      if (nextTarget instanceof HTMLElement) {
        this.focusBudgetFlowTarget(nextTarget);
      }
    }, 1);
  },

  flushPendingBudgetFlow(attempt = 0) {
    const pending = this.budgetFlowPending;
    if (!pending) {
      return;
    }
    App.runAfterNextPaint(() => {
      if (pending.type === "focus") {
        const rows = Array.from(pending.parentRoot?.querySelectorAll?.(".entry-row") || []);
        const nextRow = rows[pending.rowIndex];
        const nextTarget = nextRow?.querySelector(pending.selector);
        if (!(nextTarget instanceof HTMLElement)) {
          if (attempt < 6) {
            this.flushPendingBudgetFlow(attempt + 1);
            return;
          }
          this.budgetFlowPending = null;
          return;
        }
        this.budgetFlowPending = null;
        if (nextRow instanceof HTMLElement && pending.scrollRow) {
          nextRow.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
        this.focusBudgetFlowTarget(nextTarget);
        const reinforceFocus = () => {
          const currentRows = Array.from(pending.parentRoot?.querySelectorAll?.(".entry-row") || []);
          const currentRow = currentRows[pending.rowIndex];
          const currentTarget = currentRow?.querySelector(pending.selector);
          if (currentTarget instanceof HTMLElement && document.activeElement !== currentTarget) {
            this.focusBudgetFlowTarget(currentTarget);
          }
        };
        App.runAfterNextPaint(reinforceFocus, 2);
        App.runAfterNextPaint(reinforceFocus, 5);
        return;
      }
      if (pending.type !== "create") {
        this.budgetFlowPending = null;
        return;
      }
      const addButton = document.querySelector(`[data-journal-action="add-row"][data-section="${pending.section}"]`);
      if (!(addButton instanceof HTMLElement)) {
        if (attempt < 6) {
          this.flushPendingBudgetFlow(attempt + 1);
          return;
        }
        this.budgetFlowPending = null;
        return;
      }
      this.budgetFlowPending = null;
      addButton.click();
      App.runAfterNextPaint(() => {
        const rows = Array.from(pending.parentRoot?.querySelectorAll?.(".entry-row") || []);
        const addedRow = rows[rows.length - 1];
        const addedTarget = this.getBudgetRowFlowTargets(addedRow)[0];
        if (addedRow instanceof HTMLElement) {
          addedRow.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
        if (addedTarget instanceof HTMLElement) {
          this.focusBudgetFlowTarget(addedTarget);
        }
      }, 2);
    }, 1);
  },

  moveBudgetRowFlow(currentRow, currentTarget, direction = 1, { allowCreate = false } = {}) {
    if (!(currentRow instanceof HTMLElement) || !(currentTarget instanceof HTMLElement)) {
      return false;
    }
    const siblingRows = Array.from(currentRow.parentElement?.querySelectorAll?.(".entry-row") || []);
    const rowIndex = siblingRows.indexOf(currentRow);
    if (rowIndex === -1) {
      return false;
    }
    const targets = this.getBudgetRowFlowTargets(currentRow);
    const currentIndex = targets.indexOf(currentTarget);
    if (currentIndex === -1) {
      return false;
    }
    const currentRoot = currentRow.parentElement;
    const isCompactTextarea = currentTarget.matches("textarea[data-compact='true']");
    const nextTarget = targets[currentIndex + direction];
    if (nextTarget) {
      if (isCompactTextarea) {
        this.budgetFlowPending = {
          type: "focus",
          parentRoot: currentRoot,
          rowIndex,
          selector: this.getBudgetFlowSelector(nextTarget),
          scrollRow: false
        };
        currentTarget.blur();
        return true;
      }
      this.focusBudgetFlowTarget(nextTarget);
      this.queueBudgetFlowFocus(currentRoot, rowIndex, this.getBudgetFlowSelector(nextTarget));
      return true;
    }

    const siblingIndex = rowIndex + direction;
    const siblingRow = siblingRows[siblingIndex];
    if (siblingRow instanceof HTMLElement) {
      const siblingTargets = this.getBudgetRowFlowTargets(siblingRow);
      const siblingTarget = direction > 0 ? siblingTargets[0] : siblingTargets[siblingTargets.length - 1];
      if (siblingTarget) {
        if (isCompactTextarea) {
          this.budgetFlowPending = {
            type: "focus",
            parentRoot: currentRoot,
            rowIndex: siblingIndex,
            selector: this.getBudgetFlowSelector(siblingTarget),
            scrollRow: true
          };
          currentTarget.blur();
          return true;
        }
        siblingRow.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        this.focusBudgetFlowTarget(siblingTarget);
        this.queueBudgetFlowFocus(currentRoot, siblingIndex, this.getBudgetFlowSelector(siblingTarget));
        return true;
      }
    }

    if (!allowCreate || direction < 0) {
      return false;
    }
    const section = currentRow.dataset.section || "";
    const addButton = section
      ? document.querySelector(`[data-journal-action="add-row"][data-section="${section}"]`)
      : null;
    if (!(addButton instanceof HTMLElement)) {
      return false;
    }
    const parentRoot = currentRoot;
    if (isCompactTextarea) {
      this.budgetFlowPending = {
        type: "create",
        parentRoot,
        section
      };
      currentTarget.blur();
      return true;
    }
    addButton.click();
    App.runAfterNextPaint(() => {
      const rows = Array.from(parentRoot?.querySelectorAll?.(".entry-row") || []);
      const addedRow = rows[rows.length - 1];
      const addedTarget = this.getBudgetRowFlowTargets(addedRow)[0];
      if (addedTarget) {
        addedRow.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        this.focusBudgetFlowTarget(addedTarget);
      }
    }, 2);
    return true;
  },

  handleBudgetKeyboardFlow(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const isCompactTextarea = target.matches("textarea[data-compact='true']");
    const row = target.closest(".entry-row");
    if (!(row instanceof HTMLElement)) {
      return false;
    }
    if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (this.moveBudgetRowFlow(row, target, event.shiftKey ? -1 : 1)) {
        event.preventDefault();
        if (isCompactTextarea) {
          App.runAfterNextPaint(() => this.flushPendingBudgetFlow(), 6);
        }
        return true;
      }
      return false;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    if (this.moveBudgetRowFlow(row, target, 1, { allowCreate: true })) {
      event.preventDefault();
      if (isCompactTextarea) {
        App.runAfterNextPaint(() => this.flushPendingBudgetFlow(), 6);
      }
      return true;
    }
    return false;
  },

  handleEnterAdvance(event) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey) {
      return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const form = target.closest("form, .entry-row");
    if (!form) {
      return false;
    }
    if (target.tagName === "TEXTAREA") {
      if (!(event.ctrlKey || event.metaKey)) {
        return false;
      }
    }

    const focusables = Array.from(form.querySelectorAll("input, select, textarea, button"))
      .filter((element) => !element.disabled && element.type !== "hidden" && element.tabIndex !== -1 && element.offsetParent !== null);
    if (!focusables.length) {
      return false;
    }
    const currentIndex = focusables.indexOf(target);
    if (currentIndex === -1) {
      return false;
    }

    event.preventDefault();
    const next = focusables[currentIndex + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.select?.();
      }
      return true;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
      return true;
    }
    if (form instanceof HTMLFormElement) {
      form.requestSubmit?.();
      return true;
    }
    return false;
  },

  isJournalDragBlockedTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(
      target.closest(
        "input, textarea, select, option, button, a, summary, label, [contenteditable='true'], [data-journal-action], [data-action], [data-setting-action], [data-picker-toggle], .entry-field, .compact-textarea.is-editing"
      )
    );
  },

  init() {
    this.decorateStaticNumpadTargets();
    this.budgetFiltersCollapsed = Storage.readText(CONFIG.BUDGET_FILTERS_KEY, "1") !== "0";
    try {
      const savedSorts = JSON.parse(Storage.readText(CONFIG.JOURNAL_SORT_KEY, "{}"));
        this.journalSectionSorts = {
          incomes: ["date-desc", "date-asc"].includes(savedSorts.incomes) ? savedSorts.incomes : "date-desc",
          debts: ["date-desc", "date-asc"].includes(savedSorts.debts) ? savedSorts.debts : "date-desc",
          recurring: ["date-desc", "date-asc"].includes(savedSorts.recurring) ? savedSorts.recurring : "date-desc",
          expenses: ["date-desc", "date-asc"].includes(savedSorts.expenses) ? savedSorts.expenses : "date-desc"
        };
      } catch {
        this.journalSectionSorts = {
          incomes: "date-desc",
          debts: "date-desc",
          recurring: "date-desc",
          expenses: "date-desc"
        };
    }
    this.applySidebarState(true);
    this.syncResponsiveShell();
    this.bindEvents();
    this.setupAutoResize();
  },

  bindEvents() {
    const on = (id, eventName, handler) => {
      const element = Utils.$(id);
      if (element) {
        element.addEventListener(eventName, handler);
      }
    };
    const bindAuthEnter = (id, source) => {
      on(id, "keydown", (event) => {
        if (
          event.key === "Enter" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          App.authenticate(source, "login");
        }
      });
    };

    on("themeToggleBtn", "click", () => App.toggleTheme());
    on("sidebarToggleBtn", "click", () => this.toggleSidebar());
    on("prevMonthBtn", "click", () => App.shiftMonth(-1));
    on("nextMonthBtn", "click", () => App.shiftMonth(1));
    on("todayBtn", "click", () => App.goToCurrentMonth());
    on("monthStartInput", "input", (event) => App.updateMonthStart(event.target.value, { render: false }));
    on("monthStartInput", "change", (event) => App.updateMonthStart(event.target.value));
    on("manualStartCheck", "change", (event) => App.toggleManualMonthStart(event.target.checked));
    on("editTransactionForm", "submit", (event) => {
      event.preventDefault();
      App.saveEditedTransaction();
    });
    on("moveTransactionForm", "submit", (event) => {
      event.preventDefault();
      App.saveMovedTransaction();
    });
    on("moveTransactionMonthInput", "input", () => App.updateMoveTransactionDateNote());
    on("categoryForm", "submit", (event) => {
      event.preventDefault();
      App.saveCategory();
    });
    on("templateForm", "submit", (event) => {
      event.preventDefault();
      App.saveTemplate();
    });
    on("goalForm", "submit", (event) => {
      event.preventDefault();
      App.saveGoal();
    });
    on("startupAuthForm", "submit", (event) => {
      event.preventDefault();
      App.authenticate("startup", "login");
    });
    on("modalAuthForm", "submit", (event) => {
      event.preventDefault();
      App.authenticate("modal", "login");
    });
    on("startupRegisterBtn", "click", () => App.authenticate("startup", "register"));
    on("modalRegisterBtn", "click", () => App.authenticate("modal", "register"));
    on("startupRecoverBtn", "click", () => App.openPasswordRecovery("startup"));
    on("modalRecoverBtn", "click", () => App.openPasswordRecovery("modal"));
    on("passwordRecoveryForm", "submit", (event) => {
      event.preventDefault();
      App.submitPasswordRecovery();
    });
    on("passwordChangeForm", "submit", (event) => {
      event.preventDefault();
      App.submitPasswordChange();
    });
    bindAuthEnter("startupLogin", "startup");
    bindAuthEnter("startupPassword", "startup");
    bindAuthEnter("modalLogin", "modal");
    bindAuthEnter("modalPassword", "modal");
    on("editTypeSwitch", "change", () => this.renderEditCategories());
    on("templateTypeInput", "change", () => {
      App.syncTemplateFormState();
      this.renderTemplateCategories();
    });
    on("budgetFilterToggleBtn", "click", () => this.toggleBudgetFilters());
    on("listSummary", "click", () => this.toggleBudgetFilters());
    on("filterPeriod", "change", (event) => App.updateFilter("period", event.target.value));
    on("filterType", "change", (event) => {
      App.updateFilter("type", event.target.value);
      App.updateFilter("categoryId", "all");
      this.renderFilterCategories();
    });
    on("filterCategory", "change", (event) => App.updateFilter("categoryId", event.target.value));
    on("sortSelect", "change", (event) => App.updateFilter("sort", event.target.value));
    on("searchInput", "input", (event) => App.updateFilter("search", event.target.value));
    on("filterDateFrom", "change", (event) => App.updateFilter("dateFrom", event.target.value));
    on("filterDateTo", "change", (event) => App.updateFilter("dateTo", event.target.value));
    on("accountBtn", "click", () => App.openAccountEntry());
    on("undoBtn", "click", () => App.undo());
    on("redoBtn", "click", () => App.redo());
    on("exportBtn", "click", () => App.exportBackup());
    on("importBtn", "click", () => Utils.$("importFileInput")?.click());
    on("importFileInput", "change", (event) => App.importBackup(event));
    on("openCategoryCreateBtn", "click", () => App.openCategoryModal());
    on("deleteCategoryBtn", "click", () => App.deleteCurrentCategory());
    on("loadIncomeTemplateBtn", "click", () => App.openPicker("templates-income"));
    on("loadDebtTemplateBtn", "click", () => App.openPicker("templates-debt"));
    on("loadTemplateBtn", "click", () => App.openPicker("templates-recurring"));
    on("loadFavoriteBtn", "click", () => App.openPicker("favorites"));
    on("settingsQuickCreateBtn", "click", () => App.createQuickItem(this.settingsQuickMode));
    on("settingsQuickTemplatesBtn", "click", () => this.setSettingsQuickMode("template-recurring"));
    on("settingsQuickIncomeBtn", "click", () => this.setSettingsQuickMode("template-income"));
    on("settingsQuickDebtBtn", "click", () => this.setSettingsQuickMode("template-debt"));
    on("settingsQuickFavoritesBtn", "click", () => this.setSettingsQuickMode("favorite"));
    on("deleteGoalBtn", "click", () => App.deleteCurrentGoal());
    on("pickerApplyBtn", "click", () => App.applyPickerSelection());
    on("accountSyncNowBtn", "click", () => App.syncNow());
    on("accountLogoutBtn", "click", () => App.logout());
    on("accountPasswordInfoBtn", "click", () => App.openPasswordChange());
    on("accountSessionsBtn", "click", () => App.openSessions());
    on("accountRecoveryCodeBtn", "click", () => App.regenerateRecoveryCode());
    on("downloadRecoveryCodeBtn", "click", () => App.downloadRecoveryCode());
    on("revokeOtherSessionsBtn", "click", () => App.revokeOtherSessions());
    on("applyUpdateBtn", "click", () => App.applyAppUpdate());
    on("demoResetBtn", "click", () => App.resetDemo());
    on("syncChoiceKeepLocalBtn", "click", () => App.resolveSyncChoice("local"));
    on("syncChoiceUseCloudBtn", "click", () => App.resolveSyncChoice("cloud"));
    on("syncChoiceCancelBtn", "click", () => App.resolveSyncChoice("cancel"));
    on("editCategoryTriggerBtn", "click", () => App.openEditFormCategoryPicker());
    on("templateCategoryTriggerBtn", "click", () => App.openTemplateFormCategoryPicker());
    on("categoryColorInput", "input", () => this.renderCategoryColorValue());
    on("goalColorInput", "input", () => this.renderGoalColorValue());
    on("goalModeInput", "change", () => this.syncGoalModeFields());

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.addEventListener("click", () => App.switchTab(button.dataset.tabTarget));
    });

      document.addEventListener("click", (event) => {
        const confirmationResult = event.target.closest("[data-confirm-result]");
        if (confirmationResult) {
          this.resolveConfirmation(confirmationResult.dataset.confirmResult === "accept");
          return;
        }

        const heatmapHintTarget = event.target.closest(".heatmap-v2__hint, .heatmap-v2__hint-bubble");
        if (!heatmapHintTarget && this.heatmapHintOpen) {
          this.setHeatmapHintOpen(false);
        }

        const mobileQuickSurface = event.target.closest("#mobileQuickSheet, #mobileFabBtn");
        if (!mobileQuickSurface && Utils.$("appShell")?.classList.contains("is-mobile-quick-open")) {
          this.setMobileQuickAddOpen(false);
        }

        const budgetNumpadKey = event.target.closest("[data-budget-numpad-key]");
        if (budgetNumpadKey) {
          this.applyBudgetNumpadToken(budgetNumpadKey.dataset.budgetNumpadKey || "");
          return;
        }

        const budgetNumpadAction = event.target.closest("[data-budget-numpad-action]");
        if (budgetNumpadAction) {
          this.applyBudgetNumpadToken(budgetNumpadAction.dataset.budgetNumpadAction || "");
          return;
        }

        const budgetDayValue = event.target.closest("[data-budget-day-value]");
        if (budgetDayValue) {
          this.applyBudgetDayValue(budgetDayValue.dataset.budgetDayValue || "");
          return;
        }

        const budgetDayAction = event.target.closest("[data-budget-day-action]");
        if (budgetDayAction) {
          if (budgetDayAction.dataset.budgetDayAction === "today") {
            this.applyBudgetDayValue(new Date().getDate());
          }
          return;
        }

        const budgetDayToggle = event.target.closest("[data-journal-action='pick-day']");
        const budgetDayTarget = event.target.closest("#budgetDayPad");
        if (!budgetDayToggle && !budgetDayTarget && this.budgetDayPadState.open) {
          this.closeBudgetDayPad({ restoreFocus: false });
        }

        const budgetNumpadToggle = event.target.closest("[data-journal-action='open-amount-keypad']");
        const budgetNumpadTarget = event.target.closest("#budgetAmountPad");
        if (!budgetNumpadToggle && !budgetNumpadTarget && this.budgetNumpadState.open) {
          this.closeBudgetNumpad({ commit: true, restoreFocus: false });
        }
        if (budgetNumpadToggle) {
          if (this.shouldSkipBudgetClickAction("open-amount-keypad", budgetNumpadToggle)) {
            return;
          }
          this.openBudgetNumpad(budgetNumpadToggle);
          return;
        }

        const passwordToggle = event.target.closest("[data-password-toggle]");
        if (passwordToggle) {
          UI.togglePasswordVisibility(passwordToggle.dataset.passwordToggle, passwordToggle);
          return;
        }

        const analyticsViewButton = event.target.closest("[data-analytics-view]");
        if (analyticsViewButton) {
          this.setAnalyticsAdvancedView(analyticsViewButton.dataset.analyticsView);
          return;
        }

      const closeTarget = event.target.closest("[data-close-modal]");
      if (closeTarget) {
        if (closeTarget.dataset.closeModal === "syncChoiceModal") {
          App.resolveSyncChoice("cancel");
          return;
        }
        this.closeModal(closeTarget.dataset.closeModal);
      }

      const actionButton = event.target.closest("[data-action]");
        if (actionButton) {
          const { action, id, month } = actionButton.dataset;
          if (action === "budget-side-prev") {
            this.shiftBudgetSidePage(-1);
            return;
          }
          if (action === "budget-side-next") {
            this.shiftBudgetSidePage(1);
            return;
          }
          if (action === "toggle-mobile-drawer") {
            this.setMobileQuickAddOpen(false);
            this.toggleMobileDrawer();
            return;
          }
          if (action === "close-mobile-drawer") {
            this.setMobileDrawerOpen(false);
            return;
          }
          if (action === "toggle-mobile-quick-add") {
            this.setMobileDrawerOpen(false);
            this.toggleMobileQuickAdd();
            return;
          }
          if (action === "scroll-to-top") {
            actionButton.blur?.();
            window.scrollTo({
              top: 0,
              left: 0,
              behavior: this.prefersReducedMotion() ? "auto" : "smooth"
            });
            this.scheduleScrollTopButtonUpdate();
            return;
          }
          if (action === "jump-budget-section") {
            App.scrollToBudgetSection(actionButton.dataset.section || "");
            return;
          }
          if (action === "shift-move-month") {
            App.shiftMoveTransactionMonth(Number(actionButton.dataset.delta || 0));
            return;
          }
          if (action === "set-move-current-month") {
            App.setMoveTransactionMonth(Utils.monthKey(new Date()));
            return;
          }
          if (action === "close-mobile-quick-add") {
            this.setMobileQuickAddOpen(false);
            return;
          }
          if (action === "mobile-quick-add") {
            App.addBudgetQuickRow(actionButton.dataset.section || "expenses");
            return;
          }
          if (action === "toggle-heatmap-hint") {
            const nextOpen = actionButton.getAttribute("aria-expanded") !== "true";
            this.setHeatmapHintOpen(nextOpen);
            return;
          }
          if (action === "focus-transaction") {
            App.openTransactionInBudget(id);
          }
        if (action === "load-more-filtered") {
          this.filteredVisibleCount += this.filteredPageSize;
          const root = Utils.$("transactionsList");
          if (root) delete root.dataset.renderSignature;
          this.renderTransactions();
        }
        if (action === "delete-transaction") {
          App.deleteTransaction(id);
        }
        if (action === "edit-category") {
          App.openCategoryModal(id);
        }
        if (action === "delete-category") {
          App.deleteCategory(id);
        }
        if (action === "apply-template") {
          App.applyTemplate(id);
        }
        if (action === "open-month") {
          App.openMonth(month);
        }
        if (action === "logout") {
          App.logout();
        }
        if (action === "connect-account") {
          this.openModal("authModal");
        }
        if (action === "edit-goal") {
          App.openGoalModal(id);
        }
        if (action === "delete-goal") {
          App.deleteGoal(id);
        }
        if (action === "create-goal-inline") {
          App.openGoalModal();
        }
        if (action === "open-payment-transaction") {
          App.openTransactionInBudget(id);
        }
        if (action === "open-recurring-budget") {
          App.openRecurringInBudget(actionButton.dataset.query || "");
        }
        if (action === "select-calendar-day") {
          const nextDate = actionButton.dataset.date || "";
          if (!nextDate || nextDate === this.calendarSelectedDate) {
            return;
          }
          actionButton.blur?.();
          this.calendarSelectedDate = nextDate;
          const paymentCalendarRoot = Utils.$("paymentCalendar");
          const calendar = Store.paymentCalendar(Store.viewMonth);
          this.updatePaymentCalendarSelection(paymentCalendarRoot, nextDate);
          this.renderPaymentCalendarDetail(paymentCalendarRoot, calendar, nextDate);
        }
        if (action === "shift-heatmap-month") {
          App.shiftHeatmapMonth(Number(actionButton.dataset.delta || 0));
        }
      }

      const journalAction = event.target.closest("[data-journal-action]");
      if (journalAction) {
        App.handleJournalAction(journalAction);
      }

      const settingAction = event.target.closest("[data-setting-action]");
      if (settingAction) {
        App.handleSettingsAction(settingAction);
      }

      const pickerToggle = event.target.closest("[data-picker-toggle]");
      if (pickerToggle) {
        App.togglePickerItem(pickerToggle.dataset.pickerToggle);
      }

    });

    document.addEventListener("submit", (event) => {
      const form = event.target.closest("form");
      if (form?.id === "transactionForm") {
        event.preventDefault();
        App.createTransaction();
      }
    });

    document.addEventListener("input", (event) => {
      const field = event.target.closest("[data-journal-field]");
      if (!field) {
        return;
      }
      const kind = field.dataset.journalField;
      if (["amount", "description", "wish-amount", "wish-desc"].includes(kind)) {
        App.updateJournalFieldDraft(field);
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.closest("#typeSwitch")) {
        this.renderFormCategories();
      }
      const field = event.target.closest("[data-journal-field]");
      if (field) {
        App.commitJournalFieldEdit(field);
      }
      const settingField = event.target.closest("[data-setting-field]");
      if (settingField) {
        App.handleSettingsField(settingField);
      }

    });

    document.addEventListener("pointerdown", (event) => {
      const budgetNumpadToggle = event.target.closest?.("[data-journal-action='open-amount-keypad']");
      if (budgetNumpadToggle instanceof HTMLElement) {
        event.preventDefault();
        this.rememberBudgetPointerAction("open-amount-keypad", budgetNumpadToggle);
        this.openBudgetNumpad(budgetNumpadToggle);
        return;
      }
      const row = event.target.closest?.("[draggable='true'][data-entry-id]");
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const blocked = this.isJournalDragBlockedTarget(event.target);
      row.dataset.dragBlocked = blocked ? "1" : "0";
      this.dragState.blocked = blocked;
    }, true);

    const clearDragIntent = () => {
      this.dragState.blocked = false;
      document.querySelectorAll("[draggable='true'][data-entry-id][data-drag-blocked]").forEach((row) => {
        row.removeAttribute("data-drag-blocked");
      });
    };

    document.addEventListener("dragstart", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row) {
        return;
      }
      if (row.dataset.dragBlocked === "1" || this.isJournalDragBlockedTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      this.dragState.id = row.dataset.entryId;
      this.dragState.section = row.dataset.section;
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    document.addEventListener("dragend", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (row) {
        row.classList.remove("is-dragging");
      }
      document.querySelectorAll(".entry-row.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      this.dragState.id = null;
      this.dragState.section = null;
      clearDragIntent();
    });

    document.addEventListener("dragover", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row || !this.dragState.id || row.dataset.section !== this.dragState.section) {
        return;
      }
      event.preventDefault();
      document.querySelectorAll(".entry-row.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      if (row.dataset.entryId !== this.dragState.id) {
        row.classList.add("is-drop-target");
      }
    });

    document.addEventListener("drop", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row || !this.dragState.id || row.dataset.section !== this.dragState.section) {
        return;
      }
      event.preventDefault();
      row.classList.remove("is-drop-target");
      if (row.dataset.entryId !== this.dragState.id) {
        App.reorderSection(row.dataset.section, this.dragState.id, row.dataset.entryId);
      }
      clearDragIntent();
    });

    document.addEventListener("pointerup", clearDragIntent, true);
    document.addEventListener("pointercancel", clearDragIntent, true);
    window.addEventListener("resize", () => {
      this.positionBudgetNumpad();
      this.positionBudgetDayPad();
      this.scheduleScrollTopButtonUpdate();
    });
    document.addEventListener("scroll", () => {
      this.positionBudgetNumpad();
      this.positionBudgetDayPad();
      this.scheduleScrollTopButtonUpdate();
    }, true);

    document.addEventListener("keydown", (event) => {
      if (this.handleBudgetKeyboardFlow(event)) {
        event.stopPropagation();
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.budgetDayPadState.open) {
        event.preventDefault();
        this.closeBudgetDayPad({ restoreFocus: true });
        return;
      }
      if (event.key === "Escape" && this.budgetNumpadState.open) {
        event.preventDefault();
        this.closeBudgetNumpad({ commit: true, restoreFocus: true });
        return;
      }
      if (event.key === "Escape" && Utils.$("appShell")?.classList.contains("is-mobile-quick-open")) {
        event.preventDefault();
        this.setMobileQuickAddOpen(false);
        return;
      }
      if (event.key === "Escape" && Utils.$("appShell")?.classList.contains("is-mobile-drawer-open")) {
        event.preventDefault();
        this.setMobileDrawerOpen(false);
        return;
      }
      if (this.handleEnterAdvance(event)) {
        return;
      }
      if (this.trapModalFocus(event)) {
        return;
      }
      const analyticsTabButton = event.target instanceof HTMLElement ? event.target.closest("[data-analytics-view]") : null;
      if (analyticsTabButton && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        const buttons = Array.from(document.querySelectorAll("[data-analytics-view]"));
        const currentIndex = buttons.indexOf(analyticsTabButton);
        if (currentIndex >= 0) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          const nextButton = buttons[nextIndex];
          if (nextButton instanceof HTMLElement) {
            this.setAnalyticsAdvancedView(nextButton.dataset.analyticsView || "deep");
            nextButton.focus();
          }
          return;
        }
      }
      const quickSwitchButton = event.target instanceof HTMLElement ? event.target.closest("[data-settings-quick]") : null;
      if (quickSwitchButton && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        const buttons = Array.from(document.querySelectorAll("[data-settings-quick]"));
        const currentIndex = buttons.indexOf(quickSwitchButton);
        if (currentIndex >= 0) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          const nextButton = buttons[nextIndex];
          if (nextButton instanceof HTMLElement) {
            this.setSettingsQuickMode(nextButton.dataset.settingsQuick || "template-recurring");
            nextButton.focus();
          }
          return;
        }
      }
      const isTypingTarget = event.target instanceof HTMLElement && (
        event.target.closest("input, textarea, select, [contenteditable='true']")
      );
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !isTypingTarget) {
        const key = String(event.key || "").toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          App.undo();
          return;
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          App.redo();
          return;
        }
      }
      if (event.key === "Escape") {
        if (this.heatmapHintOpen) {
          this.setHeatmapHintOpen(false);
          return;
        }
        App.resolveSyncChoice("cancel");
        this.closeModals();
        this.closeSidebar();
      }
    });

    window.setInterval(() => this.renderSyncState(), 60000);
  },
};
