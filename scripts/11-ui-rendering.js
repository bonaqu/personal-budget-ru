Object.assign(UI, {
  renderPicker() {
    const listRoot = Utils.$("pickerList");
    const title = Utils.$("pickerTitle");
    const count = Utils.$("pickerCount");
    const applyBtn = Utils.$("pickerApplyBtn");
    if (!listRoot || !title || !count || !applyBtn) {
      return;
    }

    if (UI.pickerState.kind === "category") {
      const type = UI.pickerState.context?.type === "income" ? "income" : "expense";
      const categories = Store.getCategories(type);
      const selectedId = Array.from(UI.pickerState.ids)[0] || "";
      const selectedCategory = selectedId ? Store.getCategory(selectedId) : null;

      title.textContent = type === "income" ? "Категория дохода" : "Категория расхода";
      count.textContent = selectedCategory ? `Выбрано: ${selectedCategory.name}` : "Выберите одну категорию";
      applyBtn.textContent = "Применить категорию";
      applyBtn.disabled = !selectedId;

      if (!categories.length) {
        listRoot.innerHTML = '<div class="empty-state empty-state--compact">Сначала добавьте хотя бы одну категорию в настройках.</div>';
        return;
      }

      listRoot.innerHTML = categories.map((category) => {
        const checked = category.id === selectedId;
        const meta = `${category.type === "income" ? "Доход" : "Расход"}${category.limit ? ` • Лимит ${Utils.formatMoney(category.limit)}` : ""}`;
        return `
          <button class="picker-item picker-item--category${checked ? " is-active" : ""}" type="button" data-picker-toggle="${category.id}">
            <span class="picker-item__swatch" style="background:${category.color}"></span>
            <div class="picker-item__body">
              <strong>${Utils.escapeHtml(category.name)}</strong>
              <small>${Utils.escapeHtml(meta)}</small>
            </div>
            <span class="picker-item__check">${checked ? "✓" : ""}</span>
          </button>
        `;
      }).join("");
      return;
    }

    const isFavorite = UI.pickerState.kind === "favorites";
    const templateBucket = UI.pickerState.kind?.startsWith?.("templates-")
      ? UI.pickerState.kind.replace("templates-", "")
      : null;
    const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
    const source = isFavorite
      ? Store.data.settings.favorites
      : (templateBucket ? Store.getTemplatesByBucket(templateBucket) : Store.data.settings.templates);
    title.textContent = isFavorite ? "Выберите избранное" : (templateMeta?.pickerTitle || "Выберите шаблоны");
    count.textContent = UI.pickerState.ids.size ? `Выбрано: ${UI.pickerState.ids.size}` : "Ничего не выбрано";
    applyBtn.textContent = isFavorite ? "Добавить в текущие расходы" : (templateMeta?.pickerApplyText || "Добавить по шаблону");
    applyBtn.disabled = !source.length;

    if (!source.length) {
      listRoot.innerHTML = `<div class="empty-state empty-state--compact">${isFavorite ? "Список избранного пока пуст. Сохраните первую покупку, чтобы добавлять ее в один клик." : "Сценарии пока не готовы. Создайте первый шаблон, и он появится здесь."}</div>`;
      return;
    }

    listRoot.innerHTML = source.map((item) => {
      const categoryName = Store.getCategory(item.categoryId)?.name
        || (isFavorite ? "Без категории" : (templateMeta?.itemLabel || "Шаблон"));
      const checked = UI.pickerState.ids.has(item.id);
      return `
        <button class="picker-item${checked ? " is-active" : ""}" type="button" data-picker-toggle="${item.id}">
          <span class="picker-item__mark">${checked ? "✓" : ""}</span>
          <div class="picker-item__body">
            <strong>${Utils.escapeHtml(item.desc || "Без названия")}</strong>
            <small>${Utils.escapeHtml(categoryName)} • ${Utils.formatMoney(item.amount)}</small>
          </div>
        </button>
      `;
    }).join("");
  },

  renderCharts() {
    if (typeof window.Chart === "undefined") {
      return;
    }
    const colors = Utils.themePalette();
    const series = Store.monthlySeries(6);
    const flowLabels = series.map((item) => item.label);
    const flowDatasets = [
      {
        label: "Доходы",
        data: series.map((item) => item.income),
        backgroundColor: Utils.cssRgb("--success-rgb", 0.8, "rgba(46,160,67,0.8)"),
        borderRadius: 10
      },
      {
        label: "Расходы",
        data: series.map((item) => item.expense),
        backgroundColor: Utils.cssRgb("--danger-rgb", 0.8, "rgba(248,81,73,0.8)"),
        borderRadius: 10
      },
      {
        type: "line",
        label: "Чистый поток",
        data: series.map((item) => item.balance),
        borderColor: colors.accent,
        pointRadius: 3,
        tension: 0.35
      }
    ];
    const flowSignature = JSON.stringify({
      labels: flowLabels,
      datasets: flowDatasets.map((item) => ({
        label: item.label,
        type: item.type || "bar",
        data: item.data,
        backgroundColor: item.backgroundColor || "",
        borderColor: item.borderColor || ""
      })),
      text: colors.text,
      grid: colors.grid,
      accent: colors.accent
    });
    const flowLegendLabels = {
      color: colors.text,
      usePointStyle: true,
      pointStyle: "circle",
      boxWidth: 8,
      boxHeight: 8,
      padding: 14,
      font: {
        size: 11,
        weight: "700",
        lineHeight: 1.15
      }
    };
    if (!this.charts.flow) {
      this.charts.flow = new window.Chart(Utils.$("cashFlowChart"), {
        type: "bar",
        data: {
          labels: flowLabels,
          datasets: flowDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              labels: flowLegendLabels
            }
          },
          scales: {
            x: {
              ticks: { color: colors.text },
              grid: { color: colors.grid }
            },
            y: {
              ticks: {
                color: colors.text,
                callback: (value) => Utils.formatMoney(value)
              },
              grid: { color: colors.grid }
            }
          }
        }
      });
      this.flowChartSignature = flowSignature;
    } else if (this.flowChartSignature !== flowSignature) {
      this.charts.flow.data.labels = flowLabels;
      this.charts.flow.data.datasets = flowDatasets;
      Object.assign(this.charts.flow.options.plugins.legend.labels, flowLegendLabels, {
        color: colors.text
      });
      this.charts.flow.options.scales.x.ticks.color = colors.text;
      this.charts.flow.options.scales.x.grid.color = colors.grid;
      this.charts.flow.options.scales.y.ticks.color = colors.text;
      this.charts.flow.options.scales.y.grid.color = colors.grid;
      this.charts.flow.update("none");
      this.flowChartSignature = flowSignature;
    }

    const breakdown = Store.expenseBreakdown(Store.viewMonth);
    const categoryLabels = breakdown.length ? breakdown.map((item) => item.category.name) : ["Нет расходов"];
    const categoryDataset = [
      {
        data: breakdown.length ? breakdown.map((item) => item.amount) : [1],
        backgroundColor: breakdown.length ? breakdown.map((item) => item.category.color) : ["#8b949e"],
        borderWidth: 0
      }
    ];
    const categorySignature = JSON.stringify({
      labels: categoryLabels,
      datasets: categoryDataset
    });
    if (!this.charts.category) {
      this.charts.category = new window.Chart(Utils.$("categoryChart"), {
        type: "doughnut",
        data: {
          labels: categoryLabels,
          datasets: categoryDataset
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          cutout: "74%",
          rotation: -90,
          circumference: 180,
          layout: {
            padding: {
              top: 8,
              left: 4,
              right: 4,
              bottom: 0
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${Utils.formatMoney(ctx.parsed)}`
              }
            }
          }
        }
      });
      this.categoryChartSignature = categorySignature;
    } else if (this.categoryChartSignature !== categorySignature) {
      this.charts.category.data.labels = categoryLabels;
      this.charts.category.data.datasets = categoryDataset;
      this.charts.category.update("none");
      this.categoryChartSignature = categorySignature;
    }
    this.scheduleChartResize();
  },

  ensureChartsReady({ silent = false } = {}) {
    if (typeof window.Chart !== "undefined") {
      return Promise.resolve(window.Chart);
    }
    if (this.chartLibraryPromise) {
      return this.chartLibraryPromise;
    }
    // Chart.js нужен только когда пользователь реально открывает экран с графиками.
    this.chartLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error("Не удалось загрузить библиотеку графиков."));
      document.head.appendChild(script);
    }).catch((error) => {
      this.chartLibraryPromise = null;
      Diagnostics.report("charts:load-failed", { message: error.message }, "error");
      if (!silent) {
        this.toast(error.message, "warning");
      }
      throw error;
    });
    return this.chartLibraryPromise;
  },

  scheduleChartWarmup() {
    if (
      this.chartWarmupScheduled ||
      typeof window === "undefined" ||
      typeof window.Chart !== "undefined" ||
      this.chartLibraryPromise
    ) {
      return;
    }
    this.chartWarmupScheduled = true;
    const warmup = () => {
      this.ensureChartsReady({ silent: true })
        .catch(() => {})
        .finally(() => {
          this.chartWarmupScheduled = false;
        });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => warmup(), { timeout: 1500 });
      return;
    }
    window.setTimeout(() => warmup(), 900);
  },

  renderActiveTabContent(tabId = Store.activeTab) {
    if (tabId === "overviewTab") {
      const chartsReady = this.ensureChartsReady({ silent: true });
      this.renderMonthBalanceLegend(Utils.themePalette());
      this.renderSummary();
      this.renderMonthPlan();
      this.renderBudgetFilters();
      this.renderJournal();
      this.renderTransactions();
      App.runAfterNextPaint(() => {
        if (Store.activeTab === "overviewTab") {
          this.renderOverviewExpenseLegend();
          this.renderBudgetLimits();
          this.syncBudgetWorkspaceLayout();
        }
      }, 1);
      App.runAfterNextPaint(() => {
        if (Store.activeTab === "overviewTab") {
          this.syncBudgetWorkspaceLayout();
        }
      }, 2);
      chartsReady.then(() => {
        if (Store.activeTab !== "overviewTab") {
          return;
        }
        this.renderMonthBalanceChart();
        App.runAfterNextPaint(() => {
          if (Store.activeTab === "overviewTab") {
            this.syncBudgetWorkspaceLayout();
          }
        }, 2);
      }).catch(() => {});
      this.refreshCompactTextareas();
      return;
    }

    if (tabId === "analyticsTab") {
      const chartsReady = this.ensureChartsReady({ silent: true });
      this.renderInsights();
      this.renderCashflowStrip();
      this.renderGoals();
      this.renderAnalyticsBreakdownLegend();
      this.renderPaymentCalendar();
      this.renderHeatmap();
      this.renderAnalyticsAdvancedContent(this.analyticsAdvancedView);
      this.renderAnalyticsAdvancedState();
      chartsReady.then(() => {
        if (Store.activeTab !== "analyticsTab") {
          return;
        }
        this.renderCharts();
      }).catch(() => {});
      return;
    }

    if (tabId === "monthsTab") {
      this.renderMonthsOverview();
      this.renderMonthsTable();
      this.renderMonthDetail();
      return;
    }

    if (tabId === "settingsTab") {
      this.renderQuickSettings();
      this.renderCategories();
      this.refreshCompactTextareas();
    }
  },

  renderDataState() {
    // Обновляем только зоны, которые действительно зависят от данных,
    // без полной пересборки общей оболочки приложения.
    this.applyTheme();
    this.renderTabs();
    this.renderMonthNavigation?.();
    this.renderSyncState();
    this.renderHistoryState();
    this.renderFormCategories();
    this.renderEditCategories();
    this.renderTemplateCategories();
    this.renderCategoryColorValue();
    this.renderGoalColorValue();
    this.syncGoalModeFields();
    this.renderFilterCategories();
    this.renderPicker();
    this.renderActiveTabContent(Store.activeTab);
  },

  renderApp() {
    const accountButton = Utils.$("accountBtn");
    if (accountButton) {
      accountButton.innerHTML = `
        <span class="sidebar-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8.5" r="3"></circle>
            <path d="M6.5 18.5C7.9 15.9 10 14.75 12 14.75C14 14.75 16.1 15.9 17.5 18.5"></path>
          </svg>
        </span>
        <span class="sidebar-nav__label">Аккаунт</span>
      `;
      accountButton.setAttribute("aria-label", Auth.hasSession() ? `Аккаунт ${Auth.getLogin()}` : "Аккаунт");
    }
    this.renderDataState();
    this.scheduleChartWarmup();
  },

  toast(message, tone = "info") {
    const labels = {
      success: "Готово",
      warning: "Внимание",
      error: "Ошибка",
      info: "Информация"
    };
    const toast = Utils.createElement("div", `toast toast--${tone}`);
    toast.setAttribute("role", tone === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
    const title = Utils.createElement("strong", "", labels[tone] || labels.info);
    const text = Utils.createElement("span", "", message);
    toast.append(title, text);
    Utils.$("toastStack").appendChild(toast);
    setTimeout(() => this.dismissToast(toast), 3400);
  },

  dismissToast(toast) {
    if (!(toast instanceof HTMLElement) || toast.dataset.dismissing === "1") {
      return;
    }
    toast.dataset.dismissing = "1";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 220);
  }
});
