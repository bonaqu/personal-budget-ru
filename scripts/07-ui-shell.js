Object.assign(UI, {
  scheduleChartResize() {
    cancelAnimationFrame(this.chartResizeFrame);
    const appShell = Utils.$("appShell");
    const appVisible = appShell && !appShell.classList.contains("is-hidden");
    const needsAnalyticsPass = Store.activeTab === "analyticsTab";
    const needsOverviewChartPass = this.isOverviewChartVisible();
    if (!appVisible || (!needsAnalyticsPass && !needsOverviewChartPass)) {
      return;
    }
    this.chartResizeFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Графики живут внутри адаптивных карточек, поэтому после смены сайдбара,
        // вкладки или ресайза принудительно даем им пересчитать реальные размеры контейнера.
        const chartsToResize = [];
        if (needsAnalyticsPass) {
          chartsToResize.push(this.charts.flow, this.charts.category);
        }
        if (needsOverviewChartPass && this.charts.monthBalance) {
          chartsToResize.push(this.charts.monthBalance);
        }
        chartsToResize.filter(Boolean).forEach((chart) => {
          try {
            if (chart.canvas && chart.canvas.offsetParent === null) {
              return;
            }
            this.resizeChartIfNeeded(chart);
          } catch (error) {
            Diagnostics.report("chart:resize-failed", { message: error?.message || String(error) }, "warning");
          }
        });
        if (needsOverviewChartPass) {
          this.syncBudgetWorkspaceLayout();
        }
        if (needsAnalyticsPass) {
          this.syncPaymentCalendarLayout();
          this.syncAnalyticsPairLayouts();
        }
      });
    });
  },

  resizeChartIfNeeded(chart, { force = false } = {}) {
    if (!chart?.canvas) {
      return;
    }
    const host = chart.canvas.parentElement || chart.canvas;
    const width = Math.round(host.clientWidth || chart.canvas.clientWidth || 0);
    const height = Math.round(host.clientHeight || chart.canvas.clientHeight || 0);
    if (!width || !height) {
      return;
    }
    const nextKey = `${width}x${height}`;
    const prevKey = this.chartSizeCache.get(chart);
    if (!force && prevKey === nextKey) {
      return;
    }
    if (chart.canvas) {
      chart.canvas.style.width = "";
      chart.canvas.style.height = "";
    }
    chart.resize(width, height);
    if (force && chart.config?.type === "doughnut") {
      chart.update("none");
    }
    this.chartSizeCache.set(chart, nextKey);
  },

  isAnalyticsCompactLayout() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 1240px)").matches;
  },

  syncPaymentCalendarLayout(root = Utils.$("paymentCalendar")) {
    if (!root?.classList?.contains("payment-calendar--v2")) {
      return;
    }
    const rail = root.querySelector(".payment-calendar-v2__rail");
    const overview = root.querySelector(".payment-calendar-v2__overview");
    const board = root.querySelector(".payment-calendar-v2__board");
    const detail = root.querySelector(".payment-calendar-v2__detail");
    const summary = root.querySelector(".payment-calendar-v2__summary");
    const events = root.querySelector(".payment-calendar-v2__events");
    const emptyState = !events ? detail?.querySelector(".empty-state") : null;
    if (!rail || !overview || !board || !detail || !summary) {
      return;
    }

    if (this.isAnalyticsCompactLayout()) {
      summary.style.height = "";
      summary.style.maxHeight = "";
      detail.style.height = "";
      detail.style.maxHeight = "";
      if (events) {
        events.style.height = "";
        events.style.maxHeight = "";
      }
      if (emptyState) {
        emptyState.style.height = "";
        emptyState.style.minHeight = "";
      }
      return;
    }

    const railHeight = rail.getBoundingClientRect().height;
    const overviewHeight = overview.getBoundingClientRect().height;
    const boardHeight = board.getBoundingClientRect().height;
    if (!railHeight || !overviewHeight || !boardHeight) {
      return;
    }

    const detailGap = parseFloat(window.getComputedStyle(detail).gap) || 0;
    const syncedSummaryHeight = overviewHeight;
    const syncedEventsHeight = boardHeight;
    const syncedDetailHeight = syncedSummaryHeight + syncedEventsHeight + detailGap;
    this.setSyncedHeight(summary, syncedSummaryHeight);
    this.setSyncedHeight(detail, syncedDetailHeight);

    if (events) {
      this.setSyncedHeight(events, syncedEventsHeight);
    } else if (emptyState) {
      this.setSyncedHeight(emptyState, syncedEventsHeight);
    }
  },

  clearPanelHeightSync(...elements) {
    elements.filter(Boolean).forEach((element) => {
      element.style.height = "";
      element.style.maxHeight = "";
      element.style.minHeight = "";
      delete element.dataset.syncedHeight;
    });
  },

  setSyncedHeight(element, height) {
    if (!element || !height) {
      return;
    }
    const value = `${height.toFixed(2)}px`;
    if (element.dataset.syncedHeight === value) {
      return;
    }
    element.style.height = value;
    element.style.maxHeight = value;
    element.style.minHeight = value;
    element.dataset.syncedHeight = value;
  },

  clearAnalyticsLayoutSync() {
    if (Store.activeTab !== "analyticsTab") {
      return;
    }
    this.clearPanelHeightSync(
      Utils.$("paymentCalendar")?.querySelector(".payment-calendar-v2__summary"),
      Utils.$("paymentCalendar")?.querySelector(".payment-calendar-v2__detail"),
      Utils.$("paymentCalendar")?.querySelector(".payment-calendar-v2__events")
    );
    const analyticsGrid = document.querySelector(".analytics-grid");
    this.clearPanelHeightSync(
      analyticsGrid?.querySelector(".analytics-panel--cashflow"),
      analyticsGrid?.querySelector(".analytics-panel--insights"),
      analyticsGrid?.querySelector(".analytics-panel--cashflow #cashflowWorkspace") || analyticsGrid?.querySelector(".analytics-panel--cashflow .chart-wrap--lg"),
      analyticsGrid?.querySelector(".analytics-panel--insights .insight-grid"),
      analyticsGrid?.querySelector(".analytics-panel--breakdown"),
      analyticsGrid?.querySelector(".analytics-panel--heatmap"),
      analyticsGrid?.querySelector(".analytics-panel--breakdown .analytics-breakdown"),
      analyticsGrid?.querySelector(".analytics-panel--heatmap #heatmapWrap")
    );
  },

  clearBudgetLayoutSync() {
    const workspace = document.querySelector(".budget-workspace");
    this.clearPanelHeightSync(
      workspace?.querySelector(".budget-workspace__side"),
      workspace?.querySelector(".budget-side-panel"),
      workspace?.querySelector(".budget-side-panel__pages"),
      ...Array.from(workspace?.querySelectorAll?.(".budget-side-panel [data-budget-side-page]") || [])
    );
  },

  invalidateBudgetRenderCache() {
    if (this.budgetRenderCache) {
      this.budgetRenderCache.summary = "";
      this.budgetRenderCache.monthPlan = "";
    }
    [
      "overviewCategoryLegend",
      "budgetLimitList",
      "incomesList",
      "debtsList",
      "recurringBudgetList",
      "expensesList",
      "wishList",
      "transactionsList"
    ].forEach((id) => {
      const root = Utils.$(id);
      if (root instanceof HTMLElement) {
        delete root.dataset.renderSignature;
      }
    });
  },

  forceBudgetLayoutRefresh() {
    if (Store.activeTab !== "overviewTab") {
      return;
    }
    this.refreshCompactTextareas?.();
    this.syncBudgetSidePager?.();
    this.syncBudgetWorkspaceLayout();
    this.scheduleChartResize?.();
    document
      .querySelectorAll(
        "#overviewTab .hero-strip, #overviewTab .budget-workspace, #overviewTab .budget-workspace__main, #overviewTab .budget-workspace__side, #overviewTab .budget-workspace__journal, #overviewTab .journal-layout--budget"
      )
      .forEach((element) => {
        void element.getBoundingClientRect();
      });
  },

  getBudgetLayoutKey() {
    if (this.isMobileViewport()) {
      return "mobile";
    }
    return this.isBudgetWideLayout() ? "wide" : "stack";
  },

  refreshBudgetVisibleContent() {
    if (Store.activeTab !== "overviewTab") {
      return;
    }
    this.renderMonthBalanceLegend?.(Utils.themePalette());
    this.renderSummary?.();
    this.renderMonthPlan?.();
    this.renderBudgetFilters?.();
    this.renderJournal?.();
    this.renderTransactions?.();
    this.renderOverviewExpenseLegend?.();
    this.renderBudgetLimits?.();
    this.refreshCompactTextareas?.();
    this.syncBudgetWorkspaceLayout();
    this.scheduleChartResize?.();
  },

  isBudgetWideLayout() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 1281px)").matches;
  },

  syncBudgetWorkspaceLayout(stableHeightOverride = 0) {
    const workspace = document.querySelector(".budget-workspace");
    const main = workspace?.querySelector(".budget-workspace__main");
    const side = workspace?.querySelector(".budget-workspace__side");
    const sidePanel = side?.querySelector(".budget-side-panel");
    const sidePages = sidePanel?.querySelector(".budget-side-panel__pages");
    const sideSections = Array.from(sidePanel?.querySelectorAll?.("[data-budget-side-page]") || []);
    if (!workspace || !main || !side || !sidePanel) {
      return;
    }
    const isWide = this.isBudgetWideLayout();
    const isPagedNow = sidePanel.classList.contains("is-paged");
    const syncedHeight = parseFloat(sidePanel.dataset.syncedHeight || side.dataset.syncedHeight || "0") || 0;
    const mainHeight = main.getBoundingClientRect().height || 0;
    const sideHeight = side.getBoundingClientRect().height || 0;
    const sidePanelHeight = sidePanel.getBoundingClientRect().height || 0;
    let targetHeight = stableHeightOverride || 0;
    if (!targetHeight) {
      targetHeight = isWide
        ? (mainHeight || syncedHeight || sidePanelHeight || sideHeight || 0)
        : (syncedHeight || sidePanelHeight || sideHeight || mainHeight || 0);
    }
    this.clearBudgetLayoutSync();
    this.syncBudgetSidePager?.(targetHeight);
    if (Store.activeTab !== "overviewTab" || !isWide) {
      return;
    }

    if (!targetHeight) {
      return;
    }

    this.setSyncedHeight(side, targetHeight);
    this.setSyncedHeight(sidePanel, targetHeight);

    const pager = sidePanel.querySelector(".budget-side-panel__pager");
    if (pager instanceof HTMLElement && sidePages instanceof HTMLElement && sideSections.length) {
      const panelGap = parseFloat(getComputedStyle(sidePanel).rowGap || getComputedStyle(sidePanel).gap || "0") || 0;
      const pagerHeight = pager.getBoundingClientRect().height;
      const pagesHeight = Math.max(0, targetHeight - pagerHeight - panelGap);
      this.setSyncedHeight(sidePages, pagesHeight);
      sideSections.forEach((section) => this.setSyncedHeight(section, pagesHeight));
    }
  },

  syncActiveTabLayout() {
    if (Store.activeTab === "overviewTab") {
      this.syncBudgetWorkspaceLayout();
    }
    if (Store.activeTab === "analyticsTab") {
      this.syncAnalyticsPairLayouts();
      this.syncPaymentCalendarLayout();
    }
    if (Store.activeTab === "settingsTab") {
      this.syncSettingsLayout();
    }
  },

  syncPanelPairHeights({
    leftPanel,
    rightPanel,
    leftContent,
    rightContent
  }) {
    if (!leftPanel || !rightPanel || !leftContent || !rightContent) {
      return;
    }

    this.clearPanelHeightSync(leftPanel, rightPanel, leftContent, rightContent);

    const leftPanelHeight = leftPanel.getBoundingClientRect().height;
    const rightPanelHeight = rightPanel.getBoundingClientRect().height;
    const leftContentHeight = leftContent.getBoundingClientRect().height;
    const rightContentHeight = rightContent.getBoundingClientRect().height;

    if (!leftPanelHeight || !rightPanelHeight || !leftContentHeight || !rightContentHeight) {
      return;
    }

    const targetPanelHeight = Math.max(leftPanelHeight, rightPanelHeight);
    const leftChrome = leftPanelHeight - leftContentHeight;
    const rightChrome = rightPanelHeight - rightContentHeight;
    const syncedLeftContentHeight = Math.max(0, targetPanelHeight - leftChrome);
    const syncedRightContentHeight = Math.max(0, targetPanelHeight - rightChrome);

    this.setSyncedHeight(leftPanel, targetPanelHeight);
    this.setSyncedHeight(rightPanel, targetPanelHeight);
    this.setSyncedHeight(leftContent, syncedLeftContentHeight);
    this.setSyncedHeight(rightContent, syncedRightContentHeight);
  },

  syncAnalyticsPairLayouts() {
    const analyticsGrid = document.querySelector(".analytics-grid");
    const cashflowPanel = analyticsGrid?.querySelector(".analytics-panel--cashflow");
    const insightsPanel = analyticsGrid?.querySelector(".analytics-panel--insights");
    const cashflowContent = cashflowPanel?.querySelector("#cashflowWorkspace") || cashflowPanel?.querySelector(".chart-wrap--lg");
    const insightsContent = insightsPanel?.querySelector(".insight-grid");
    const breakdownPanel = analyticsGrid?.querySelector(".analytics-panel--breakdown");
    const heatmapPanel = analyticsGrid?.querySelector(".analytics-panel--heatmap");
    const breakdownContent = breakdownPanel?.querySelector(".analytics-breakdown");
    const heatmapContent = heatmapPanel?.querySelector("#heatmapWrap");

    if (!cashflowPanel || !insightsPanel || !cashflowContent || !insightsContent || !breakdownPanel || !heatmapPanel || !breakdownContent || !heatmapContent) {
      return;
    }

    if (this.isAnalyticsCompactLayout()) {
      this.clearPanelHeightSync(
        cashflowPanel,
        insightsPanel,
        cashflowContent,
        insightsContent,
        breakdownPanel,
        heatmapPanel,
        breakdownContent,
        heatmapContent
      );
      return;
    }

    this.syncPanelPairHeights({
      leftPanel: cashflowPanel,
      rightPanel: insightsPanel,
      leftContent: cashflowContent,
      rightContent: insightsContent
    });

    this.syncPanelPairHeights({
      leftPanel: breakdownPanel,
      rightPanel: heatmapPanel,
      leftContent: breakdownContent,
      rightContent: heatmapContent
    });

    const chartsToFinalize = [this.charts.flow, this.charts.category].filter(Boolean);
    chartsToFinalize.forEach((chart) => {
      try {
        if (chart.canvas && chart.canvas.offsetParent !== null) {
          this.resizeChartIfNeeded(chart, { force: true });
        }
      } catch (error) {
        Diagnostics.report("chart:final-resize-failed", { message: error?.message || String(error) }, "warning");
      }
    });

    if (this.charts.category) {
      App.runAfterNextPaint(() => {
        try {
          this.resizeChartIfNeeded(this.charts.category, { force: true });
        } catch (error) {
          Diagnostics.report("chart:post-paint-resize-failed", { message: error?.message || String(error) }, "warning");
        }
      }, 2);
    }
  },

  runPanelTransition(root, renderFn) {
    if (typeof renderFn !== "function") {
      return;
    }
    if (!root?.classList || this.prefersReducedMotion()) {
      renderFn();
      return;
    }
    root.classList.add("is-refreshing");
    renderFn();
    requestAnimationFrame(() => {
      root.classList.remove("is-refreshing");
    });
  },

  setupAutoResize() {
    let resizeFrame = 0;
    let resizeTimer = 0;
    let resizeSettledTimer = 0;
    let lastBudgetLayoutKey = this.getBudgetLayoutKey();

    document.addEventListener("focusin", (event) => {
      const textarea = event.target.closest("textarea[data-compact='true']");
      if (!textarea) {
        return;
      }
      const fullText = textarea.dataset.fulltext || "";
      textarea.dataset.editing = "1";
      textarea.classList.add("is-editing");
      textarea.value = fullText;
      textarea.rows = 1;
      this.updateCompactTextareaLayout(textarea);
    });

    document.addEventListener("focusout", (event) => {
      const textarea = event.target.closest("textarea[data-compact='true']");
      if (!textarea) {
        return;
      }
      textarea.dataset.fulltext = textarea.value;
      if (textarea.dataset.journalField && App.hasJournalFieldEdit(textarea)) {
        App.commitJournalFieldEdit(textarea);
      }
      if (textarea.dataset.settingField) {
        App.handleSettingsField(textarea);
      }
      this.collapseCompactTextarea(textarea);
      this.flushPendingBudgetFlow?.();
    });

    document.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.closest(".auth-field__control")) {
        UI.syncAuthFieldState(event.target);
        UI.clearAuthFieldError(event.target);
        UI.clearAuthStatus(UI.getAuthSourceForElement(event.target));
      }

      if (event.target.tagName !== "TEXTAREA") {
        return;
      }
      const textarea = event.target;
      if (textarea.dataset.compact === "true") {
        textarea.dataset.fulltext = textarea.value;
        if (textarea.dataset.editing === "1") {
          this.updateCompactTextareaLayout(textarea);
        }
        return;
      }
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    });

    this.refreshCompactTextareas();
    document.querySelectorAll("textarea:not([data-compact='true'])").forEach((textarea) => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    });

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      clearTimeout(resizeSettledTimer);
      cancelAnimationFrame(resizeFrame);
      document.body.classList.add("is-window-resizing");
      resizeFrame = requestAnimationFrame(() => {
        const currentBudgetLayoutKey = this.getBudgetLayoutKey();
        const budgetLayoutChanged = Store.activeTab === "overviewTab" && currentBudgetLayoutKey !== lastBudgetLayoutKey;
        lastBudgetLayoutKey = currentBudgetLayoutKey;
        this.clearAnalyticsLayoutSync();
        this.clearBudgetLayoutSync();
        if (Store.activeTab === "settingsTab") {
          this.syncSettingsLayout();
        }
        resizeTimer = window.setTimeout(() => {
          if (["overviewTab", "monthsTab", "settingsTab"].includes(Store.activeTab)) {
            this.refreshCompactTextareas();
          }
          this.syncResponsiveShell();
          if (budgetLayoutChanged) {
            this.forceBudgetLayoutRefresh();
          }
          this.syncActiveTabLayout();
          App.runAfterNextPaint(() => this.syncActiveTabLayout(), 2);
          if (this.shouldRunChartResize()) {
            this.scheduleChartResize();
          }
        }, 36);
        resizeSettledTimer = window.setTimeout(() => {
          document.body.classList.remove("is-window-resizing");
          if (Store.activeTab === "overviewTab") {
            App.runAfterNextPaint(() => this.forceBudgetLayoutRefresh(), 1);
          }
        }, 160);
      });
    });
  },

  updatePaymentCalendarSelection(root = Utils.$("paymentCalendar"), activeDate = this.calendarSelectedDate) {
    if (!root?.classList?.contains("payment-calendar--v2")) {
      return;
    }
    root.querySelectorAll(".payment-calendar-v2__day[data-date]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.date === activeDate);
    });
  },

  buildPaymentCalendarDetail(calendar, activeDate) {
    const details = Utils.createElement("div", "payment-calendar-v2__detail");
    const selectedDay = calendar.days.find((item) => `${Store.viewMonth}-${String(item.day).padStart(2, "0")}` === activeDate) || calendar.days[0];
    const detailDate = new Date(`${activeDate}T00:00:00`);
    const detailLabel = new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(detailDate).replace(/^./, (char) => char.toUpperCase());

    const summary = Utils.createElement("div", "payment-calendar-v2__summary");
    const detailsHead = Utils.createElement("div", "payment-calendar-v2__detail-head");
    const detailCopy = Utils.createElement("div", "payment-calendar-v2__detail-copy");
    detailCopy.append(
      Utils.createElement("span", "payment-calendar-v2__detail-date", detailLabel),
      Utils.createElement("strong", "", "Платежи и движение денег")
    );
    const detailCount = Utils.createElement(
      "span",
      "payment-calendar-v2__detail-count",
      selectedDay?.items?.length ? `${selectedDay.items.length} операций` : "Без операций"
    );
    detailsHead.append(detailCopy, detailCount);

    const totals = Utils.createElement("div", "payment-calendar-v2__totals");
    const incomeMetric = Utils.createElement("div", "payment-calendar-v2__total");
    incomeMetric.append(
      Utils.createElement("span", "", "Доходы"),
      Utils.createElement("strong", "amount-positive", Utils.formatMoney(selectedDay?.income || 0))
    );
    const expenseMetric = Utils.createElement("div", "payment-calendar-v2__total");
    expenseMetric.append(
      Utils.createElement("span", "", "Расходы"),
      Utils.createElement("strong", "amount-negative", Utils.formatMoney(selectedDay?.expense || 0))
    );
    const netMetric = Utils.createElement("div", "payment-calendar-v2__total");
    netMetric.append(
      Utils.createElement("span", "", "Чистый поток"),
      Utils.createElement(
        "strong",
        (selectedDay?.income || 0) - (selectedDay?.expense || 0) >= 0 ? "amount-positive" : "amount-negative",
        Utils.formatMoney((selectedDay?.income || 0) - (selectedDay?.expense || 0))
      )
    );
    totals.append(incomeMetric, expenseMetric, netMetric);
    summary.append(detailsHead, totals);
    details.appendChild(summary);

    if (!selectedDay?.items?.length) {
      details.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "На выбранный день операций нет."));
      return details;
    }

    const list = Utils.createElement("div", "payment-calendar-v2__events");
    selectedDay.items
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .forEach((item) => {
        const category = Store.getCategory(item.categoryId);
        const row = Utils.createElement("div", "payment-calendar-v2__event");
        const marker = Utils.createElement("span", "payment-calendar-v2__event-marker");
        marker.style.background = category?.color || (item.type === "income" ? "var(--income)" : "var(--expense)");
        const body = Utils.createElement("div", "payment-calendar-v2__event-body");
        const fallbackLabel = item.type === "income" ? "Доход" : "Расход";
        const description = Utils.createElement("span", "payment-calendar-v2__event-desc", item.description || fallbackLabel);
        description.title = item.description || fallbackLabel;
        const meta = Utils.createElement("div", "payment-calendar-v2__event-meta");
        meta.append(
          Utils.createElement("span", "payment-calendar-v2__event-pill", fallbackLabel),
          Utils.createElement("span", "", category?.name || fallbackLabel)
        );
        body.append(description, meta);
        const side = Utils.createElement("div", "payment-calendar-v2__event-side");
        const amount = Utils.createElement(
          "strong",
          `payment-calendar-v2__event-amount ${item.type === "income" ? "amount-positive" : "amount-negative"}`.trim(),
          Utils.formatMoney(item.amount)
        );
        const jumpButton = Utils.createElement("button", "icon-btn icon-btn--tiny payment-calendar-v2__event-jump", "↗");
        jumpButton.type = "button";
        jumpButton.title = "Открыть эту операцию в бюджете";
        jumpButton.setAttribute("aria-label", "Открыть эту операцию в бюджете");
        jumpButton.dataset.action = "open-payment-transaction";
        jumpButton.dataset.id = item.id;
        side.append(amount, jumpButton);
        row.append(marker, body, side);
        list.appendChild(row);
      });
    details.appendChild(list);
    return details;
  },

  renderPaymentCalendarDetail(root = Utils.$("paymentCalendar"), calendar = Store.paymentCalendar(Store.viewMonth), activeDate = this.calendarSelectedDate) {
    if (!root?.classList?.contains("payment-calendar--v2")) {
      return;
    }
    const previousScrollY = window.scrollY;
    const currentDetail = root.querySelector(".payment-calendar-v2__detail");
    const nextDetail = this.buildPaymentCalendarDetail(calendar, activeDate);
    const currentSummary = currentDetail?.querySelector(".payment-calendar-v2__summary");
    const currentEvents = currentDetail?.querySelector(".payment-calendar-v2__events");
    const persistedSummaryHeight = currentSummary?.style.height || "";
    const persistedSummaryMinHeight = currentSummary?.style.minHeight || "";
    const persistedSummaryMaxHeight = currentSummary?.style.maxHeight || "";
    const persistedDetailHeight = currentDetail?.style.height || "";
    const persistedDetailMinHeight = currentDetail?.style.minHeight || "";
    const persistedDetailMaxHeight = currentDetail?.style.maxHeight || "";
    const persistedEventsHeight = currentEvents?.style.height || "";
    const persistedEventsMinHeight = currentEvents?.style.minHeight || "";
    const persistedEventsMaxHeight = currentEvents?.style.maxHeight || "";
    if (currentDetail && nextDetail) {
      currentDetail.replaceChildren(...Array.from(nextDetail.childNodes));
    } else if (nextDetail) {
      root.querySelector(".payment-calendar-v2__shell")?.appendChild(nextDetail);
    }
    const nextSummary = root.querySelector(".payment-calendar-v2__summary");
    const nextEvents = root.querySelector(".payment-calendar-v2__events");
    const nextDetailRoot = root.querySelector(".payment-calendar-v2__detail");
    if (nextSummary && persistedSummaryHeight) {
      nextSummary.style.height = persistedSummaryHeight;
      nextSummary.style.minHeight = persistedSummaryMinHeight || persistedSummaryHeight;
      nextSummary.style.maxHeight = persistedSummaryMaxHeight || persistedSummaryHeight;
    }
    if (nextDetailRoot && persistedDetailHeight) {
      nextDetailRoot.style.height = persistedDetailHeight;
      nextDetailRoot.style.minHeight = persistedDetailMinHeight || persistedDetailHeight;
      nextDetailRoot.style.maxHeight = persistedDetailMaxHeight || persistedDetailHeight;
    }
    if (nextEvents && persistedEventsHeight) {
      nextEvents.style.height = persistedEventsHeight;
      nextEvents.style.minHeight = persistedEventsMinHeight || persistedEventsHeight;
      nextEvents.style.maxHeight = persistedEventsMaxHeight || persistedEventsHeight;
    }
    const scrollAfterRender = window.scrollY;
    requestAnimationFrame(() => {
      const scrollBeforeLayoutSync = window.scrollY;
      this.syncPaymentCalendarLayout(root);
      const userMovedSinceRender = Math.abs(scrollBeforeLayoutSync - scrollAfterRender) > 1;
      if (!userMovedSinceRender && Math.abs(window.scrollY - previousScrollY) > 1) {
        window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" });
      }
    });
  },

  collapseCompactTextarea(textarea) {
    const fullText = textarea.dataset.fulltext || "";
    textarea.dataset.editing = "0";
    textarea.classList.remove("is-editing");
    textarea.classList.remove("is-multiline");
    textarea.rows = 1;
    textarea.value = Utils.truncateSingleLineToFit(fullText, textarea, Number(textarea.dataset.compactLimit || 72));
    textarea.title = fullText;
    textarea.style.height = "";
  },

  updateCompactTextareaLayout(textarea) {
    textarea.classList.add("is-editing");
    textarea.classList.remove("is-multiline");
    textarea.rows = 1;
    textarea.style.height = "";
    const singleLineHeight = 44;
    const needsMultiline = textarea.scrollHeight > singleLineHeight + 2;
    if (needsMultiline) {
      textarea.classList.add("is-multiline");
      textarea.rows = Number(textarea.dataset.expandedRows || 3);
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 86)}px`;
    }
  },

  refreshCompactTextareas(root = document) {
    root.querySelectorAll("textarea[data-compact='true']").forEach((textarea) => {
      if (!textarea.dataset.fulltext) {
        textarea.dataset.fulltext = textarea.value;
      }
      this.collapseCompactTextarea(textarea);
    });
  },

  setCategoryTrigger(buttonId, categoryId, fallbackLabel = "Выберите категорию") {
    const button = Utils.$(buttonId);
    if (!button) {
      return;
    }
    const category = Store.getCategory(categoryId);
    const label = category?.name || fallbackLabel;
    const color = category?.color || "#8b949e";
    button.innerHTML = `
      <span class="category-trigger__swatch" style="background:${color}"></span>
      <span class="category-trigger__label">${Utils.escapeHtml(label)}</span>
    `;
    button.title = label;
  },

  renderCategoryColorValue() {
    this.renderColorFieldValue("categoryColorInput", "categoryColorValue");
  },

  renderColorFieldValue(inputId, labelId) {
    const input = Utils.$(inputId);
    const label = Utils.$(labelId);
    if (!input || !label) {
      return;
    }
    const value = String(input.value || "#58a6ff");
    label.textContent = value.toUpperCase();
    label.style.color = value;
    const field = input.closest(".color-field");
    if (field) {
      field.style.setProperty("--selected-color", value);
    }
  },

  showApp() {
    Utils.$("authScreen").classList.add("is-hidden");
    Utils.$("appShell").classList.remove("is-hidden");
    this.scheduleScrollTopButtonUpdate();
  },

  showStartupAuth() {
    Utils.$("appShell").classList.add("is-hidden");
    Utils.$("authScreen").classList.remove("is-hidden");
    this.clearAuthStatus("startup");
    this.syncAllAuthFields();
    this.scheduleScrollTopButtonUpdate();
  },

  finishBoot() {
    if (typeof document === "undefined") {
      return;
    }
    const body = document.body;
    if (!body || body.classList.contains("app-ready")) {
      return;
    }
    requestAnimationFrame(() => {
      body.classList.remove("app-booting");
      body.classList.add("app-ready");
    });
  },

  openModal(modalId) {
    const modal = Utils.$(modalId);
    if (!modal) {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !modal.contains(active)) {
      this.modalFocusRestore.set(modalId, active);
    }
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    const dialog = modal.querySelector(".modal__dialog");
    if (dialog) {
      if (!dialog.hasAttribute("role")) dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const heading = dialog.querySelector("h2, h3");
      if (heading) {
        heading.id ||= `${modalId}Title`;
        dialog.setAttribute("aria-labelledby", heading.id);
      }
    }
    [Utils.$("authScreen"), Utils.$("appShell")].forEach((surface) => {
      if (surface && !modal.contains(surface)) surface.inert = true;
    });
    this.syncAllAuthFields();
    App.runAfterNextPaint(() => this.focusModalPrimary(modal), 3);
  },

  closeModal(modalId) {
    const modal = Utils.$(modalId);
    if (!modal) {
      return;
    }
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal.querySelector(".modal__dialog")?.removeAttribute("aria-modal");
    if (modalId === "confirmationModal" && typeof this.confirmationResolver === "function") {
      const resolve = this.confirmationResolver;
      this.confirmationResolver = null;
      resolve(false);
    }
    if (!document.querySelector(".modal.is-open")) {
      [Utils.$("authScreen"), Utils.$("appShell")].forEach((surface) => {
        if (surface) surface.inert = false;
      });
    }
    if (modalId === "pickerModal") {
      this.pickerState.kind = null;
      this.pickerState.ids = new Set();
      this.pickerState.context = null;
    }
    const restoreTarget = this.modalFocusRestore.get(modalId);
    this.modalFocusRestore.delete(modalId);
    if (restoreTarget instanceof HTMLElement && document.contains(restoreTarget)) {
      App.runAfterNextPaint(() => {
        try {
          restoreTarget.focus({ preventScroll: true });
        } catch {
          restoreTarget.focus();
        }
      }, 2);
    }
  },

  closeModals() {
    ["authModal", "accountMenuModal", "transactionModal", "moveTransactionModal", "categoryModal", "templateModal", "goalModal", "pickerModal", "syncChoiceModal", "recoveryCodeModal", "passwordChangeModal", "passwordRecoveryModal", "sessionsModal", "confirmationModal"]
      .forEach((modalId) => this.closeModal(modalId));
  },

  confirmAction({
    title = "Подтвердите действие",
    message = "",
    acceptLabel = "Продолжить",
    cancelLabel = "Отмена",
    tone = "default"
  } = {}) {
    if (typeof this.confirmationResolver === "function") {
      this.confirmationResolver(false);
      this.confirmationResolver = null;
    }
    const modal = Utils.$("confirmationModal");
    if (!modal) return Promise.resolve(false);
    Utils.$("confirmationTitle").textContent = title;
    Utils.$("confirmationMessage").textContent = message;
    Utils.$("confirmationAcceptBtn").textContent = acceptLabel;
    Utils.$("confirmationCancelBtn").textContent = cancelLabel;
    modal.dataset.tone = tone;
    this.openModal("confirmationModal");
    return new Promise((resolve) => {
      this.confirmationResolver = resolve;
    });
  },

  resolveConfirmation(accepted) {
    const resolve = this.confirmationResolver;
    this.confirmationResolver = null;
    this.closeModal("confirmationModal");
    if (typeof resolve === "function") resolve(Boolean(accepted));
  },

  setBusy(element, busy, label = "Выполняется…") {
    if (!(element instanceof HTMLElement)) return;
    if (busy) {
      element.dataset.idleLabel = element.textContent;
      element.textContent = label;
      element.setAttribute("aria-busy", "true");
      if ("disabled" in element) element.disabled = true;
      element.classList.add("is-busy");
      return;
    }
    if (element.dataset.idleLabel) element.textContent = element.dataset.idleLabel;
    delete element.dataset.idleLabel;
    element.removeAttribute("aria-busy");
    if ("disabled" in element) element.disabled = false;
    element.classList.remove("is-busy");
  },

  isMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  },

  setMobileDrawerOpen(open = false) {
    const shell = Utils.$("appShell");
    const backdrop = Utils.$("mobileSidebarBackdrop");
    const toggle = Utils.$("mobileNavToggleBtn");
    if (!shell || !backdrop || !toggle) {
      return;
    }
    const nextOpen = Boolean(open) && this.isMobileViewport();
    if (nextOpen) {
      this.setMobileQuickAddOpen(false);
    }
    shell.classList.toggle("is-mobile-drawer-open", nextOpen);
    backdrop.hidden = !nextOpen;
    toggle.setAttribute("aria-expanded", String(nextOpen));
  },

  toggleMobileDrawer(forceValue = null) {
    const shell = Utils.$("appShell");
    if (!shell) {
      return;
    }
    const nextOpen = forceValue === null
      ? !shell.classList.contains("is-mobile-drawer-open")
      : Boolean(forceValue);
    this.setMobileDrawerOpen(nextOpen);
  },

  setMobileQuickAddOpen(open = false) {
    const shell = Utils.$("appShell");
    const sheet = Utils.$("mobileQuickSheet");
    const fab = Utils.$("mobileFabBtn");
    if (!shell || !sheet || !fab) {
      return;
    }
    const nextOpen = Boolean(open) && this.isMobileViewport();
    if (nextOpen) {
      this.setMobileDrawerOpen(false);
      if ("inert" in sheet) {
        sheet.inert = false;
      }
      sheet.hidden = false;
      sheet.setAttribute("aria-hidden", "false");
    } else {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && sheet.contains(activeElement)) {
        activeElement.blur();
        App.runAfterNextPaint(() => {
          try {
            fab.focus({ preventScroll: true });
          } catch {
            fab.focus();
          }
        }, 1);
      }
      if ("inert" in sheet) {
        sheet.inert = true;
      }
    }
    shell.classList.toggle("is-mobile-quick-open", nextOpen);
    fab.setAttribute("aria-expanded", String(nextOpen));
    if (!nextOpen) {
      sheet.setAttribute("aria-hidden", "true");
      sheet.hidden = true;
    }
  },

  toggleMobileQuickAdd(forceValue = null) {
    const shell = Utils.$("appShell");
    if (!shell) {
      return;
    }
    const nextOpen = forceValue === null
      ? !shell.classList.contains("is-mobile-quick-open")
      : Boolean(forceValue);
    this.setMobileQuickAddOpen(nextOpen);
  },

  syncResponsiveShell() {
    if (this.isMobileViewport()) {
      return;
    }
    this.setMobileDrawerOpen(false);
    this.setMobileQuickAddOpen(false);
  },

  closeSidebar() {
    const shell = Utils.$("appShell");
    if (!shell) {
      return;
    }
    if (this.isMobileViewport()) {
      this.setMobileDrawerOpen(false);
      return;
    }
    if (window.innerWidth <= 1180 && !shell.classList.contains("is-sidebar-collapsed")) {
      this.applySidebarState(true);
    }
  },

  mountTransactionForm(target = Utils.$("transactionFormMount")) {
    if (!target) {
      return null;
    }
    const template = Utils.$("transactionFormTemplate");
    if (!template) {
      return null;
    }
    const existing = target.querySelector("#transactionForm");
    if (existing) {
      return existing;
    }
    target.replaceChildren(template.content.cloneNode(true));
    return target.querySelector("#transactionForm");
  },

  applyTheme() {
    const theme = Store.data.profile.theme === "light" ? "light" : "dark";
    const toggleIcon = Utils.$("themeToggleIcon");
    const icon = theme === "dark" ? "◐" : "◑";
    if (this.appliedTheme === theme && document.body.dataset.theme === theme && (!toggleIcon || toggleIcon.textContent === icon)) {
      return;
    }
    if (document.body.dataset.theme !== theme) {
      document.body.dataset.theme = theme;
    }
    if (toggleIcon && toggleIcon.textContent !== icon) {
      toggleIcon.textContent = icon;
    }
    this.appliedTheme = theme;
  },

  applySidebarState(collapsed) {
    const shell = Utils.$("appShell");
    if (!shell) {
      return;
    }
    clearTimeout(this.sidebarToggleSettledTimer || 0);
    shell.classList.add("is-sidebar-toggling");
    shell.classList.toggle("is-sidebar-collapsed", Boolean(collapsed));
    const toggle = Utils.$("sidebarToggleBtn");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!collapsed));
      const nextLabel = collapsed ? "Открыть боковую панель" : "Свернуть боковую панель";
      toggle.setAttribute("aria-label", nextLabel);
      toggle.title = nextLabel;
    }
    Storage.writeText(CONFIG.SIDEBAR_KEY, collapsed ? "1" : "0");
    cancelAnimationFrame(this.sidebarToggleRefreshFrame || 0);
    this.syncActiveTabLayout();
    this.sidebarToggleRefreshFrame = requestAnimationFrame(() => {
      this.scheduleChartResize();
    });
    this.sidebarToggleSettledTimer = window.setTimeout(() => {
      shell.classList.remove("is-sidebar-toggling");
    }, 420);
  },

  toggleSidebar() {
    const shell = Utils.$("appShell");
    if (!shell) {
      return;
    }
    if (this.isMobileViewport()) {
      this.toggleMobileDrawer();
      return;
    }
    this.applySidebarState(!shell.classList.contains("is-sidebar-collapsed"));
  },

  toggleBudgetFilters(forceValue = null) {
    App.setBudgetFiltersCollapsed(forceValue === null ? !this.budgetFiltersCollapsed : forceValue);
    this.renderBudgetFilters();
    this.scheduleChartResize();
  },

  renderSyncState() {
    const pill = Utils.$("syncPill");
    const dot = Utils.$("syncDot");
    const title = Utils.$("syncTitle");
    const subtitle = Utils.$("syncSubtitle");
    const meta = Utils.$("syncMetaNote");
    const login = Auth.getLogin();
    const hasPending = Sync.hasPendingChanges(login);
    const applySyncCopy = (nextTitle, nextSubtitle, nextMeta = "") => {
      title.textContent = nextTitle;
      subtitle.textContent = nextSubtitle;
      if (meta) {
        meta.textContent = nextMeta;
      }
      if (pill) {
        const summary = [nextTitle, nextSubtitle, nextMeta].filter(Boolean).join(". ");
        pill.title = summary;
        pill.setAttribute("aria-label", summary);
      }
    };
    const lastSentMeta = Sync.lastSyncedAt ? `Последняя синхронизация: ${Utils.timeSince(Sync.lastSyncedAt)}` : "";
    dot.className = "sync-pill__dot";

    if (!Auth.hasSession()) {
      applySyncCopy("На этом устройстве", "Бюджет хранится в браузере", "Подключите аккаунт, чтобы включить облако");
      return;
    }
    if (Auth.isLocalOnly()) {
      applySyncCopy("Локальная сессия", "Бюджет доступен только на этом устройстве", "Облако не подключено");
      return;
    }
    if (Sync.status === "syncing") {
      dot.classList.add("is-syncing");
      applySyncCopy(
        `Аккаунт: ${login}`,
        "Сверяем изменения с облаком",
        hasPending
          ? (lastSentMeta ? `${lastSentMeta} · Есть новые изменения` : "Есть новые изменения")
          : (lastSentMeta || "Сверяемся с облаком")
      );
      return;
    }
    if (Sync.status === "offline") {
      applySyncCopy(
        `Аккаунт: ${login}`,
        "Связь с облаком потеряна",
        hasPending
          ? "Изменения сохранены на устройстве и отправятся позже"
          : (lastSentMeta || "Текущие данные не потеряны")
      );
      return;
    }
    if (Sync.status === "conflict") {
      dot.classList.add("is-error");
      applySyncCopy(
        `Аккаунт: ${login}`,
        "Есть две измененные версии бюджета",
        "Выберите облачную версию или версию с этого устройства; до выбора обе копии сохранены"
      );
      return;
    }
    if (Sync.status === "error") {
      dot.classList.add("is-error");
      applySyncCopy(
        `Аккаунт: ${login}`,
        "Не получилось обновить данные в облаке",
        Sync.lastError
          ? Utils.truncateSingleLine(Sync.lastError, 72)
          : (lastSentMeta ? `${lastSentMeta} · Данные на устройстве сохранены` : "Данные на устройстве сохранены")
      );
      return;
    }
    if (hasPending) {
      dot.classList.add("is-syncing");
      applySyncCopy(
        `Аккаунт: ${login}`,
        "Есть изменения на этом устройстве",
        navigator.onLine
          ? (lastSentMeta ? `${lastSentMeta} · Отправляем в облако автоматически` : "Отправляем в облако автоматически")
          : "Отправим в облако, когда появится интернет"
      );
      return;
    }
    dot.classList.add("is-synced");
    applySyncCopy(
      `Аккаунт: ${login}`,
      "Все синхронизировано",
      lastSentMeta || "Облако подключено и готово"
    );
  },

  renderHistoryState() {
    const undoBtn = Utils.$("undoBtn");
    const redoBtn = Utils.$("redoBtn");
    if (undoBtn) {
      undoBtn.disabled = !Store.canUndo();
      undoBtn.setAttribute("aria-disabled", String(!Store.canUndo()));
    }
    if (redoBtn) {
      redoBtn.disabled = !Store.canRedo();
      redoBtn.setAttribute("aria-disabled", String(!Store.canRedo()));
      }
    },

    togglePasswordVisibility(inputId, button) {
      const input = Utils.$(inputId);
      if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLElement)) {
        return;
      }
      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      button.textContent = nextType === "password" ? "Показать" : "Скрыть";
      button.setAttribute("aria-pressed", String(nextType === "text"));
    },

    syncAuthFieldState(input) {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      if (input.closest(".password-field")) {
        this.syncPasswordFieldState(input);
      }
    },

    syncPasswordFieldState(input) {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const field = input.closest(".password-field");
      if (!(field instanceof HTMLElement)) {
        return;
      }
      const hasValue = input.value.trim().length > 0;
      field.classList.toggle("password-field--active", hasValue);
      const toggle = field.querySelector(".password-field__toggle");
      if (toggle instanceof HTMLElement) {
        toggle.setAttribute("aria-hidden", String(!hasValue));
      }
      if (!hasValue && input.type !== "password") {
        input.type = "password";
        if (toggle instanceof HTMLElement) {
          toggle.textContent = "Показать";
          toggle.setAttribute("aria-pressed", "false");
        }
      }
    },

    syncAllAuthFields() {
      ["startupLogin", "startupPassword", "modalLogin", "modalPassword"].forEach((id) => {
        const input = Utils.$(id);
        if (input instanceof HTMLInputElement) {
          this.syncAuthFieldState(input);
        }
      });
    },

    syncAllPasswordFields() {
      this.syncAllAuthFields();
    },

    getAuthSourceForElement(element) {
      const form = element?.closest?.("form");
      return form?.id === "modalAuthForm" ? "modal" : "startup";
    },

    getAuthStatusNode(source = "startup") {
      return Utils.$(source === "modal" ? "modalAuthStatus" : "startupAuthStatus");
    },

    getSettingsStatusNode(kind = "quick") {
      return Utils.$(kind === "backup" ? "backupStatus" : "settingsQuickStatus");
    },

    setStatusNode(node, message = "", tone = "info") {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const text = String(message || "").trim();
      node.dataset.tone = tone;
      if (!text) {
        node.textContent = "";
        node.hidden = true;
        return;
      }
      node.textContent = text;
      node.hidden = false;
    },

    clearStatusNode(node) {
      this.setStatusNode(node, "");
    },

    setAuthStatus(source = "startup", message = "", tone = "info") {
      this.setStatusNode(this.getAuthStatusNode(source), message, tone);
    },

    clearAuthStatus(source = "startup") {
      this.clearStatusNode(this.getAuthStatusNode(source));
    },

    setSettingsStatus(message = "", tone = "info") {
      this.setStatusNode(this.getSettingsStatusNode("quick"), message, tone);
    },

    clearSettingsStatus() {
      this.clearStatusNode(this.getSettingsStatusNode("quick"));
    },

    setBackupStatus(message = "", tone = "info") {
      this.setStatusNode(this.getSettingsStatusNode("backup"), message, tone);
    },

    clearBackupStatus() {
      this.clearStatusNode(this.getSettingsStatusNode("backup"));
    },

    setAuthButtonLoading(button, active, mode = "login") {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      button.classList.toggle("is-loading", active);
      button.disabled = active;
      button.setAttribute("aria-busy", active ? "true" : "false");
      const form = button.closest("form");
      if (form instanceof HTMLElement) {
        form.setAttribute("aria-busy", active ? "true" : "false");
      }
      button.textContent = active
        ? (mode === "login" ? "Входим..." : "Создаем...")
        : (mode === "login" ? "Войти" : "Создать аккаунт");
    },

    markAuthFieldInvalid(input) {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const control = input.closest(".auth-field__control");
      if (control instanceof HTMLElement) {
        control.classList.add("is-invalid");
      }
      input.setAttribute("aria-invalid", "true");
    },

    clearAuthFieldError(input) {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const control = input.closest(".auth-field__control");
      if (control instanceof HTMLElement) {
        control.classList.remove("is-invalid");
      }
      input.setAttribute("aria-invalid", "false");
    },

    shakeAuthCard(source = "startup") {
      const root = source === "startup"
        ? document.querySelector(".auth-shell-card")
        : Utils.$("authModal")?.querySelector(".modal__dialog");
      if (!(root instanceof HTMLElement) || typeof root.animate !== "function") {
        return;
      }
      if (root.__authShakeAnimation) {
        root.__authShakeAnimation.cancel();
      }
      root.__authShakeAnimation = root.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(-2px)" },
          { transform: "translateX(0)" }
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    },

  renderTabs() {
    const shell = Utils.$("appShell");
    if (shell) {
      shell.classList.toggle("is-mobile-budget-tab", Store.activeTab === "overviewTab");
    }
    const mobileTopbarTitle = Utils.$("mobileTopbarTitle");
    if (mobileTopbarTitle) {
      const titles = {
        overviewTab: "Бюджет",
        analyticsTab: "Аналитика",
        monthsTab: "Месяцы",
        settingsTab: "Настройки"
      };
      mobileTopbarTitle.textContent = titles[Store.activeTab] || "Бюджет";
    }
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const isActive = panel.id === Store.activeTab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
        panel.setAttribute("aria-hidden", String(!isActive));
      });
    document.querySelectorAll(".tabbar__btn").forEach((button) => {
      const isActive = button.dataset.tabTarget === Store.activeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const title = ({
      overviewTab: "Бюджет",
      analyticsTab: "Аналитика",
      monthsTab: "Месяцы",
      settingsTab: "Настройки"
    })[Store.activeTab];
    const announcer = Utils.$("routeAnnouncer");
    if (announcer && title) announcer.textContent = `Открыт раздел: ${title}`;
  },
});
