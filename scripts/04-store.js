const Store = {
  data: defaultData(),
  remoteRevision: 0,
  searchIndex: new Map(),
  activeTab: "overviewTab",
  viewMonth: Utils.monthKey(new Date()),
  detailMonth: Utils.monthKey(new Date()),
  historyPast: [],
  historyFuture: [],
  historyLimit: 80,
  derivedCache: {
    monthTransactions: new Map(),
    statsForMonth: new Map(),
    monthlySeries: new Map(),
    expenseBreakdown: new Map(),
    heatmapDays: new Map(),
    budgetLimitProgress: new Map(),
    recurringCandidates: null,
    forecast: new Map(),
    paymentCalendar: new Map()
  },
  filters: {
    period: "month",
    type: "all",
    categoryId: "all",
    search: "",
    sort: "date-desc",
    dateFrom: "",
    dateTo: ""
  },

  loadLocal(login = null) {
    this.data = Storage.loadCache(login);
    this.remoteRevision = login ? Storage.loadRevision(login) : 0;
    this.ensureStructure();
  },

  resetDerivedCaches() {
    this.derivedCache.monthTransactions = new Map();
    this.derivedCache.statsForMonth = new Map();
    this.derivedCache.monthlySeries = new Map();
    this.derivedCache.expenseBreakdown = new Map();
    this.derivedCache.heatmapDays = new Map();
    this.derivedCache.budgetLimitProgress = new Map();
    this.derivedCache.recurringCandidates = null;
    this.derivedCache.forecast = new Map();
    this.derivedCache.paymentCalendar = new Map();
  },

  ensureStructure() {
    this.data = normalizeData(this.data);
    const expFun = this.data.settings.categories.find((item) => item.id === "exp_fun");
    if (expFun && Utils.normalizeLookupKey(expFun.name) === Utils.normalizeLookupKey("Досуг")) {
      expFun.name = "Развлечения";
    }
    const debtCategoryId = this.getDefaultCategoryId("debts");
    this.data.transactions.forEach((transaction) => {
      if (transaction.type === "expense" && transaction.flowKind === "debt" && transaction.categoryId !== debtCategoryId) {
        transaction.categoryId = debtCategoryId;
      }
    });
    this.getMonthKeys().forEach((monthKey) => ensureDefaultMonthMeta(this.data.months, monthKey));
    this.resetDerivedCaches();
    this.rebuildSearchIndex();
  },

  saveLocal() {
    return Storage.saveCache(Auth.getLogin(), this.data);
  },

  setData(nextData, { save = true } = {}) {
    this.data = normalizeData(nextData);
    this.resetDerivedCaches();
    this.rebuildSearchIndex();
    if (save) {
      this.saveLocal();
    }
  },

  rebuildSearchIndex() {
    // Поиск строится один раз на актуальных данных, чтобы не склеивать
    // длинные строки заново при каждом вводе символа в поиске.
    const categories = new Map(this.data.settings.categories.map((item) => [item.id, item.name || ""]));
    const nextIndex = new Map();
    this.data.transactions.forEach((transaction) => {
      const amount = Utils.roundMoney(Utils.safeNumber(transaction.amount));
      const amountText = String(amount);
      const amountIntegerText = String(Math.trunc(amount));
      const amountFixedText = amount.toFixed(2);
      const amountCommaText = amountText.replace(".", ",");
      const textSource = [
        transaction.description || "",
        categories.get(transaction.categoryId) || ""
      ].join(" ");
      const textTokens = textSource
        .toLowerCase()
        .replace(/\u0451/g, "\u0435")
        .split(/[^a-z\u0430-\u044f0-9]+/gi)
        .map((item) => Utils.normalizeLookupKey(item))
        .filter(Boolean);
      nextIndex.set(transaction.id, {
        textFields: [
          Utils.normalizeLookupKey(transaction.description || ""),
          Utils.normalizeLookupKey(categories.get(transaction.categoryId) || "")
        ].filter(Boolean),
        textTokens,
        amount,
        amountIntegerText: Utils.normalizeLookupKey(amountIntegerText),
        amountFields: Array.from(new Set([
          amountText,
          amountIntegerText,
          amountFixedText,
          amountCommaText,
          amountFixedText.replace(".", ","),
          Utils.formatMoney(amount)
        ].map((item) => Utils.normalizeLookupKey(item)).filter(Boolean)))
      });
    });
    this.searchIndex = nextIndex;
  },

  parseSearchAmount(rawSearch) {
    const raw = String(rawSearch || "").trim();
    if (!raw || /[a-z\u0430-\u044f]/i.test(raw.replace(/руб(?:\.|лей|ля|ль)?/giu, ""))) {
      return null;
    }
    const compact = raw
      .replace(/\s+/g, "")
      .replace(/₽/g, "")
      .replace(/руб(?:\.|лей|ля|ль)?/giu, "")
      .replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(compact)) {
      return null;
    }
    return Utils.roundMoney(Number(compact));
  },

  getSearchMatch(transaction, rawSearch, normalizedSearch = Utils.normalizeLookupKey(rawSearch)) {
    if (!normalizedSearch) {
      return { matched: true, score: 0 };
    }

    const entry = this.searchIndex.get(transaction.id);
    if (!entry) {
      return { matched: false, score: 0 };
    }

    const amountQuery = this.parseSearchAmount(rawSearch);
    if (amountQuery !== null) {
      const hasDecimalQuery = /[,.]\d/.test(String(rawSearch || ""));
      const amountMatched = hasDecimalQuery
        ? Math.abs(entry.amount - amountQuery) < 0.001
        : Number(entry.amountIntegerText) === amountQuery;
      const textMatched = entry.textTokens.includes(normalizedSearch);
      return {
        matched: amountMatched || textMatched,
        score: amountMatched ? 100 : (textMatched ? 70 : 0)
      };
    }

    const textScore = entry.textFields.some((field) => field.includes(normalizedSearch)) ? 80 : 0;
    const amountScore = entry.amountFields.some((field) => field.includes(normalizedSearch)) ? 60 : 0;
    const score = Math.max(textScore, amountScore);
    return {
      matched: score > 0,
      score
    };
  },

  captureSnapshot() {
    return {
      // Store.data заменяется целиком при mutate/setData, поэтому ссылка на предыдущее
      // состояние остается неизменной и не требует второго полного клонирования.
      data: this.data,
      activeTab: this.activeTab,
      viewMonth: this.viewMonth,
      detailMonth: this.detailMonth
    };
  },

  pushHistory(snapshot) {
    this.historyPast.push(snapshot);
    const effectiveLimit = this.data.transactions.length > 1000 ? 20 : this.historyLimit;
    if (this.historyPast.length > effectiveLimit) {
      this.historyPast.shift();
    }
    this.historyFuture = [];
  },

  commitHistorySnapshot(snapshot) {
    if (!snapshot || comparableDataSignature(snapshot.data) === comparableDataSignature(this.data)) {
      return false;
    }
    this.pushHistory(snapshot);
    return true;
  },

  resetHistory() {
    this.historyPast = [];
    this.historyFuture = [];
  },

  canUndo() {
    return this.historyPast.length > 0;
  },

  canRedo() {
    return this.historyFuture.length > 0;
  },

  restoreSnapshot(snapshot, { queueSync = true } = {}) {
    if (!snapshot) {
      return false;
    }
    this.activeTab = snapshot.activeTab || this.activeTab;
    this.viewMonth = snapshot.viewMonth || this.viewMonth;
    this.detailMonth = snapshot.detailMonth || this.viewMonth;
    this.setData(snapshot.data, { save: true });
    if (Auth.isAuthenticated() && queueSync) {
      Sync.queueSync();
    }
    UI.renderDataState();
    return true;
  },

  undo() {
    if (!this.canUndo()) {
      return false;
    }
    const previous = this.historyPast.pop();
    this.historyFuture.push(this.captureSnapshot());
    return this.restoreSnapshot(previous, { queueSync: Auth.isAuthenticated() });
  },

  redo() {
    if (!this.canRedo()) {
      return false;
    }
    const next = this.historyFuture.pop();
    this.historyPast.push(this.captureSnapshot());
    return this.restoreSnapshot(next, { queueSync: Auth.isAuthenticated() });
  },

  mutate(mutator, { queueSync = true, render = true, recordHistory = true } = {}) {
    const before = this.captureSnapshot();
    const draft = Utils.clone(this.data);
    mutator(draft);
    draft.meta.updatedAt = Utils.nowISO();
    const next = normalizeData(draft);
    const changed = comparableDataSignature(next) !== comparableDataSignature(before.data);
    this.data = next;
    this.resetDerivedCaches();
    this.rebuildSearchIndex();
    this.saveLocal();
    if (changed && recordHistory) {
      this.pushHistory(before);
    }
    if (Auth.isAuthenticated() && queueSync) {
      Sync.queueSync();
    }
    if (render) {
      UI.renderDataState();
    }
    return changed;
  },

  getMonthKeys() {
    const keys = new Set(Object.keys(this.data.months || {}));
    this.data.transactions.forEach((transaction) => keys.add(transaction.date.slice(0, 7)));
    return Array.from(keys).sort().reverse();
  },

  getCategories(type = "all") {
    return this.data.settings.categories.filter((category) => type === "all" || category.type === type);
  },

  getCategory(categoryId) {
    return findCategory(this.data.settings.categories, categoryId);
  },

  getTransactions(period = "all", monthKey = this.viewMonth) {
    if (period === "month") {
      const cacheKey = String(monthKey || this.viewMonth);
      if (this.derivedCache.monthTransactions.has(cacheKey)) {
        return this.derivedCache.monthTransactions.get(cacheKey);
      }
      const scoped = this.data.transactions.filter((transaction) => transaction.date.startsWith(cacheKey));
      this.derivedCache.monthTransactions.set(cacheKey, scoped);
      return scoped;
    }
    return this.data.transactions.slice();
  },

  compareTransactionsByPosition(a, b) {
    return Number(a?.position || 0) - Number(b?.position || 0);
  },

  matchesSectionTransaction(transaction, section) {
    if (!transaction) {
      return false;
    }
    if (section === "incomes") {
      return transaction.type === "income";
    }
    if (transaction.type !== "expense") {
      return false;
    }
    if (section === "debts") {
      return transaction.flowKind === "debt";
    }
    if (section === "recurring") {
      return transaction.flowKind === "recurring";
    }
    return transaction.flowKind === "standard";
  },

  getDraftSectionTransactions(draft, section, monthKey = this.viewMonth) {
    const monthPrefix = `${monthKey}-`;
    return draft.transactions
      .filter((item) => item.date.startsWith(monthPrefix) && this.matchesSectionTransaction(item, section))
      .sort((a, b) => this.compareTransactionsByPosition(a, b));
  },

  getCategoryPoolForSection(section) {
    const meta = SECTION_META[section];
    if (!meta) {
      return [];
    }
    return this.getCategories(meta.type === "income" ? "income" : "expense");
  },

  getSectionTransactions(section, monthKey = this.viewMonth) {
    if (section === "wishlist") {
      return this.data.settings.wishlist.slice().sort((a, b) => this.compareTransactionsByPosition(a, b));
    }
    return this.getTransactions("month", monthKey)
      .slice()
      .sort((a, b) => this.compareTransactionsByPosition(a, b))
      .filter((transaction) => this.matchesSectionTransaction(transaction, section));
  },

  getRecurringCategoryId() {
    const preferredNames = ["ЖКХ+Моб + Инет", "Подписки и услуги"];
    for (const name of preferredNames) {
      const existing = this.getCategories("expense").find((category) => Utils.normalizeLookupKey(category.name) === Utils.normalizeLookupKey(name));
      if (existing) {
        return existing.id;
      }
    }
    return "exp_subscription";
  },

  getDefaultCategoryId(section) {
    if (section === "recurring") {
      return this.getRecurringCategoryId();
    }
    const meta = SECTION_META[section];
    if (!meta) {
      return "exp_other";
    }
    const pool = this.getCategoryPoolForSection(section);
    const direct = pool.find((category) => category.id === meta.defaultCategoryId);
    if (direct) {
      return direct.id;
    }
    return pool[0]?.id || (meta.type === "income" ? "inc_other" : "exp_other");
  },

  getPreferredCategoryIdForSection(section, monthKey = this.viewMonth) {
    if (section === "debts") {
      return this.getDefaultCategoryId("debts");
    }
    const last = this.getSectionTransactions(section, monthKey)
      .slice()
      .sort((a, b) =>
        Number(a.position) - Number(b.position) ||
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      )
      .at(-1);
    if (last?.categoryId && this.getCategory(last.categoryId)) {
      return last.categoryId;
    }
    return this.getDefaultCategoryId(section);
  },

  getMonthMeta(monthKey = this.viewMonth, ensure = true) {
    if (ensure) {
      ensureDefaultMonthMeta(this.data.months, monthKey);
      return this.data.months[monthKey];
    }
    return this.data.months[monthKey] || normalizeMonthMeta();
  },

  saveMonthMeta(monthKey, patch = {}, options = {}) {
    return this.mutate((draft) => {
      ensureDefaultMonthMeta(draft.months, monthKey);
      draft.months[monthKey] = {
        ...draft.months[monthKey],
        ...patch,
        start: Utils.roundMoney(Utils.safeNumber(patch.start ?? draft.months[monthKey].start)),
        manualStart: Boolean(patch.manualStart ?? draft.months[monthKey].manualStart),
        updatedAt: Utils.nowISO()
      };
    }, options);
  },

  getFilteredTransactions() {
    const rawSearch = String(this.filters.search || "");
    const search = Utils.normalizeLookupKey(rawSearch);
    const period = this.filters.period === "all" ? "all" : "month";
    const searchScores = new Map();
    const list = this.getTransactions(period, this.viewMonth).filter((transaction) => {
      if (this.filters.type !== "all" && transaction.type !== this.filters.type) {
        return false;
      }
      if (this.filters.categoryId !== "all" && transaction.categoryId !== this.filters.categoryId) {
        return false;
      }
      if (this.filters.dateFrom && transaction.date < this.filters.dateFrom) {
        return false;
      }
      if (this.filters.dateTo && transaction.date > this.filters.dateTo) {
        return false;
      }
      if (!search) {
        return true;
      }
      const match = this.getSearchMatch(transaction, rawSearch, search);
      if (match.matched) {
        searchScores.set(transaction.id, match.score);
      }
      return match.matched;
    });

    const sortMap = {
      "date-desc": (a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`),
      "date-asc": (a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`),
      "amount-desc": (a, b) => b.amount - a.amount,
      "amount-asc": (a, b) => a.amount - b.amount
    };

    const sortTransactions = sortMap[this.filters.sort] || sortMap["date-desc"];
    return list.sort((a, b) => {
      if (search) {
        const scoreDelta = (searchScores.get(b.id) || 0) - (searchScores.get(a.id) || 0);
        if (scoreDelta) {
          return scoreDelta;
        }
      }
      return sortTransactions(a, b);
    });
  },

  totalsFor(transactions) {
    return transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === "income") {
          acc.income = Utils.roundMoney(acc.income + transaction.amount);
        } else {
          acc.expense = Utils.roundMoney(acc.expense + transaction.amount);
          if (transaction.flowKind === "recurring") {
            acc.recurring = Utils.roundMoney(acc.recurring + transaction.amount);
          }
          if (transaction.flowKind === "debt") {
            acc.debt = Utils.roundMoney(acc.debt + transaction.amount);
          }
        }
        acc.balance = Utils.roundMoney(acc.income - acc.expense);
        return acc;
      },
      { income: 0, expense: 0, recurring: 0, debt: 0, balance: 0 }
    );
  },

  statsForMonth(monthKey = this.viewMonth, memo = new Map()) {
    const cacheKey = String(monthKey || this.viewMonth);
    if (memo.has(cacheKey)) {
      return memo.get(cacheKey);
    }
    const cached = this.derivedCache.statsForMonth.get(cacheKey);
    if (cached) {
      memo.set(cacheKey, cached);
      return cached;
    }

    const transactions = this.getTransactions("month", cacheKey);
    const totals = this.totalsFor(transactions);
    const expenses = transactions.filter((item) => item.type === "expense");
    const income = transactions.filter((item) => item.type === "income");
    const monthMeta = this.getMonthMeta(cacheKey, false);
    const daysInMonth = new Date(Number(cacheKey.slice(0, 4)), Number(cacheKey.slice(5, 7)), 0).getDate();
    const currentDay = cacheKey === Utils.monthKey(new Date()) ? new Date().getDate() : daysInMonth;
    const topExpense = expenses.slice().sort((a, b) => b.amount - a.amount)[0] || null;
    const topIncome = income.slice().sort((a, b) => b.amount - a.amount)[0] || null;
    const previousMonthKey = this.previousMonthKey(cacheKey);
    const previousDataMonthKey = this.getMonthKeys()
      .filter((item) => item < cacheKey)
      .sort((a, b) => b.localeCompare(a))[0] || null;
    const hasPreviousData = Boolean(previousDataMonthKey);

    let startBalance = Utils.roundMoney(Utils.safeNumber(monthMeta.start));
    // Авто-режим берет остаток прошлого месяца, а ручной режим позволяет пользователю
    // зафиксировать собственную стартовую точку для текущего месяца.
    if (!monthMeta.manualStart && hasPreviousData) {
      startBalance = this.statsForMonth(previousDataMonthKey, memo).finalBalance;
    }

    const trendBuckets = Array.from({ length: daysInMonth }, (_, index) => ({
      day: index + 1,
      income: 0,
      expense: 0,
      delta: 0,
      balance: startBalance
    }));

    transactions.forEach((transaction) => {
      const bucket = trendBuckets[Number(transaction.date.slice(-2)) - 1];
      if (!bucket) {
        return;
      }
      if (transaction.type === "income") {
        bucket.income = Utils.roundMoney(bucket.income + transaction.amount);
        bucket.delta = Utils.roundMoney(bucket.delta + transaction.amount);
      } else {
        bucket.expense = Utils.roundMoney(bucket.expense + transaction.amount);
        bucket.delta = Utils.roundMoney(bucket.delta - transaction.amount);
      }
    });

    let runningBalance = startBalance;
    let minBalance = startBalance;
    let minBalanceDay = 0;
    let maxBalance = startBalance;
    trendBuckets.forEach((bucket) => {
      runningBalance = Utils.roundMoney(runningBalance + bucket.delta);
      bucket.balance = runningBalance;
      if (runningBalance < minBalance) {
        minBalance = runningBalance;
        minBalanceDay = bucket.day;
      }
      if (runningBalance > maxBalance) {
        maxBalance = runningBalance;
      }
    });

    const byCategory = new Map();
    expenses.forEach((transaction) => {
      byCategory.set(transaction.categoryId, Utils.roundMoney((byCategory.get(transaction.categoryId) || 0) + transaction.amount));
    });
    const topCategoryEntry = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0] || null;
    const topCategory = topCategoryEntry ? this.getCategory(topCategoryEntry[0]) : null;
    const savingsRate = totals.income ? ((totals.income - totals.expense) / totals.income) * 100 : 0;
    const burnRateProjection = Utils.roundMoney(currentDay ? (totals.expense / currentDay) * daysInMonth : totals.expense);
    const concentration = totals.expense && topCategoryEntry ? (topCategoryEntry[1] / totals.expense) * 100 : 0;
    const finalBalance = Utils.roundMoney(runningBalance);
    const result = {
      monthKey: cacheKey,
      transactions,
      totals,
      daysInMonth,
      currentDay,
      previousMonthKey,
      startBalance,
      autoStartBalance: !monthMeta.manualStart && hasPreviousData ? startBalance : Utils.roundMoney(Utils.safeNumber(monthMeta.start)),
      manualStart: Boolean(monthMeta.manualStart),
      freeCash: finalBalance,
      finalBalance,
      minBalance,
      minBalanceDay,
      maxBalance,
      trend: trendBuckets,
      operations: transactions.length,
      topExpense,
      topIncome,
      topCategory,
      topCategoryAmount: topCategoryEntry ? Utils.roundMoney(topCategoryEntry[1]) : 0,
      averageExpensePerDay: Utils.roundMoney(totals.expense / daysInMonth),
      averageCheck: Utils.roundMoney(expenses.length ? totals.expense / expenses.length : 0),
      savingsRate,
      burnRateProjection,
      concentration
    };
    memo.set(cacheKey, result);
    this.derivedCache.statsForMonth.set(cacheKey, result);
    return result;
  },

  allTimeStats() {
    return this.totalsFor(this.data.transactions);
  },

  previousMonthKey(monthKey = this.viewMonth) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 2, 1);
    return Utils.monthKey(date);
  },

  monthlySeries(count = 6) {
    const cacheKey = `${this.viewMonth}:${Number(count) || 6}`;
    const cached = this.derivedCache.monthlySeries.get(cacheKey);
    if (cached) {
      return cached;
    }
    const baseDate = new Date(Number(this.viewMonth.slice(0, 4)), Number(this.viewMonth.slice(5, 7)) - 1, 1);
    const series = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - offset, 1);
      const monthKey = Utils.monthKey(date);
      const stats = this.statsForMonth(monthKey);
      series.push({
        monthKey,
        label: Utils.shortMonthLabel(monthKey),
        income: stats.totals.income,
        expense: stats.totals.expense,
        balance: stats.totals.balance
      });
    }
    this.derivedCache.monthlySeries.set(cacheKey, series);
    return series;
  },

  expenseBreakdown(monthKey = this.viewMonth) {
    const cacheKey = String(monthKey || this.viewMonth);
    const cached = this.derivedCache.expenseBreakdown.get(cacheKey);
    if (cached) {
      return cached;
    }
    const map = new Map();
    this.getTransactions("month", cacheKey).forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }
      map.set(transaction.categoryId, Utils.roundMoney((map.get(transaction.categoryId) || 0) + transaction.amount));
    });
    const result = Array.from(map.entries())
      .map(([categoryId, amount]) => ({
        category: this.getCategory(categoryId),
        amount
      }))
      .filter((entry) => entry.category)
      .sort((a, b) => b.amount - a.amount);
    this.derivedCache.expenseBreakdown.set(cacheKey, result);
    return result;
  },

  heatmapDays(monthKey = this.viewMonth) {
    const cacheKey = String(monthKey || this.viewMonth);
    const cached = this.derivedCache.heatmapDays.get(cacheKey);
    if (cached) {
      return cached;
    }
    const [year, month] = cacheKey.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const totals = Array.from({ length: daysInMonth }, (_, index) => ({
      day: index + 1,
      amount: 0
    }));
    this.getTransactions("month", cacheKey).forEach((transaction) => {
      if (transaction.type === "expense") {
        const dayIndex = Number(transaction.date.slice(-2)) - 1;
        if (totals[dayIndex]) {
          totals[dayIndex].amount += transaction.amount;
        }
      }
    });
    this.derivedCache.heatmapDays.set(cacheKey, totals);
    return totals;
  },

  budgetLimitProgress(monthKey = this.viewMonth) {
    const cacheKey = String(monthKey || this.viewMonth);
    const cached = this.derivedCache.budgetLimitProgress.get(cacheKey);
    if (cached) {
      return cached;
    }
    const spentByCategory = new Map();
    this.getTransactions("month", cacheKey).forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }
      spentByCategory.set(
        transaction.categoryId,
        Utils.roundMoney((spentByCategory.get(transaction.categoryId) || 0) + transaction.amount)
      );
    });
    const result = this.getCategories("expense")
      .filter((category) => Utils.parseAmount(category.limit) > 0)
      .map((category) => {
        const limit = Math.max(0, Utils.roundMoney(Utils.parseAmount(category.limit)));
        const spent = Utils.roundMoney(spentByCategory.get(category.id) || 0);
        const usage = limit > 0 ? (spent / limit) * 100 : 0;
        const remaining = Utils.roundMoney(limit - spent);
        return {
          category,
          limit,
          spent,
          remaining,
          overage: remaining < 0 ? Math.abs(remaining) : 0,
          progress: Math.max(0, Math.min(100, usage)),
          usage,
          exceeded: spent > limit
        };
      })
      .sort((a, b) => {
        if (a.exceeded !== b.exceeded) {
          return Number(b.exceeded) - Number(a.exceeded);
        }
        if (Math.abs(a.usage - b.usage) > 0.01) {
          return b.usage - a.usage;
        }
        return b.spent - a.spent;
      });
    this.derivedCache.budgetLimitProgress.set(cacheKey, result);
    return result;
  },

  getQuickItemTimestamp(item) {
    if (!item || typeof item !== "object") {
      return 0;
    }
    const timestamp = new Date(item.updatedAt || item.createdAt || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  },

  sortQuickItems(items) {
    return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const rightStamp = this.getQuickItemTimestamp(right);
      const leftStamp = this.getQuickItemTimestamp(left);
      if (rightStamp !== leftStamp) {
        return rightStamp - leftStamp;
      }
      return String(right?.desc || "").localeCompare(String(left?.desc || ""), "ru-RU");
    });
  },

  recurringCandidates() {
    if (this.derivedCache.recurringCandidates) {
      return this.derivedCache.recurringCandidates;
    }
    const map = new Map();
    this.data.transactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        const key = Utils.normalizeDescription(transaction.description);
        if (!key) {
          return;
        }
        if (!map.has(key)) {
          map.set(key, {
            title: transaction.description || "Без описания",
            amounts: [],
            monthKeys: new Set(),
            sample: transaction
          });
        }
        const item = map.get(key);
        item.amounts.push(transaction.amount);
        item.monthKeys.add(transaction.date.slice(0, 7));
      });

    const result = Array.from(map.values())
      .filter((entry) => entry.monthKeys.size >= 2 || entry.sample.flowKind === "recurring")
      .map((entry) => ({
        title: entry.title,
        averageAmount: entry.amounts.reduce((sum, value) => sum + value, 0) / entry.amounts.length,
        repeats: entry.monthKeys.size,
        category: this.getCategory(entry.sample.categoryId),
        flowKind: entry.sample.flowKind
      }))
      .sort((a, b) => b.repeats - a.repeats || b.averageAmount - a.averageAmount)
      .slice(0, 8);
    this.derivedCache.recurringCandidates = result;
    return result;
  },

  goalProgress(goal, monthKey = this.viewMonth) {
    const normalized = normalizeGoal(goal);
    if (!normalized) {
      return null;
    }
    const stats = this.statsForMonth(monthKey);
    let currentAmount = 0;
    // У цели осталось 2 режима:
    // 1) saved   -> пользователь вручную вбивает накопленную сумму,
    // 2) balance -> берем остаток на конец месяца как доступный прогресс.
    if (normalized.mode === "saved") {
      currentAmount = normalized.saved;
    } else {
      currentAmount = Math.max(0, stats.finalBalance);
    }
    const progress = normalized.target > 0 ? Math.min(100, (currentAmount / normalized.target) * 100) : 0;
    return {
      ...normalized,
      currentAmount,
      remaining: Math.max(0, Utils.roundMoney(normalized.target - currentAmount)),
      progress
    };
  },

  saveGoal(payload) {
    this.mutate((draft) => {
      draft.settings.goals = Array.isArray(draft.settings.goals) ? draft.settings.goals : [];
      const current = payload.id
        ? draft.settings.goals.find((item) => item.id === payload.id)
        : null;
      const next = normalizeGoal({
        ...payload,
        id: payload.id || Utils.uid("goal"),
        position: Number.isFinite(Number(payload.position))
          ? Number(payload.position)
          : (Number.isFinite(Number(current?.position))
            ? Number(current.position)
            : getBottomInsertPosition(draft.settings.goals || []))
      });
      if (!next) {
        return;
      }
      const index = draft.settings.goals.findIndex((item) => item.id === next.id);
      if (index >= 0) {
        draft.settings.goals[index] = {
          ...draft.settings.goals[index],
          ...next,
          updatedAt: Utils.nowISO()
        };
      } else {
        draft.settings.goals.push(next);
      }
    });
  },

  deleteGoal(goalId) {
    this.mutate((draft) => {
      draft.settings.goals = (draft.settings.goals || []).filter((item) => item.id !== goalId);
      addTombstone(draft, "goals", goalId);
    });
  },

  forecastNextMonth(referenceMonth = this.viewMonth) {
    const cacheKey = String(referenceMonth || this.viewMonth);
    const cached = this.derivedCache.forecast.get(cacheKey);
    if (cached) {
      return cached;
    }
    const referenceDate = new Date(Number(cacheKey.slice(0, 4)), Number(cacheKey.slice(5, 7)) - 1, 1);
    const available = [];
    for (let offset = 0; offset < 6; offset += 1) {
      const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
      const monthKey = Utils.monthKey(date);
      const stats = this.statsForMonth(monthKey);
      if (stats.operations > 0 || stats.startBalance > 0) {
        available.push(stats);
      }
    }
    const sample = available.length ? available : [this.statsForMonth(cacheKey)];
    // Прогноз намеренно остается прозрачным и воспроизводимым:
    // никаких "магических" ИИ-эвристик, только средние по истории за последние месяцы.
    const average = (getter) => Utils.roundMoney(sample.reduce((sum, item) => sum + getter(item), 0) / sample.length);
    const averageIncome = average((item) => item.totals.income);
    const averageExpense = average((item) => item.totals.expense);
    const averageRecurring = average((item) => item.totals.recurring);
    const averageDebt = average((item) => item.totals.debt);
    const breakdown = new Map();
    sample.forEach((item) => {
      this.expenseBreakdown(item.monthKey).forEach((entry) => {
        breakdown.set(entry.category.id, Utils.roundMoney((breakdown.get(entry.category.id) || 0) + entry.amount));
      });
    });
    const categoryForecast = Array.from(breakdown.entries())
      .map(([categoryId, amount]) => ({
        category: this.getCategory(categoryId),
        amount: Utils.roundMoney(amount / sample.length)
      }))
      .filter((item) => item.category)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const startingBalance = this.statsForMonth(cacheKey).finalBalance;
    const projectedFinal = Utils.roundMoney(startingBalance + averageIncome - averageExpense);
    const nextDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    const result = {
      monthKey: Utils.monthKey(nextDate),
      label: Utils.monthLabel(Utils.monthKey(nextDate)),
      sampleSize: sample.length,
      averageIncome,
      averageExpense,
      averageRecurring,
      averageDebt,
      startingBalance,
      projectedFinal,
      safeSpend: Math.max(0, Utils.roundMoney(averageIncome - averageRecurring - averageDebt)),
      categoryForecast
    };
    this.derivedCache.forecast.set(cacheKey, result);
    return result;
  },

  paymentCalendar(monthKey = this.viewMonth) {
    const cacheKey = String(monthKey || this.viewMonth);
    const cached = this.derivedCache.paymentCalendar.get(cacheKey);
    if (cached) {
      return cached;
    }
    const [year, month] = cacheKey.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const byDay = new Map();
    // Календарь строим поверх уже нормализованных транзакций месяца,
    // чтобы в ячейках были реальные движения денег, а не отдельный "второй" источник правды.
    this.getTransactions("month", cacheKey).forEach((transaction) => {
      const day = Number(transaction.date.slice(-2));
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day).push(transaction);
    });

    const result = {
      monthKey: cacheKey,
      weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      startOffset,
      days: Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const items = (byDay.get(day) || []).slice().sort((a, b) => a.amount - b.amount);
        const income = Utils.roundMoney(items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0));
        const expense = Utils.roundMoney(items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0));
        return {
          day,
          items,
          income,
          expense,
          isHeavyExpense: expense >= Math.max(averageExpenseThreshold(items), 5000)
        };
      })
    };
    this.derivedCache.paymentCalendar.set(cacheKey, result);
    return result;
  },

  addSectionRow(section) {
    if (section === "wishlist") {
      this.mutate((draft) => {
        const position = getBottomInsertPosition(draft.settings.wishlist);
        draft.settings.wishlist.push({
          id: Utils.uid("wish"),
          desc: "",
          amount: 0,
          position
        });
      });
      return;
    }

    const meta = SECTION_META[section];
    if (!meta) {
      return;
    }

    const monthKey = this.viewMonth;
    const today = new Date();
    const targetDate = monthKey === Utils.monthKey(today)
      ? Utils.todayISO()
      : `${monthKey}-${String(Math.min(28, today.getDate())).padStart(2, "0")}`;
    const categoryId = this.getPreferredCategoryIdForSection(section, monthKey);

    this.addTransaction({
      type: meta.type,
      flowKind: meta.flowKind,
      amount: 0,
      categoryId,
      date: targetDate,
      description: ""
    });
  },

  addTransaction(payload) {
    this.mutate((draft) => {
      const monthKey = payload.date.slice(0, 7);
      const monthTransactions = draft.transactions.filter((item) => item.date.slice(0, 7) === monthKey);
      ensureDefaultMonthMeta(draft.months, monthKey);
      draft.transactions.unshift({
        id: Utils.uid("tx"),
        type: payload.type,
        flowKind: payload.flowKind,
        amount: Math.max(0, Utils.roundMoney(payload.amount)),
        categoryId: payload.type === "expense" && payload.flowKind === "debt"
          ? this.getDefaultCategoryId("debts")
          : payload.categoryId,
        description: payload.description,
        date: payload.date,
        position: Number.isFinite(Number(payload.position)) ? Number(payload.position) : getBottomInsertPosition(monthTransactions),
        createdAt: Utils.nowISO(),
        updatedAt: Utils.nowISO()
      });
    });
  },

  updateTransaction(transactionId, payload) {
    this.mutate((draft) => {
      const index = draft.transactions.findIndex((transaction) => transaction.id === transactionId);
      if (index === -1) {
        return;
      }
      const monthKey = payload.date.slice(0, 7);
      ensureDefaultMonthMeta(draft.months, monthKey);
      draft.transactions[index] = {
        ...draft.transactions[index],
        ...payload,
        categoryId: payload.type === "expense" && payload.flowKind === "debt"
          ? this.getDefaultCategoryId("debts")
          : payload.categoryId,
        updatedAt: Utils.nowISO()
      };
    });
  },

  deleteTransaction(transactionId) {
    this.mutate((draft) => {
      draft.transactions = draft.transactions.filter((transaction) => transaction.id !== transactionId);
      addTombstone(draft, "transactions", transactionId);
    });
  },

  updateTransactionInline(transactionId, patch, options = {}) {
    return this.mutate((draft) => {
      const transaction = draft.transactions.find((item) => item.id === transactionId);
      if (!transaction) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
        transaction.amount = Math.max(0, Utils.roundMoney(Utils.safeNumber(patch.amount)));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "description")) {
        transaction.description = String(patch.description ?? "").slice(0, 200);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "categoryId") && this.getCategory(patch.categoryId)) {
        transaction.categoryId = patch.categoryId;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "date") && Utils.isISODate(patch.date)) {
        transaction.date = patch.date;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "position")) {
        transaction.position = Number(patch.position);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "flowKind")) {
        transaction.flowKind = patch.flowKind;
      }
      if (transaction.type === "expense" && transaction.flowKind === "debt") {
        transaction.categoryId = this.getDefaultCategoryId("debts");
      }
      transaction.updatedAt = Utils.nowISO();
    }, options);
  },

  moveTransactionToMonth(transactionId, targetMonth) {
    if (!/^\d{4}-\d{2}$/.test(String(targetMonth || ""))) {
      return false;
    }
    const [targetYear, targetMonthNumber] = targetMonth.split("-").map(Number);
    if (!targetYear || targetMonthNumber < 1 || targetMonthNumber > 12) {
      return false;
    }
    const current = this.data.transactions.find((item) => item.id === transactionId);
    if (!current || current.date.slice(0, 7) === targetMonth) {
      return false;
    }
    return this.mutate((draft) => {
      const transaction = draft.transactions.find((item) => item.id === transactionId);
      if (!transaction) {
        return;
      }
      const sourceDay = Math.max(1, Number(transaction.date.slice(-2)) || 1);
      const targetMonthDays = new Date(targetYear, targetMonthNumber, 0).getDate();
      const targetDay = Math.min(sourceDay, targetMonthDays);
      const targetTransactions = draft.transactions.filter((item) =>
        item.id !== transactionId && item.date.startsWith(`${targetMonth}-`)
      );
      transaction.date = `${targetMonth}-${String(targetDay).padStart(2, "0")}`;
      transaction.position = getBottomInsertPosition(targetTransactions);
      transaction.updatedAt = Utils.nowISO();
      ensureDefaultMonthMeta(draft.months, targetMonth);
    });
  },

  addFavoriteFromTransaction(transactionId) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId && item.type === "expense" && item.flowKind === "standard");
    if (!transaction) {
      return false;
    }
    const exists = this.data.settings.favorites.some((item) =>
      item.desc === transaction.description &&
      item.categoryId === transaction.categoryId &&
      Math.abs(item.amount - transaction.amount) < 0.01
    );
    if (exists) {
      return false;
    }
    this.mutate((draft) => {
      const now = Utils.nowISO();
      draft.settings.favorites.unshift({
        id: Utils.uid("fav"),
        desc: transaction.description,
        amount: transaction.amount,
        type: "expense",
        categoryId: transaction.categoryId,
        flowKind: "standard",
        createdAt: now,
        updatedAt: now
      });
    });
    return true;
  },

  removeFavoriteFromTransaction(transactionId) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId && item.type === "expense" && item.flowKind === "standard");
    if (!transaction) {
      return false;
    }
    const before = this.data.settings.favorites.length;
    this.mutate((draft) => {
      const removedIds = draft.settings.favorites.filter((item) => (
        item.desc === transaction.description &&
        item.categoryId === transaction.categoryId &&
        Math.abs(item.amount - transaction.amount) < 0.01
      )).map((item) => item.id);
      draft.settings.favorites = draft.settings.favorites.filter((item) => !(
        item.desc === transaction.description &&
        item.categoryId === transaction.categoryId &&
        Math.abs(item.amount - transaction.amount) < 0.01
      ));
      removedIds.forEach((id) => addTombstone(draft, "favorites", id));
    });
    return this.data.settings.favorites.length < before;
  },

  isFavoriteTransaction(transactionId) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId && item.type === "expense" && item.flowKind === "standard");
    if (!transaction) {
      return false;
    }
    return this.data.settings.favorites.some((item) =>
      item.desc === transaction.description &&
      item.categoryId === transaction.categoryId &&
      Math.abs(item.amount - transaction.amount) < 0.01
    );
  },

  getTemplateBucketForTransaction(transaction) {
    if (!transaction) {
      return "recurring";
    }
    return normalizeTemplateBucket(null, transaction.type, transaction.flowKind);
  },

  getTemplatesByBucket(bucket) {
    const normalizedBucket = normalizeTemplateBucket(bucket);
    return this.sortQuickItems(this.data.settings.templates.filter((item) =>
      normalizeTemplateBucket(item.bucket, item.type, item.flowKind) === normalizedBucket
    ));
  },

  addTemplateFromTransaction(transactionId, bucket = null) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return false;
    }
    const normalizedBucket = normalizeTemplateBucket(bucket, transaction.type, transaction.flowKind);
    const exists = this.getTemplatesByBucket(normalizedBucket).some((item) =>
      item.desc === transaction.description &&
      item.categoryId === transaction.categoryId &&
      item.type === transaction.type &&
      item.flowKind === transaction.flowKind &&
      Math.abs(item.amount - transaction.amount) < 0.01
    );
    if (exists) {
      return false;
    }
    this.saveTemplate({
      kind: "template",
      bucket: normalizedBucket,
      desc: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      categoryId: transaction.categoryId,
      flowKind: transaction.type === "income" ? "standard" : transaction.flowKind
    });
    return true;
  },

  removeTemplateFromTransaction(transactionId, bucket = null) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return false;
    }
    const normalizedBucket = normalizeTemplateBucket(bucket, transaction.type, transaction.flowKind);
    const before = this.data.settings.templates.length;
    this.mutate((draft) => {
      const removedIds = draft.settings.templates.filter((item) => (
        normalizeTemplateBucket(item.bucket, item.type, item.flowKind) === normalizedBucket &&
        item.desc === transaction.description &&
        item.categoryId === transaction.categoryId &&
        item.type === transaction.type &&
        item.flowKind === (transaction.type === "income" ? "standard" : transaction.flowKind) &&
        Math.abs(item.amount - transaction.amount) < 0.01
      )).map((item) => item.id);
      draft.settings.templates = draft.settings.templates.filter((item) => !(
        normalizeTemplateBucket(item.bucket, item.type, item.flowKind) === normalizedBucket &&
        item.desc === transaction.description &&
        item.categoryId === transaction.categoryId &&
        item.type === transaction.type &&
        item.flowKind === (transaction.type === "income" ? "standard" : transaction.flowKind) &&
        Math.abs(item.amount - transaction.amount) < 0.01
      ));
      removedIds.forEach((id) => addTombstone(draft, "templates", id));
    });
    return this.data.settings.templates.length < before;
  },

  isTemplateTransaction(transactionId, bucket = null) {
    const transaction = this.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return false;
    }
    const normalizedBucket = normalizeTemplateBucket(bucket, transaction.type, transaction.flowKind);
    return this.getTemplatesByBucket(normalizedBucket).some((item) =>
      item.desc === transaction.description &&
      item.categoryId === transaction.categoryId &&
      item.type === transaction.type &&
      item.flowKind === (transaction.type === "income" ? "standard" : transaction.flowKind) &&
      Math.abs(item.amount - transaction.amount) < 0.01
    );
  },

  saveCategory(payload) {
    this.mutate((draft) => {
      if (payload.id) {
        const category = draft.settings.categories.find((item) => item.id === payload.id);
        if (!category) {
          return;
        }
        const previousType = category.type;
        category.name = payload.name;
        category.type = payload.type;
        category.color = payload.color;
        category.limit = payload.limit;
        category.updatedAt = Utils.nowISO();
        if (previousType !== payload.type) {
          draft.transactions.forEach((transaction) => {
            if (transaction.categoryId === payload.id) {
              transaction.type = payload.type;
              if (payload.type === "income") {
                transaction.flowKind = "standard";
              }
              transaction.updatedAt = Utils.nowISO();
            }
          });
          draft.settings.templates.forEach((template) => {
            if (template.categoryId === payload.id) {
              template.type = payload.type;
              if (payload.type === "income") {
                template.flowKind = "standard";
              }
            }
          });
          draft.settings.favorites.forEach((favorite) => {
            if (favorite.categoryId === payload.id) {
              favorite.type = payload.type;
              if (payload.type === "income") {
                favorite.flowKind = "standard";
              }
            }
          });
        }
      } else {
        draft.settings.categories.unshift({
          id: Utils.uid("cat"),
          name: payload.name,
          type: payload.type,
          color: payload.color,
          limit: payload.limit,
          preset: false,
          createdAt: Utils.nowISO(),
          updatedAt: Utils.nowISO()
        });
      }
    });
  },

  deleteCategory(categoryId) {
    const category = this.getCategory(categoryId);
    if (!category) {
      throw new Error("Категория не найдена");
    }
    this.mutate((draft) => {
      let fallbackId = draft.settings.categories.find((item) => item.type === category.type && item.id !== categoryId)?.id || "";

      if (!fallbackId) {
        const emergency = {
          id: Utils.uid("cat"),
          name: category.type === "income" ? "Прочие доходы" : "Прочие расходы",
          type: category.type,
          color: "#8b949e",
          limit: 0,
          preset: false,
          createdAt: Utils.nowISO(),
          updatedAt: Utils.nowISO()
        };
        draft.settings.categories.unshift(emergency);
        fallbackId = emergency.id;
      }

      draft.transactions = draft.transactions.map((transaction) =>
        transaction.categoryId === categoryId
          ? { ...transaction, categoryId: fallbackId, updatedAt: Utils.nowISO() }
          : transaction
      );
      draft.settings.templates = draft.settings.templates.map((template) =>
        template.categoryId === categoryId
          ? { ...template, categoryId: fallbackId }
          : template
      );
      draft.settings.favorites = draft.settings.favorites.map((favorite) =>
        favorite.categoryId === categoryId
          ? { ...favorite, categoryId: fallbackId }
          : favorite
      );

      if (category.preset) {
        const deleted = new Set(draft.settings.deletedPresetCategoryIds || []);
        deleted.add(categoryId);
        draft.settings.deletedPresetCategoryIds = Array.from(deleted);
      }

      draft.settings.categories = draft.settings.categories.filter((item) => item.id !== categoryId);
      addTombstone(draft, "categories", categoryId);
    });
  },

  saveTemplate(payload) {
    this.mutate((draft) => {
      const listName = payload.kind === "favorite" ? "favorites" : "templates";
      const existingIndex = draft.settings[listName].findIndex((item) => item.id === payload.id);
      const existing = existingIndex >= 0 ? draft.settings[listName][existingIndex] : null;
      const now = Utils.nowISO();
      const next = {
        id: payload.id || Utils.uid(payload.kind === "favorite" ? "fav" : "tpl"),
        desc: payload.desc,
        amount: payload.amount,
        type: payload.type,
        categoryId: payload.categoryId,
        flowKind: payload.flowKind,
        bucket: payload.kind === "favorite" ? undefined : normalizeTemplateBucket(payload.bucket, payload.type, payload.flowKind),
        createdAt: existing?.createdAt || payload.createdAt || now,
        updatedAt: now
      };
      if (existingIndex >= 0) {
        draft.settings[listName].splice(existingIndex, 1);
        draft.settings[listName].unshift(next);
      } else {
        draft.settings[listName].unshift(next);
      }
    });
  },

  deleteTemplate(templateId, kind = "template") {
    const listName = kind === "favorite" ? "favorites" : "templates";
    this.mutate((draft) => {
      draft.settings[listName] = draft.settings[listName].filter((item) => item.id !== templateId);
      addTombstone(draft, kind === "favorite" ? "favorites" : "templates", templateId);
    });
  },

  applyTemplate(templateId) {
    const template = this.data.settings.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    this.addTransaction({
      type: template.type,
      amount: template.amount,
      categoryId: template.categoryId,
      flowKind: template.flowKind,
      description: template.desc,
      date: Utils.todayISO()
    });
  },

  applyFavorite(favoriteId) {
    const favorite = this.data.settings.favorites.find((item) => item.id === favoriteId);
    if (!favorite) {
      return;
    }
    const today = new Date();
    const targetDate = this.viewMonth === Utils.monthKey(today)
      ? Utils.todayISO()
      : `${this.viewMonth}-${String(Math.min(28, today.getDate())).padStart(2, "0")}`;
    this.addTransaction({
      type: "expense",
      amount: favorite.amount,
      categoryId: favorite.categoryId || this.getDefaultCategoryId("expenses"),
      flowKind: "standard",
      description: favorite.desc,
      date: targetDate
    });
  },

  applyTemplateSelection(ids, targetBucket = null) {
    const today = new Date();
    const targetDate = this.viewMonth === Utils.monthKey(today)
      ? Utils.todayISO()
      : `${this.viewMonth}-${String(Math.min(28, today.getDate())).padStart(2, "0")}`;
    this.mutate((draft) => {
      let positionCursor = getBottomInsertPosition(
        draft.transactions.filter((item) => item.date.slice(0, 7) === targetDate.slice(0, 7)),
        ids.length
      );
      ids.forEach((id) => {
        const item = draft.settings.templates.find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        const bucket = normalizeTemplateBucket(targetBucket || item.bucket, item.type, item.flowKind);
        const type = bucket === "income" ? "income" : "expense";
        const flowKind = type === "income"
          ? "standard"
          : (bucket === "debt" ? "debt" : "recurring");
        let categoryId = item.categoryId;
        const category = findCategory(draft.settings.categories, categoryId);
        if (!category || category.type !== type) {
          categoryId = type === "income"
            ? this.getDefaultCategoryId("incomes")
            : bucket === "debt"
              ? this.getDefaultCategoryId("debts")
              : bucket === "recurring"
                ? this.getDefaultCategoryId("recurring")
                : this.getDefaultCategoryId("expenses");
        }
        if (type === "expense" && flowKind === "debt") {
          categoryId = this.getDefaultCategoryId("debts");
        }
        draft.transactions.push({
          id: Utils.uid("tx"),
          type,
          flowKind,
          amount: item.amount,
          categoryId,
          description: item.desc,
          date: targetDate,
          position: positionCursor++,
          createdAt: Utils.nowISO(),
          updatedAt: Utils.nowISO()
        });
      });
      ensureDefaultMonthMeta(draft.months, targetDate.slice(0, 7));
    });
  },

  applyFavoriteSelection(ids) {
    const today = new Date();
    const targetDate = this.viewMonth === Utils.monthKey(today)
      ? Utils.todayISO()
      : `${this.viewMonth}-${String(Math.min(28, today.getDate())).padStart(2, "0")}`;
    this.mutate((draft) => {
      let positionCursor = getBottomInsertPosition(
        draft.transactions.filter((item) => item.date.slice(0, 7) === targetDate.slice(0, 7)),
        ids.length
      );
      ids.forEach((id) => {
        const item = draft.settings.favorites.find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        draft.transactions.push({
          id: Utils.uid("tx"),
          type: "expense",
          flowKind: "standard",
          amount: item.amount,
          categoryId: item.categoryId || "exp_other",
          description: item.desc,
          date: targetDate,
          position: positionCursor++,
          createdAt: Utils.nowISO(),
          updatedAt: Utils.nowISO()
        });
      });
      ensureDefaultMonthMeta(draft.months, targetDate.slice(0, 7));
    });
  },

  updateWishlistItem(itemId, patch, options = {}) {
    return this.mutate((draft) => {
      const item = draft.settings.wishlist.find((entry) => entry.id === itemId);
      if (!item) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "desc")) {
        item.desc = String(patch.desc ?? "").slice(0, 180);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
        item.amount = Math.max(0, Utils.roundMoney(Utils.safeNumber(patch.amount)));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "position")) {
        item.position = Number(patch.position);
      }
      item.updatedAt = Utils.nowISO();
    }, options);
  },

  deleteWishlistItem(itemId) {
    this.mutate((draft) => {
      draft.settings.wishlist = draft.settings.wishlist.filter((item) => item.id !== itemId);
      addTombstone(draft, "wishlist", itemId);
    });
  },

  fulfillWishlistItem(itemId) {
    const wish = this.data.settings.wishlist.find((item) => item.id === itemId);
    if (!wish) {
      return;
    }
    const today = new Date();
    const targetDate = this.viewMonth === Utils.monthKey(today)
      ? Utils.todayISO()
      : `${this.viewMonth}-${String(Math.min(28, today.getDate())).padStart(2, "0")}`;
    const categoryId = findCategoryIdByName(this.data.settings.categories, "expense", "Досуг") || this.getDefaultCategoryId("expenses");
    this.mutate((draft) => {
      const position = getTopInsertPosition(draft.transactions.filter((item) => item.date.slice(0, 7) === targetDate.slice(0, 7)));
      draft.transactions.unshift({
        id: Utils.uid("tx"),
        type: "expense",
        flowKind: "standard",
        amount: wish.amount,
        categoryId,
        description: wish.desc,
        date: targetDate,
        position,
        createdAt: Utils.nowISO(),
        updatedAt: Utils.nowISO()
      });
      draft.settings.wishlist = draft.settings.wishlist.filter((item) => item.id !== itemId);
      addTombstone(draft, "wishlist", itemId);
      ensureDefaultMonthMeta(draft.months, targetDate.slice(0, 7));
    });
  },

  reorderSection(section, draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }
    this.mutate((draft) => {
      if (section === "wishlist") {
        const list = draft.settings.wishlist.slice().sort((a, b) => a.position - b.position);
        const from = list.findIndex((item) => item.id === draggedId);
        const to = list.findIndex((item) => item.id === targetId);
        if (from < 0 || to < 0) {
          return;
        }
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        list.forEach((item, index) => {
          const original = draft.settings.wishlist.find((entry) => entry.id === item.id);
          if (original) {
            original.position = index + 1;
          }
        });
        return;
      }

      const list = this.getDraftSectionTransactions(draft, section, this.viewMonth);

      const from = list.findIndex((item) => item.id === draggedId);
      const to = list.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) {
        return;
      }
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      list.forEach((item, index) => {
        const original = draft.transactions.find((entry) => entry.id === item.id);
        if (original) {
          original.position = index + 1;
        }
        });
      });
    },

  sortSectionTransactions(section, direction = "date-desc") {
    if (!["incomes", "debts", "recurring", "expenses"].includes(section)) {
      return;
    }
    this.mutate((draft) => {
      const list = this.getDraftSectionTransactions(draft, section, this.viewMonth)
        .sort((a, b) => {
          const byDate = direction === "date-asc"
            ? String(a.date).localeCompare(String(b.date))
            : String(b.date).localeCompare(String(a.date));
          if (byDate !== 0) {
            return byDate;
          }
          return Number(a.position || 0) - Number(b.position || 0);
        });

      list.forEach((item, index) => {
        const original = draft.transactions.find((entry) => entry.id === item.id);
        if (original) {
          original.position = index + 1;
        }
      });
    });
  },

  importBackup(raw) {
    const before = this.captureSnapshot();
    const audit = validateBackupPayload(raw);
    const next = normalizeData(raw);
    Diagnostics.report("import-backup:validated", audit);
    Diagnostics.report("import-backup:normalized", summarizeNormalizedData(next));
    this.setData(next, { save: false });
    if (!this.saveLocal()) {
      this.setData(before.data, { save: false });
      throw new Error("Браузер не смог сохранить импорт. Исходные данные восстановлены; освободите место и повторите.");
    }
    if (comparableDataSignature(next) !== comparableDataSignature(before.data)) {
      this.pushHistory(before);
    }
    if (Auth.isAuthenticated()) {
      Sync.queueSync();
      if (typeof App !== "undefined" && typeof App.runAfterNextPaint === "function") {
        App.runAfterNextPaint(() => {
          Sync.processQueue(true).catch(() => {});
        }, 2);
      }
    }
    UI.renderApp();
  },

  exportVersionedBackup() {
    return {
      format: "personal-budget-tracker",
      schemaVersion: CONFIG.APP_VERSION,
      exportedAt: Utils.nowISO(),
      data: normalizeData(this.data)
    };
  },

  exportLegacyBackup() {
    const backup = {
      settings: {
        theme: this.data.profile.theme,
        deletedPresetCategoryIds: [...(this.data.settings.deletedPresetCategoryIds || [])],
        categories: this.data.settings.categories.map((category) => ({
          id: category.id,
          name: category.name,
          type: category.type,
          color: category.color,
          limit: Utils.roundMoney(category.limit),
          preset: Boolean(category.preset)
        })),
        favorites: this.data.settings.favorites.map((item) => ({
          id: item.id,
          desc: item.desc,
          amount: Utils.roundMoney(item.amount),
          category: this.getCategory(item.categoryId)?.name || "",
          categoryId: item.categoryId,
          type: item.type,
          flowKind: item.flowKind,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })),
        templates: this.data.settings.templates.map((item) => ({
          id: item.id,
          desc: item.desc,
          amount: Utils.roundMoney(item.amount),
          category: this.getCategory(item.categoryId)?.name || "",
          categoryId: item.categoryId,
          bucket: normalizeTemplateBucket(item.bucket, item.type, item.flowKind),
          type: item.type,
          flowKind: item.flowKind,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })),
        goals: (this.data.settings.goals || []).map((item) => ({
          id: item.id,
          name: item.name,
          target: Utils.roundMoney(item.target),
          mode: item.mode,
          saved: Utils.roundMoney(item.saved),
          note: item.note || "",
          color: item.color,
          position: item.position,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }))
      },
      wishlist: this.data.settings.wishlist.map((item) => ({
        id: item.id,
        desc: item.desc,
        amount: Utils.roundMoney(item.amount),
        position: item.position
      })).sort((a, b) => a.position - b.position)
    };

    const monthKeys = this.getMonthKeys().sort();
    monthKeys.forEach((monthKey) => {
      const monthMeta = this.data.months[monthKey] || { start: 0, manualStart: false };
      const stats = this.statsForMonth(monthKey);
      const block = {
        start: Utils.roundMoney(monthMeta.start || 0),
        manualStart: Boolean(monthMeta.manualStart),
        incomes: [],
        debts: [],
        recurring: [],
        expenses: [],
        finalBalance: Utils.roundMoney(stats.finalBalance)
      };
      this.getTransactions("month", monthKey).slice().sort((a, b) => a.position - b.position).forEach((transaction) => {
        const categoryName = this.getCategory(transaction.categoryId)?.name || "";
        const item = {
          id: transaction.id,
          day: Number(transaction.date.slice(-2)),
          amount: Utils.roundMoney(transaction.amount),
          desc: transaction.description,
          category: categoryName,
          tag: categoryName,
          categoryId: transaction.categoryId,
          position: transaction.position,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt
        };
        if (transaction.type === "income") {
          block.incomes.push(item);
        } else if (transaction.flowKind === "debt") {
          block.debts.push(item);
        } else if (transaction.flowKind === "recurring") {
          block.recurring.push(item);
        } else {
          block.expenses.push(item);
        }
      });
      backup[monthKey] = block;
    });

    return backup;
  }
};
