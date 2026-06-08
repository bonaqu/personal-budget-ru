Object.assign(UI, {
  getBudgetCategoryFallback(type = "expense") {
    return type === "income" ? "Категория дохода" : "Категория расхода";
  },

  resolveBudgetCategorySelection(type, currentValue = "", selectedId = null) {
    const categories = Store.getCategories(type);
    const preferredId = selectedId || currentValue || "";
    const nextId = categories.some((category) => category.id === preferredId)
      ? preferredId
      : (categories[0]?.id || "");
    return { categories, nextId };
  },

  syncBudgetCategoryField({ inputId, triggerId = "", type = "expense", selectedId = null, flowKindInputId = "" }) {
    const input = Utils.$(inputId);
    if (!input) {
      return { categories: [], nextId: "" };
    }
    const { categories, nextId } = this.resolveBudgetCategorySelection(type, input.value, selectedId);
    input.value = nextId;
    if (triggerId) {
      this.setCategoryTrigger(triggerId, nextId, this.getBudgetCategoryFallback(type));
    }
    if (flowKindInputId) {
      const flowKindInput = Utils.$(flowKindInputId);
      if (flowKindInput) {
        flowKindInput.disabled = type === "income";
        if (type === "income") {
          flowKindInput.value = "standard";
        }
      }
    }
    return { categories, nextId };
  },

  setBudgetText(target, text) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    if (node) {
      node.textContent = text;
    }
    return node;
  },

  renderMonthNavigation() {
    const isCurrentMonth = Store.viewMonth === Utils.monthKey(new Date());
    const rawCurrentMonthName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date());
    const currentMonthName = rawCurrentMonthName
      ? `${rawCurrentMonthName.charAt(0).toLocaleUpperCase("ru-RU")}${rawCurrentMonthName.slice(1)}`
      : Utils.monthLabel(Utils.monthKey(new Date()));
    this.setBudgetText("sidebarMonthLabel", Utils.monthLabel(Store.viewMonth));
    const todayButton = Utils.$("todayBtn");
    if (!todayButton) {
      return;
    }
    todayButton.disabled = isCurrentMonth;
    todayButton.classList.toggle("is-current", isCurrentMonth);
    todayButton.setAttribute("aria-current", isCurrentMonth ? "date" : "false");
    const todayButtonLabel = isCurrentMonth
      ? `Открыт текущий месяц — ${currentMonthName}`
      : `Перейти к текущему месяцу — ${currentMonthName}`;
    todayButton.title = todayButtonLabel;
    todayButton.setAttribute("aria-label", todayButtonLabel);
  },

  setBudgetAmountState(target, value) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    if (node) {
      node.textContent = Utils.formatMoney(value);
      node.className = value >= 0 ? "amount-positive" : "amount-negative";
    }
    return node;
  },

  setBudgetHelp(target, text) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    Utils.setHelpText(node, text);
  },

  renderFormCategories() {
    const type = document.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    const input = Utils.$("categoryInput");
    const currentCategory = Store.getCategory(input?.value || "");
    const selectedId = currentCategory?.type === type ? input.value : null;
    this.syncBudgetCategoryField({
      inputId: "categoryInput",
      type,
      selectedId,
      flowKindInputId: "flowKindInput"
    });
  },

  renderEditCategories(selectedId = null, selectedType = null) {
    const type = selectedType || document.querySelector('input[name="editTransactionType"]:checked')?.value || "expense";
    this.syncBudgetCategoryField({
      inputId: "editCategoryInput",
      triggerId: "editCategoryTriggerBtn",
      type,
      selectedId,
      flowKindInputId: "editFlowKindInput"
    });
  },

  renderTemplateCategories(selectedId = null) {
    const typeInput = Utils.$("templateTypeInput");
    if (!typeInput) {
      return;
    }
    this.syncBudgetCategoryField({
      inputId: "templateCategoryInput",
      triggerId: "templateCategoryTriggerBtn",
      type: typeInput.value,
      selectedId,
      flowKindInputId: "templateFlowKindInput"
    });
  },

  renderFilterCategories() {
    const filterCategory = Utils.$("filterCategory");
    if (!filterCategory) {
      return;
    }
    const type = Store.filters.type === "all" ? "all" : Store.filters.type;
    const options = ['<option value="all">Все категории</option>']
      .concat(
        Store.getCategories(type).map((category) => `<option value="${category.id}"${Store.filters.categoryId === category.id ? " selected" : ""}>${Utils.escapeHtml(category.name)}</option>`)
      )
      .join("");
    filterCategory.innerHTML = options;
  },

  renderBudgetFilters() {
    const shell = Utils.$("budgetFilterShell");
    const body = Utils.$("budgetFilterBody");
    const toggle = Utils.$("budgetFilterToggleBtn");
    const summary = Utils.$("listSummary");
    if (!shell || !body || !toggle) {
      return;
    }
    const hasActiveFilters = Boolean(
      Store.filters.search ||
      Store.filters.categoryId !== "all" ||
      Store.filters.type !== "all" ||
      Store.filters.period !== "month" ||
      Store.filters.sort !== "date-desc" ||
      Store.filters.dateFrom ||
      Store.filters.dateTo
    );
    const collapsed = this.budgetFiltersCollapsed;
    shell.classList.toggle("is-collapsed", collapsed);
    shell.classList.toggle("has-active-filters", hasActiveFilters);
    toggle.textContent = collapsed ? "Фильтры" : "Скрыть";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    if (summary) {
      summary.setAttribute("aria-expanded", String(!collapsed));
      summary.title = collapsed ? "Открыть поиск и фильтры" : "Свернуть поиск и фильтры";
    }
  },

  renderSummary() {
    const allTime = Store.allTimeStats();
    const active = Store.statsForMonth(Store.viewMonth);
    this.renderMonthNavigation();
    const monthLabelLower = Utils.monthLabel(Store.viewMonth).toLowerCase();
    const balanceTooltip = `Общий баланс показывает итог за всю историю: все доходы минус все расходы по всем месяцам. Он не равен остатку текущего месяца. Чтобы понять, сколько денег остается в выбранном месяце, смотрите карточку "Остаток на конец".`;
    const incomeTooltip = `Доходы месяца — сумма всех поступлений только за ${Utils.monthLabel(Store.viewMonth).toLowerCase()}. Основание расчета: операции раздела "Доходы" выбранного месяца.`;
    const expenseTooltip = `Расходы месяца — сумма всех списаний выбранного месяца, включая долги, обязательные платежи и текущие расходы. Хотелки сюда не попадают, пока вы не перенесете их в расход.`;
    const netTooltip = `Чистый поток — это доходы месяца минус расходы месяца. Положительное значение означает месяц в плюсе, отрицательное — расходов было больше, чем доходов.`;
    const savingsTooltip = `Норма накопления показывает, какая доля дохода осталась после расходов в выбранном месяце. Формула: (доходы - расходы) / доходы * 100%.`;
    const monthOpsTooltip = `Операций в месяце — сколько строк вы уже добавили в ${Utils.monthLabel(Store.viewMonth).toLowerCase()}. Помогает быстро оценить плотность месяца.`;
    const averageCheckTooltip = `Средний чек показывает, сколько в среднем уходит на одну расходную операцию в месяце. Помогает заметить, когда покупки становятся тяжелее по сумме.`;
    const topExpenseTooltip = active.topExpense
      ? `Крупнейшая трата месяца — ${Utils.formatMoney(active.topExpense.amount)}. ${active.topExpense.description || "Описание не заполнено"}.`
      : "Крупнейшая трата появится после первой расходной операции в месяце.";
    const nodes = {
      activeMonthLabel: Utils.$("activeMonthLabel"),
      historyBalanceInline: Utils.$("historyBalanceInline"),
      historyOpsInline: Utils.$("historyOpsInline"),
      monthTopExpenseInline: Utils.$("monthTopExpenseInline"),
      monthFinalInline: Utils.$("monthFinalInline"),
      incomeTotal: Utils.$("incomeTotal"),
      expenseTotal: Utils.$("expenseTotal"),
      netTotal: Utils.$("netTotal"),
      savingsRate: Utils.$("savingsRate"),
      monthOpsTotal: Utils.$("monthOpsTotal"),
      averageCheckTotal: Utils.$("averageCheckTotal"),
      heroCaption: Utils.$("heroCaption"),
      incomeHint: Utils.$("incomeHint"),
      expenseHint: Utils.$("expenseHint"),
      netHint: Utils.$("netHint"),
      savingsHint: Utils.$("savingsHint"),
      monthOpsHint: Utils.$("monthOpsHint"),
      averageCheckHint: Utils.$("averageCheckHint")
    };
    const signature = JSON.stringify({
      month: Store.viewMonth,
      allTimeBalance: Utils.roundMoney(allTime.balance),
      allTimeOps: Store.data.transactions.length,
      income: Utils.roundMoney(active.totals.income),
      expense: Utils.roundMoney(active.totals.expense),
      net: Utils.roundMoney(active.totals.balance),
      savingsRate: Math.round(Math.max(0, active.savingsRate) * 100) / 100,
      operations: active.operations,
      averageCheck: Utils.roundMoney(active.averageCheck),
      finalBalance: Utils.roundMoney(active.finalBalance),
      topExpense: Utils.roundMoney(active.topExpense?.amount || 0)
    });
    if (this.budgetRenderCache?.summary === signature) {
      return;
    }
    if (this.budgetRenderCache) {
      this.budgetRenderCache.summary = signature;
    }

    this.setBudgetText(nodes.activeMonthLabel, Utils.monthLabel(Store.viewMonth));
    this.setBudgetText(nodes.historyBalanceInline, Utils.formatMoney(allTime.balance));
    this.setBudgetText(nodes.historyOpsInline, String(Store.data.transactions.length));
    this.setBudgetText(nodes.monthTopExpenseInline, Utils.formatMoney(active.topExpense?.amount || 0));
    this.setBudgetText(nodes.monthFinalInline, Utils.formatMoney(active.finalBalance));
    this.setBudgetText(nodes.incomeTotal, Utils.formatMoney(active.totals.income));
    this.setBudgetText(nodes.expenseTotal, Utils.formatMoney(active.totals.expense));
    this.setBudgetText(nodes.netTotal, Utils.formatMoney(active.totals.balance));
    this.setBudgetText(nodes.savingsRate, Utils.formatPercent(Math.max(0, active.savingsRate)));
    this.setBudgetText(nodes.monthOpsTotal, String(active.operations));
    this.setBudgetText(nodes.averageCheckTotal, Utils.formatMoney(active.averageCheck));
    this.setBudgetText(nodes.heroCaption, `${active.operations} операций в ${monthLabelLower} · остаток на конец ${Utils.formatMoney(active.finalBalance)}.`);
    this.setBudgetText(nodes.incomeHint, active.totals.income ? "Все поступления" : "Доходов пока не было");
    this.setBudgetText(nodes.expenseHint, active.totals.expense ? "Все списания" : "Расходов пока не было");
    this.setBudgetText(nodes.netHint, active.totals.balance >= 0 ? "Месяц в плюсе" : "Расходы выше доходов");
    this.setBudgetText(nodes.savingsHint, active.totals.income ? "После всех трат" : "Доходов пока не было");
    this.setBudgetText(nodes.monthOpsHint, active.operations ? "Строк в журнале" : "Операций пока нет");
    this.setBudgetText(nodes.averageCheckHint, active.totals.expense ? "Средняя трата" : "Расходов пока нет");

    const snapshotLabels = [
      [nodes.incomeTotal?.closest(".summary-card")?.querySelector("span"), "Доходы месяца"],
      [nodes.expenseTotal?.closest(".summary-card")?.querySelector("span"), "Расходы месяца"],
      [nodes.netTotal?.closest(".summary-card")?.querySelector("span"), "Чистый поток"],
      [nodes.savingsRate?.closest(".summary-card")?.querySelector("span"), "Норма накопления"],
      [nodes.monthOpsTotal?.closest(".summary-card")?.querySelector("span"), "Операции месяца"],
      [nodes.averageCheckTotal?.closest(".summary-card")?.querySelector("span"), "Средний чек"]
    ];
    snapshotLabels.forEach(([node, text]) => this.setBudgetText(node, text));

    [
      [nodes.historyBalanceInline, balanceTooltip],
      [nodes.historyOpsInline, `Всего операций в системе: ${Store.data.transactions.length}. Это число учитывает все месяцы, а не только текущий.`],
      [nodes.monthTopExpenseInline, topExpenseTooltip],
      [nodes.monthFinalInline, "Остаток на конец — итоговая сумма выбранного месяца после всех доходов и расходов. Именно она переходит в следующий месяц как авто-старт."],
      [nodes.incomeTotal, incomeTooltip],
      [nodes.incomeHint, incomeTooltip],
      [nodes.expenseTotal, expenseTooltip],
      [nodes.expenseHint, expenseTooltip],
      [nodes.netTotal, netTooltip],
      [nodes.netHint, netTooltip],
      [nodes.savingsRate, savingsTooltip],
      [nodes.savingsHint, savingsTooltip],
      [nodes.monthOpsTotal, monthOpsTooltip],
      [nodes.monthOpsHint, monthOpsTooltip],
      [nodes.averageCheckTotal, averageCheckTooltip],
      [nodes.averageCheckHint, averageCheckTooltip]
    ].forEach(([target, text]) => this.setBudgetHelp(target, text));
  },

  renderMonthPlan() {
    const stats = Store.statsForMonth(Store.viewMonth);
    const meta = Store.getMonthMeta(Store.viewMonth);
    const input = Utils.$("monthStartInput");
    const manualCheck = Utils.$("manualStartCheck");
    const badge = Utils.$("monthStartModeBadge");
    const hint = Utils.$("monthStartHint");
    const startResolved = Utils.$("monthStartResolved");
    const startResolvedHint = Utils.$("monthStartResolvedHint");
    const freeCash = Utils.$("monthFreeCash");
    const freeCashHint = Utils.$("monthFreeCashHint");
    const finalBalance = Utils.$("monthFinalBalance");
    const finalBalanceHint = Utils.$("monthFinalBalanceHint");
    const minBalance = Utils.$("monthMinBalance");
    const minBalanceHint = Utils.$("monthMinBalanceHint");
    if (!input || !manualCheck || !badge || !hint) {
      return;
    }
    const signature = JSON.stringify({
      month: Store.viewMonth,
      manualStart: Boolean(meta.manualStart),
      manualValue: Utils.roundMoney(meta.start || 0),
      startBalance: Utils.roundMoney(stats.startBalance),
      freeCash: Utils.roundMoney(stats.freeCash),
      finalBalance: Utils.roundMoney(stats.finalBalance),
      minBalance: Utils.roundMoney(stats.minBalance),
      minBalanceDay: stats.minBalanceDay || 0,
      previousMonthKey: stats.previousMonthKey || ""
    });
    if (this.budgetRenderCache?.monthPlan === signature) {
      return;
    }
    if (this.budgetRenderCache) {
      this.budgetRenderCache.monthPlan = signature;
    }

    input.disabled = !meta.manualStart;
    input.placeholder = `Авто: ${Utils.formatMoney(stats.startBalance)}`;
    input.value = meta.manualStart ? (meta.start === 0 ? "0" : String(meta.start || "")) : "";
    manualCheck.checked = Boolean(meta.manualStart);
    badge.textContent = meta.manualStart ? "Ручной старт" : "Авто-старт";
    hint.textContent = meta.manualStart
      ? `Ручной остаток: ${Utils.formatMoney(meta.start || 0)}`
      : stats.previousMonthKey && (Store.data.months[stats.previousMonthKey] || Store.getTransactions("month", stats.previousMonthKey).length)
        ? `Авто из ${Utils.monthLabel(stats.previousMonthKey).toLowerCase()}: ${Utils.formatMoney(stats.startBalance)}`
        : `Авто: ${Utils.formatMoney(stats.startBalance)}`;

    this.setBudgetText(startResolved, Utils.formatMoney(stats.startBalance));
    this.setBudgetText(startResolvedHint, meta.manualStart ? "Фиксирован вручную" : "Подхвачен автоматически");
    this.setBudgetAmountState(freeCash, stats.freeCash);
    this.setBudgetText(freeCashHint, stats.freeCash >= 0 ? "После всех операций месяца" : "Нужно перекрыть дефицит");
    this.setBudgetAmountState(finalBalance, stats.finalBalance);
    this.setBudgetText(finalBalanceHint, "Переносится на следующий месяц");
    this.setBudgetAmountState(minBalance, stats.minBalance);
    this.setBudgetText(minBalanceHint, stats.minBalanceDay ? `Минимум приходится на ${stats.minBalanceDay} число` : "Без просадки ниже стартовой точки");

    [
      input,
      hint,
      startResolved,
      startResolvedHint,
      freeCash,
      freeCashHint,
      finalBalance,
      finalBalanceHint,
      minBalance,
      minBalanceHint
    ].forEach((target) => {
      if (target instanceof HTMLElement) {
        target.removeAttribute("title");
        target.removeAttribute("aria-label");
        const statCard = target.closest("article");
        if (statCard instanceof HTMLElement) {
          statCard.removeAttribute("title");
          statCard.removeAttribute("aria-label");
          statCard.classList.remove("has-help");
        }
      }
    });
    const monthBalanceChart = Utils.$("monthBalanceChart");
    if (monthBalanceChart instanceof HTMLElement) {
      monthBalanceChart.removeAttribute("title");
      monthBalanceChart.removeAttribute("aria-label");
    }
    const monthPlanPanel = monthBalanceChart?.closest("article");
    if (monthPlanPanel instanceof HTMLElement) {
      monthPlanPanel.removeAttribute("title");
      monthPlanPanel.removeAttribute("aria-label");
      monthPlanPanel.classList.remove("has-help");
    }
    const previewValue = Utils.$("monthTrendPreviewValue");
    const previewMin = Utils.$("monthTrendPreviewMin");
    const previewFinal = Utils.$("monthTrendPreviewFinal");
    if (previewValue) {
      previewValue.textContent = stats.finalBalance >= stats.startBalance
        ? "Баланс держится выше старта"
        : "Баланс проседает относительно старта";
    }
    if (previewMin) {
      previewMin.textContent = Utils.formatMoney(stats.minBalance);
    }
    if (previewFinal) {
      previewFinal.textContent = Utils.formatMoney(stats.finalBalance);
    }
  },

  renderBudgetLimits() {
    const root = Utils.$("budgetLimitList");
    if (!root) {
      return;
    }
    const limits = Store.budgetLimitProgress(Store.viewMonth).slice(0, 5);
    const signature = limits.length
      ? JSON.stringify(limits.map((item) => ({
        id: item.category.id,
        spent: item.spent,
        limit: item.limit,
        usage: Math.round(item.usage * 10) / 10,
        exceeded: item.exceeded
      })))
      : "empty";
    if (root.dataset.renderSignature === signature) {
      return;
    }
    if (!limits.length) {
      root.innerHTML = '<div class="empty-state empty-state--compact">Добавьте лимит в категории, чтобы видеть прогресс прямо в бюджете.</div>';
      root.dataset.renderSignature = signature;
      return;
    }
    root.innerHTML = limits.map((item) => {
      const spentText = `${Utils.formatMoney(item.spent)} / ${Utils.formatMoney(item.limit)}`;
      const progressWidth = `${Math.max(6, Math.min(100, item.progress))}%`;
      const statusText = item.exceeded
        ? `Перелимит ${Utils.formatMoney(item.overage)}`
        : `Осталось ${Utils.formatMoney(Math.max(0, item.remaining))}`;
      const toneClass = item.exceeded ? " is-exceeded" : (item.usage >= 85 ? " is-tight" : "");
      return `
        <article class="budget-limit-card${toneClass}" style="--budget-card-accent:${item.category.color}">
          <div class="budget-limit-card__head">
            <div class="budget-limit-card__category">
              <span class="budget-limit-card__swatch" style="background:${item.category.color}"></span>
              <strong title="${Utils.escapeHtml(item.category.name)}">${Utils.escapeHtml(item.category.name)}</strong>
            </div>
            <span class="budget-limit-card__amount">${spentText}</span>
          </div>
          <div class="budget-limit-card__bar" aria-hidden="true">
            <span style="width:${progressWidth}; background:${item.category.color}"></span>
          </div>
          <small>${statusText}</small>
        </article>
      `;
    }).join("");
    root.dataset.renderSignature = signature;
  },

  renderJournal() {
    const sections = {
      incomes: "incomesList",
      debts: "debtsList",
      recurring: "recurringBudgetList",
      expenses: "expensesList",
      wishlist: "wishList"
    };
    const limitMap = new Map(
      Store.budgetLimitProgress(Store.viewMonth).map((item) => [item.category.id, item])
    );
    const limitSignature = JSON.stringify(
      Array.from(limitMap.values()).map((item) => ({
        id: item.category.id,
        limit: Utils.roundMoney(item.limit),
        spent: Utils.roundMoney(item.spent),
        progress: Math.round(item.progress),
        exceeded: Boolean(item.exceeded)
      }))
    );

    Object.entries(sections).forEach(([section, elementId]) => {
      const root = Utils.$(elementId);
      if (!root) {
        return;
      }
      const items = Store.getSectionTransactions(section, Store.viewMonth);
      const meta = SECTION_META[section];
      const sectionSignature = items.length
        ? JSON.stringify({
          section,
          sort: this.getJournalSectionSortMode(section),
          limits: section === "expenses" ? limitSignature : "",
          items: items.map((item) => {
            if (section === "wishlist") {
              return {
                id: item.id,
                desc: item.desc || "",
                price: Utils.roundMoney(item.price),
                position: Number(item.position || 0),
                updatedAt: item.updatedAt || item.createdAt || ""
              };
            }
            const templateBucket = ["incomes", "debts", "recurring"].includes(section)
              ? Store.getTemplateBucketForTransaction(item)
              : "";
            return {
              id: item.id,
              date: item.date,
              amount: Utils.roundMoney(item.amount),
              description: item.description || "",
              categoryId: item.categoryId || "",
              flowKind: item.flowKind || "",
              position: Number(item.position || 0),
              favorite: section === "expenses" ? Store.isFavoriteTransaction(item.id) : false,
              templated: templateBucket ? Store.isTemplateTransaction(item.id, templateBucket) : false,
              updatedAt: item.updatedAt || item.createdAt || ""
            };
          })
        })
        : `empty:${section}:${meta.emptyText}`;
      if (root.dataset.renderSignature === sectionSignature) {
        return;
      }
      if (!items.length) {
        root.innerHTML = `<div class="empty-state empty-state--compact">${meta.emptyText}</div>`;
        root.dataset.renderSignature = sectionSignature;
        return;
      }
      root.innerHTML = items.map((item, index) => {
        if (section === "wishlist") {
          return this.renderWishlistRow(item);
        }
        return this.renderJournalRow(section, item, {
          isFirst: index === 0,
          limitMap
        });
      }).join("");
      root.dataset.renderSignature = sectionSignature;
    });

    this.renderJournalSummary();
    this.renderJournalNavigator();
    this.renderJournalSortButtons();
  },

  renderJournalNavigator() {
    const counts = {
      jumpIncomesCount: Store.getSectionTransactions("incomes", Store.viewMonth).length,
      jumpDebtsCount: Store.getSectionTransactions("debts", Store.viewMonth).length,
      jumpRecurringCount: Store.getSectionTransactions("recurring", Store.viewMonth).length,
      jumpExpensesCount: Store.getSectionTransactions("expenses", Store.viewMonth).length,
      jumpWishlistCount: Store.getSectionTransactions("wishlist", Store.viewMonth).length
    };
    Object.entries(counts).forEach(([id, count]) => {
      const node = Utils.$(id);
      if (node) {
        node.textContent = String(count);
      }
    });
  },

  renderJournalSummary() {
    const summary = Utils.$("journalMonthSummary");
    if (!summary) {
      return;
    }
    const stats = Store.statsForMonth(Store.viewMonth);
    summary.textContent = `${stats.operations} операций • ${Utils.formatMoney(stats.totals.income)} / ${Utils.formatMoney(stats.totals.expense)}`;
  },

  renderJournalRow(section, transaction, options = {}) {
    const isFirst = Boolean(options.isFirst);
    const limitItem = section === "expenses" ? options.limitMap?.get(transaction.categoryId) || null : null;
    const day = Number(transaction.date.slice(-2));
    const category = Store.getCategory(transaction.categoryId);
    const favoriteState = section === "expenses" && Store.isFavoriteTransaction(transaction.id) ? " is-active" : "";
    const templateBucket = ["incomes", "debts", "recurring"].includes(section)
      ? Store.getTemplateBucketForTransaction(transaction)
      : null;
    const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket, transaction.type, transaction.flowKind) : null;
    const templateState = templateBucket && Store.isTemplateTransaction(transaction.id, templateBucket) ? " is-active" : "";
    const isDebtSection = section === "debts";
    const fullDescription = transaction.description || "";
    const previewDescription = Utils.truncateSingleLine(fullDescription, 62);
    const limitUsage = limitItem ? Math.round(limitItem.usage) : 0;
    const limitStateClass = limitItem
      ? ` has-limit${limitItem.exceeded ? " is-limit-exceeded" : (limitItem.usage >= 85 ? " is-limit-tight" : "")}`
      : "";
    const limitStateStyle = limitItem
      ? ` style="--entry-limit-progress:${Math.max(6, Math.min(100, limitItem.progress))}%; --entry-limit-color:${limitItem.category.color};"`
      : "";
    const limitTitle = limitItem
      ? (limitItem.exceeded
        ? `Лимит превышен на ${Utils.formatMoney(limitItem.overage)}`
        : `Лимит: ${Utils.formatMoney(limitItem.spent)} из ${Utils.formatMoney(limitItem.limit)} (${limitUsage}%)`)
      : (category?.name || "Без категории");
    const hasSort = ["incomes", "debts", "recurring", "expenses"].includes(section) && isFirst;
      const sortMode = hasSort ? this.getJournalSectionSortMode(section) : "date-desc";
      const sortIcon = sortMode === "date-asc" ? "↑" : "↓";
      const sortLabel = sortMode === "date-asc"
        ? "Одноразовая сортировка по дате: старые сверху"
        : "Одноразовая сортировка по дате: новые сверху";
      const sortTitle = sortMode === "date-asc"
        ? "Одноразово показать старые даты сверху"
        : "Одноразово показать новые даты сверху";
      const dayLabel = hasSort
        ? `<span class="entry-field__label entry-field__label--sort">
            <span class="entry-field__label-text">День</span>
            <button class="journal-sort-inline" type="button" data-journal-action="toggle-section-sort" data-section-sort-btn="${section}" aria-label="${sortLabel}" aria-pressed="false" title="${sortTitle}">
              <span class="journal-sort-inline__icon">${sortIcon}</span>
            </button>
          </span>`
        : `<span class="entry-field__label">День</span>`;

    return `
      <article class="entry-row entry-row--${section}" data-entry-id="${transaction.id}" data-section="${section}" draggable="true">
        <label class="entry-field entry-field--day">
          ${dayLabel}
          <div class="entry-field__control entry-day-control">
            <input data-journal-field="day" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="2" aria-label="День месяца" value="${day}">
            <button class="entry-day-picker entry-control-affix" type="button" data-journal-action="pick-day" data-id="${transaction.id}" aria-label="Выбрать дату" title="Выбрать дату">
              ${Utils.icon("calendar")}
            </button>
          </div>
        </label>

        <label class="entry-field entry-field--amount">
          <span class="entry-field__label">Сумма</span>
          <div class="entry-field__control entry-amount-control">
            <input data-journal-field="amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${transaction.amount ? transaction.amount : ""}" placeholder="0">
            <button class="entry-amount-keypad entry-control-affix" type="button" data-journal-action="open-amount-keypad" data-id="${transaction.id}" data-numpad-field="amount" aria-label="Открыть цифровой блок для суммы" title="Открыть цифровой блок для суммы">
              ${Utils.icon("dialpad")}
            </button>
          </div>
        </label>

        <label class="entry-field entry-field--desc">
          <span class="entry-field__label">Описание</span>
          <div class="entry-field__control entry-field__control--textarea">
            <textarea
            class="compact-textarea"
            data-journal-field="description"
            data-compact="true"
            data-compact-limit="62"
            data-expanded-rows="4"
            data-fixed-height="true"
            data-fulltext="${Utils.escapeHtml(fullDescription)}"
            rows="1"
            placeholder="Опишите операцию"
            title="${Utils.escapeHtml(fullDescription)}"
            >${Utils.escapeHtml(previewDescription)}</textarea>
          </div>
        </label>

        <label class="entry-field entry-field--category">
          <span class="entry-field__label">Категория</span>
          <div class="entry-field__control entry-field__control--category${limitStateClass}"${limitStateStyle} title="${Utils.escapeHtml(limitTitle)}">
            ${isDebtSection
              ? `<div class="category-trigger category-trigger--static" title="${Utils.escapeHtml(category?.name || "Долги")}">
                  <span class="category-trigger__swatch" style="background:${category?.color || "#ff7b72"}"></span>
                  <span class="category-trigger__label">${Utils.escapeHtml(category?.name || "Долги")}</span>
                </div>`
              : `<button
                  class="category-trigger"
                  type="button"
                  data-journal-action="open-category-picker"
                  data-id="${transaction.id}"
                  aria-label="Выбрать категорию"
                  aria-haspopup="dialog"
                  title="${Utils.escapeHtml(category?.name || "Без категории")}"
                >
                  <span class="category-trigger__swatch" style="background:${category?.color || "#8b949e"}"></span>
                  <span class="category-trigger__label">${Utils.escapeHtml(category?.name || "Без категории")}</span>
                </button>`}
          </div>
        </label>

        <div class="entry-field entry-field--actions entry-actions">
          <span class="entry-field__label entry-field__label--ghost" aria-hidden="true">Действия</span>
          <div class="entry-field__control entry-field__control--actions">
            <div class="entry-actions__buttons">
            ${templateMeta ? `<button class="icon-btn icon-btn--tiny icon-btn--row${templateState}" type="button" data-journal-action="template" data-template-bucket="${templateBucket}" data-id="${transaction.id}" aria-label="${templateState ? templateMeta.removeLabel : templateMeta.addLabel}" title="${templateState ? templateMeta.removeLabel : templateMeta.addLabel}">${Utils.icon("bookmark")}</button>` : ""}
            ${section === "expenses" ? `<button class="icon-btn icon-btn--tiny icon-btn--row${favoriteState}" type="button" data-journal-action="favorite" data-id="${transaction.id}" aria-label="${favoriteState ? "Убрать из избранного" : "Добавить в избранное"}" title="${favoriteState ? "Убрать из избранного" : "Добавить в избранное"}">${Utils.icon("star")}</button>` : ""}
            <button class="icon-btn icon-btn--tiny icon-btn--row" type="button" data-journal-action="move-month" data-id="${transaction.id}" aria-label="Перенести в другой месяц" title="Перенести в другой месяц">${Utils.icon("calendarMove")}</button>
            <button class="icon-btn icon-btn--tiny icon-btn--row" type="button" data-journal-action="delete" data-id="${transaction.id}" aria-label="Удалить">${Utils.icon("close")}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  renderWishlistRow(item) {
    const fullDescription = item.desc || "";
    const previewDescription = Utils.truncateSingleLine(fullDescription, 54);
    return `
      <article class="entry-row entry-row--wishlist" data-entry-id="${item.id}" data-section="wishlist" draggable="true">
        <label class="entry-field entry-field--desc">
          <span class="entry-field__label">Цель</span>
          <div class="entry-field__control entry-field__control--textarea">
            <textarea
            class="compact-textarea"
            data-journal-field="wish-desc"
            data-compact="true"
            data-compact-limit="54"
            data-expanded-rows="3"
            data-fixed-height="true"
            data-fulltext="${Utils.escapeHtml(fullDescription)}"
            rows="1"
            placeholder="Название хотелки"
            title="${Utils.escapeHtml(fullDescription)}"
            >${Utils.escapeHtml(previewDescription)}</textarea>
          </div>
        </label>

        <label class="entry-field entry-field--amount">
          <span class="entry-field__label">Цена</span>
          <div class="entry-field__control entry-amount-control">
            <input data-journal-field="wish-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${item.amount ? item.amount : ""}" placeholder="0">
            <button class="entry-amount-keypad entry-control-affix" type="button" data-journal-action="open-amount-keypad" data-id="${item.id}" data-numpad-field="wish-amount" aria-label="Открыть цифровой блок для цены" title="Открыть цифровой блок для цены">
              ${Utils.icon("dialpad")}
            </button>
          </div>
        </label>

        <div class="entry-field entry-field--actions entry-actions">
          <span class="entry-field__label entry-field__label--ghost" aria-hidden="true">Действия</span>
          <div class="entry-field__control entry-field__control--actions">
            <div class="entry-actions__buttons">
            <button class="icon-btn icon-btn--tiny icon-btn--row icon-btn--buy" type="button" data-journal-action="fulfill-wish" data-id="${item.id}" aria-label="Купить">${Utils.icon("cart")}</button>
            <button class="icon-btn icon-btn--tiny icon-btn--row" type="button" data-journal-action="delete-wish" data-id="${item.id}" aria-label="Удалить">${Utils.icon("close")}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  renderQuickSettings() {
    const root = Utils.$("manageQuickList");
    const title = Utils.$("settingsQuickTitle");
    const createButton = Utils.$("settingsQuickCreateBtn");
    const statsRoot = Utils.$("settingsQuickStats");
    const recurringSwitch = Utils.$("settingsQuickTemplatesBtn");
    const incomeSwitch = Utils.$("settingsQuickIncomeBtn");
    const debtSwitch = Utils.$("settingsQuickDebtBtn");
    const favoriteSwitch = Utils.$("settingsQuickFavoritesBtn");
    const switchRoot = document.querySelector(".settings-quick-switch");
    if (root) {
      const mode = normalizeSettingsQuickMode(this.settingsQuickMode);
      this.settingsQuickMode = mode;
      const templateBucket = getQuickTemplateBucket(mode);
      const templateMeta = templateBucket ? getTemplateBucketMeta(templateBucket) : null;
      const isFavorite = mode === "favorite";
      const items = isFavorite
        ? Store.sortQuickItems(Store.data.settings.favorites)
        : Store.getTemplatesByBucket(templateBucket);
      const titleText = isFavorite ? "Избранные покупки" : templateMeta.title;
      const createText = isFavorite ? "Новая избранная покупка" : templateMeta.createText;
      const setSwitchState = (button, isActive, label) => {
        if (!button) {
          return;
        }
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-controls", "manageQuickList");
      };
      if (switchRoot) {
        switchRoot.setAttribute("role", "group");
        switchRoot.setAttribute("aria-describedby", "settingsQuickStatus");
      }

      if (title) {
        title.textContent = titleText;
      }
      if (createButton) {
        createButton.textContent = createText;
        createButton.setAttribute("aria-controls", "manageQuickList");
        createButton.setAttribute("aria-describedby", "settingsQuickStatus");
        createButton.setAttribute("aria-label", createText);
      }
      setSwitchState(recurringSwitch, mode === "template-recurring", "Открыть шаблоны регулярных платежей");
      setSwitchState(incomeSwitch, mode === "template-income", "Открыть шаблоны доходов");
      setSwitchState(debtSwitch, mode === "template-debt", "Открыть шаблоны долговых обязательств");
      setSwitchState(favoriteSwitch, isFavorite, "Открыть избранные покупки");

      if (statsRoot) {
        const categoriesUsed = new Set(items.map((item) => item.categoryId).filter(Boolean)).size;
        const readyCount = items.filter((item) => Store.getCategory(item.categoryId)).length;
        const modeSpecific = isFavorite
          ? items.filter((item) => Utils.parseAmount(item.amount) > 0).length
          : readyCount;
        const modeSpecificLabel = isFavorite ? "С суммой" : "Готово";
        const averageAmount = items.length
          ? Utils.formatMoney(items.reduce((sum, item) => sum + Utils.parseAmount(item.amount), 0) / items.length)
          : "0 ₽";
        statsRoot.innerHTML = `
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">Всего</span>
            <strong class="settings-mini-stat__value">${items.length}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">Средняя сумма</span>
            <strong class="settings-mini-stat__value">${averageAmount}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">${modeSpecificLabel}</span>
            <strong class="settings-mini-stat__value">${modeSpecific}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">Категорий</span>
            <strong class="settings-mini-stat__value">${categoriesUsed}</strong>
          </article>
        `;
      }

      root.setAttribute("role", "list");
      root.setAttribute("aria-labelledby", "settingsQuickTitle");
      root.setAttribute("aria-describedby", "settingsQuickStatus");
      root.scrollTop = 0;
      root.scrollLeft = 0;

      const editAction = mode === "favorite" ? "edit-favorite" : "edit-template";
      const deleteAction = mode === "favorite" ? "delete-favorite" : "delete-template";
      const categoryAction = mode === "favorite" ? "pick-favorite-category" : "pick-template-category";
      const emptyText = mode === "favorite"
        ? "Сохраните сюда покупки, которые хочется добавлять в бюджет в один клик."
        : (templateMeta?.emptyText || "Сохраните здесь повторяющиеся сценарии, чтобы не вводить их заново.");

      root.innerHTML = items.length
        ? items.map((item) => {
          const category = Store.getCategory(item.categoryId);
          const metaType = mode === "favorite"
            ? "Избранная покупка"
            : getTemplateBucketMeta(item.bucket, item.type, item.flowKind).itemLabel;
          return `
          <article class="quick-card${mode === "favorite" ? " quick-card--favorite" : ""}" data-item-id="${item.id}" data-kind="${mode}" role="listitem">
            <div class="quick-card__top">
              <div class="quick-card__main">
                <span class="quick-card__swatch" style="background:${category?.color || "#8b949e"}"></span>
                <div class="quick-card__body">
                  <strong title="${Utils.escapeHtml(item.desc || "Без названия")}">${Utils.escapeHtml(item.desc || "Без названия")}</strong>
                  <div class="transaction-card__meta">
                    <span>${Utils.formatMoney(item.amount)}</span>
                    <span>${Utils.escapeHtml(category?.name || "Без категории")}</span>
                    <span>${metaType}</span>
                  </div>
                </div>
              </div>
              <div class="quick-card__actions">
                <button class="chip-btn" type="button" data-setting-action="${categoryAction}" data-id="${item.id}" data-mode="${mode}">Категория</button>
                <button class="chip-btn" type="button" data-setting-action="${editAction}" data-id="${item.id}" data-mode="${mode}">Редактировать</button>
                <button class="chip-btn" type="button" data-setting-action="${deleteAction}" data-id="${item.id}" data-mode="${mode}">Удалить</button>
              </div>
            </div>
          </article>
        `;
        }).join("")
        : `<div class="empty-state empty-state--compact" role="status">${emptyText}</div>`;
      this.resetSettingsQuickScroll?.(root);
        this.scheduleSettingsQuickScrollReset?.([0, 1, 3, 5, 8]);
    }

    const exportBtn = Utils.$("exportBtn");
    const importBtn = Utils.$("importBtn");
    const backupNote = Utils.$("backupNote");
    const exportHelp = "Сохраняет свежую резервную копию бюджета. Удобно для переноса на другое устройство и спокойного восстановления в любой момент.";
    const importHelp = "Загружает резервную копию и аккуратно заменяет текущие данные содержимым файла. Подходит для переноса и восстановления архива.";
    Utils.setHelpText(exportBtn, exportHelp);
    Utils.setHelpText(importBtn, importHelp);
    Utils.setHelpText(backupNote, "Поддерживаются и резервные копии из прошлых версий приложения, если структура данных совместима.");
    App.runAfterNextPaint(() => {
      if (Store.activeTab !== "settingsTab") {
        return;
      }
      this.syncSettingsLayout();
        this.scheduleSettingsQuickScrollReset?.([0, 1, 3, 5, 8]);
    }, 2);

  },

  syncSettingsLayout() {
    const tab = Utils.$("settingsTab");
    const layout = tab?.querySelector?.(".settings-layout");
    const categoriesPanel = layout?.querySelector?.(".settings-panel--categories");
    const backupPanel = layout?.querySelector?.(".settings-panel--backup");
    const quickPanel = layout?.querySelector?.(".settings-panel--quick");
    if (!layout || !categoriesPanel || !backupPanel || !quickPanel) {
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches) {
      layout.style.removeProperty("grid-template-rows");
      categoriesPanel.style.removeProperty("height");
      categoriesPanel.style.removeProperty("min-height");
      categoriesPanel.style.removeProperty("max-height");
      quickPanel.style.removeProperty("height");
      quickPanel.style.removeProperty("min-height");
      quickPanel.style.removeProperty("max-height");
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1280px)").matches) {
      const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
      const stackedCategoryHeight = Math.max(320, Math.min(Math.round(viewportHeight * 0.5), 520));
      const stackedQuickHeight = Math.max(400, Math.min(Math.round(viewportHeight * 0.62), 620));
      layout.style.removeProperty("grid-template-rows");
      categoriesPanel.style.setProperty("height", `${stackedCategoryHeight}px`, "important");
      categoriesPanel.style.setProperty("min-height", `${stackedCategoryHeight}px`, "important");
      categoriesPanel.style.setProperty("max-height", `${stackedCategoryHeight}px`, "important");
      quickPanel.style.setProperty("height", `${stackedQuickHeight}px`, "important");
      quickPanel.style.setProperty("min-height", `${stackedQuickHeight}px`, "important");
      quickPanel.style.setProperty("max-height", `${stackedQuickHeight}px`, "important");
      return;
    }

    const layoutStyles = getComputedStyle(layout);
    const rowGap = parseFloat(layoutStyles.rowGap || layoutStyles.gap || "0") || 0;
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
    const targetCategoriesHeight = viewportHeight <= 860
      ? Math.max(470, Math.min(Math.round(viewportHeight * 0.64), 560))
      : Math.max(460, Math.min(Math.round(viewportHeight * 0.58), 620));
    categoriesPanel.style.setProperty("height", `${targetCategoriesHeight}px`, "important");
    categoriesPanel.style.setProperty("min-height", `${targetCategoriesHeight}px`, "important");
    categoriesPanel.style.setProperty("max-height", `${targetCategoriesHeight}px`, "important");
    const categoriesHeight = targetCategoriesHeight;
    const backupHeight = Math.max(0, backupPanel.getBoundingClientRect().height);
    if (!categoriesHeight || !backupHeight) {
      return;
    }

    const quickHeight = categoriesHeight + backupHeight + rowGap;
    layout.style.setProperty("grid-template-rows", `${categoriesHeight}px ${backupHeight}px`, "important");
    quickPanel.style.setProperty("height", `${quickHeight}px`, "important");
    quickPanel.style.setProperty("min-height", `${quickHeight}px`, "important");
    quickPanel.style.setProperty("max-height", `${quickHeight}px`, "important");
  },

  renderTransactions() {
    const root = Utils.$("transactionsList");
    if (!root) {
      return;
    }

    const searchInput = Utils.$("searchInput");
    const filterPeriod = Utils.$("filterPeriod");
    const filterType = Utils.$("filterType");
    const sortSelect = Utils.$("sortSelect");
    const filterDateFrom = Utils.$("filterDateFrom");
    const filterDateTo = Utils.$("filterDateTo");
    if (searchInput) searchInput.value = Store.filters.search || "";
    if (filterPeriod) filterPeriod.value = Store.filters.period || "month";
    if (filterType) filterType.value = Store.filters.type || "all";
    if (sortSelect) sortSelect.value = Store.filters.sort || "date-desc";
    if (filterDateFrom) filterDateFrom.value = Store.filters.dateFrom || "";
    if (filterDateTo) filterDateTo.value = Store.filters.dateTo || "";

    const hasActiveFilters = Boolean(
      Store.filters.search ||
      Store.filters.categoryId !== "all" ||
      Store.filters.type !== "all" ||
      Store.filters.period !== "month" ||
      Store.filters.sort !== "date-desc" ||
      Store.filters.dateFrom ||
      Store.filters.dateTo
    );

    const transactions = Store.getFilteredTransactions();
    const totals = Store.totalsFor(transactions);
    const listSummary = Utils.$("listSummary");
    if (listSummary) {
      listSummary.textContent = hasActiveFilters
        ? transactions.length
          ? `${transactions.length} операций · ${Utils.formatMoney(totals.balance)} · ${Store.filters.period === "all" ? "вся история" : "активный месяц"}`
          : "Нет операций под текущие фильтры"
        : "Фильтры выключены. Ниже показан весь бюджет месяца по разделам.";
    }

    root.classList.toggle("is-hidden", !hasActiveFilters);
    if (!hasActiveFilters) {
      root.dataset.renderSignature = "hidden";
      root.replaceChildren();
      return;
    }

    const signature = JSON.stringify({
      filters: {
        search: Store.filters.search || "",
        categoryId: Store.filters.categoryId || "all",
        type: Store.filters.type || "all",
        period: Store.filters.period || "month",
        sort: Store.filters.sort || "date-desc",
        dateFrom: Store.filters.dateFrom || "",
        dateTo: Store.filters.dateTo || ""
      },
      ids: transactions.map((transaction) => `${transaction.id}:${transaction.updatedAt || ""}`)
    });

    if (!transactions.length) {
      root.dataset.renderSignature = `${signature}:empty`;
      root.replaceChildren(Utils.createElement("div", "empty-state", "По этим фильтрам пока пусто. Измените условия или добавьте новую операцию."));
      return;
    }

    if (root.dataset.renderSignature === signature) {
      return;
    }
    root.dataset.renderSignature = signature;

    // Здесь принципиально не используем innerHTML для пользовательских данных:
    // Описание, категория и дата попадают в DOM только через textContent.
    const fragment = document.createDocumentFragment();
    transactions.forEach((transaction) => {
      const category = Store.getCategory(transaction.categoryId);
      const amountClass = transaction.type === "income" ? "amount-positive" : "amount-negative";
      const flowLabel = transaction.type === "income"
        ? "Доход"
        : transaction.flowKind === "debt"
          ? "Долг / кредит"
          : transaction.flowKind === "recurring"
            ? "Регулярный платеж"
            : "Расход";

      const card = Utils.createElement("article", "transaction-card");
      card.title = transaction.description || flowLabel;

      const main = Utils.createElement("div");
      const title = Utils.createElement("strong", "", transaction.description || flowLabel);
      title.title = transaction.description || flowLabel;
      const meta = Utils.createElement("div", "transaction-card__meta");
      meta.append(
        Utils.createElement("span", "", Utils.formatDate(transaction.date)),
        Utils.createElement("span", "", flowLabel),
        Utils.createElement("span", "", Utils.timeSince(transaction.updatedAt))
      );
      main.append(title, meta);

      const categoryPill = Utils.createElement("div", "category-pill");
      const categoryDot = Utils.createElement("span", "category-pill__dot");
      categoryDot.style.background = category?.color || "#8b949e";
      categoryPill.append(categoryDot, Utils.createElement("span", "", category?.name || "Без категории"));

      const amount = Utils.createElement("strong", amountClass, `${transaction.type === "income" ? "+" : "-"}${Utils.formatMoney(transaction.amount)}`);

      const actions = Utils.createElement("div", "transaction-card__actions");
      const editButton = Utils.createElement("button", "chip-btn", "Показать в бюджете");
      editButton.type = "button";
      editButton.dataset.action = "focus-transaction";
      editButton.dataset.id = transaction.id;
      const deleteButton = Utils.createElement("button", "chip-btn", "Удалить");
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-transaction";
      deleteButton.dataset.id = transaction.id;
      actions.append(editButton, deleteButton);

      card.append(main, categoryPill, amount, actions);
      fragment.appendChild(card);
    });

    root.replaceChildren(fragment);
  },

  renderCategories() {
    const root = Utils.$("categoriesEditor");
    const statsRoot = Utils.$("settingsCategoryStats");
    const categories = Store.getCategories();
    if (statsRoot) {
      const expenseCount = categories.filter((category) => category.type === "expense").length;
      const incomeCount = categories.length - expenseCount;
      const limitedCount = categories.filter((category) => Utils.parseAmount(category.limit) > 0).length;
      statsRoot.innerHTML = `
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Всего</span>
          <strong class="settings-mini-stat__value">${categories.length}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Расходы</span>
          <strong class="settings-mini-stat__value">${expenseCount}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Доходы</span>
          <strong class="settings-mini-stat__value">${incomeCount}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">С лимитом</span>
          <strong class="settings-mini-stat__value">${limitedCount}</strong>
        </article>
      `;
    }
    if (!root) {
      return;
    }
    root.innerHTML = categories.map((category) => `
      <article class="category-item">
        <div class="category-item__top">
          <div class="category-item__main">
            <span class="category-item__swatch" style="background:${category.color}"></span>
            <div>
              <strong>${Utils.escapeHtml(category.name)}</strong>
              <div class="transaction-card__meta">
                <span>${category.type === "income" ? "Доход" : "Расход"}</span>
                <span>${category.limit ? `Лимит: ${Utils.formatMoney(category.limit)}` : "Лимит не задан"}</span>
                <span>${category.preset ? "Встроенная" : "Пользовательская"}</span>
              </div>
            </div>
          </div>
          <div class="category-item__actions">
            <button class="chip-btn" type="button" data-action="edit-category" data-id="${category.id}">Редактировать</button>
            <button class="chip-btn" type="button" data-action="delete-category" data-id="${category.id}">Удалить</button>
          </div>
        </div>
      </article>
    `).join("");
  },
});
