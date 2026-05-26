"use strict";

const CONFIG = {
  API_BASE: "https://personal-budget-api.bonaqu.workers.dev",
  SESSION_KEY: "budget_flow_ru_session_v4",
  QUEUE_KEY: "budget_flow_ru_pending_v3",
  CACHE_PREFIX: "budget_flow_ru_cache_",
  LAST_SYNC_PREFIX: "budget_flow_ru_last_sync_",
  SIDEBAR_KEY: "budget_flow_ru_sidebar_collapsed_v1",
  BUDGET_FILTERS_KEY: "budget_flow_ru_budget_filters_collapsed_v1",
  JOURNAL_SORT_KEY: "budget_flow_ru_journal_sort_v3",
  APP_VERSION: 3,
  SESSION_IDLE_MINUTES: 30,
  SESSION_ACTIVITY_THROTTLE_MS: 15000
};

const LOCAL_TEST_CREDENTIALS = {
  login: "test1234",
  password: "test1234"
};
const LOCAL_TEST_EXIT_FLAG = "budget:local-test-exit";

const DEFAULT_CATEGORIES = [
  { id: "inc_salary", name: "Зарплата", type: "income", color: "#2ea043", limit: 0, preset: true },
  { id: "inc_freelance", name: "Фриланс", type: "income", color: "#58a6ff", limit: 0, preset: true },
  { id: "inc_bonus", name: "Премия", type: "income", color: "#3fb950", limit: 0, preset: true },
  { id: "inc_sales", name: "Продажи", type: "income", color: "#1f6feb", limit: 0, preset: true },
  { id: "inc_cashback", name: "Кэшбэк", type: "income", color: "#ffb86b", limit: 0, preset: true },
  { id: "inc_interest", name: "Проценты и инвестиции", type: "income", color: "#12b886", limit: 0, preset: true },
  { id: "inc_gifts", name: "Подарки и поддержка", type: "income", color: "#c77dff", limit: 0, preset: true },
  { id: "inc_other", name: "Прочие доходы", type: "income", color: "#8b949e", limit: 0, preset: true },
  { id: "exp_food", name: "Еда", type: "expense", color: "#2ea043", limit: 0, preset: true },
  { id: "exp_transport", name: "Транспорт", type: "expense", color: "#d29922", limit: 0, preset: true },
  { id: "exp_health", name: "Здоровье", type: "expense", color: "#da3633", limit: 0, preset: true },
  { id: "exp_home", name: "Жилье", type: "expense", color: "#58a6ff", limit: 0, preset: true },
  { id: "exp_clothes", name: "Одежда и обувь", type: "expense", color: "#f78166", limit: 0, preset: true },
  { id: "exp_cafe", name: "Кафе и рестораны", type: "expense", color: "#fb7185", limit: 0, preset: true },
  { id: "exp_travel", name: "Путешествия", type: "expense", color: "#14b8a6", limit: 0, preset: true },
  { id: "exp_education", name: "Образование", type: "expense", color: "#7c3aed", limit: 0, preset: true },
  { id: "exp_beauty", name: "Красота и уход", type: "expense", color: "#ec4899", limit: 0, preset: true },
  { id: "exp_children", name: "Дети и семья", type: "expense", color: "#f59e0b", limit: 0, preset: true },
  { id: "exp_pets", name: "Питомцы", type: "expense", color: "#22c55e", limit: 0, preset: true },
  { id: "exp_home_repair", name: "Дом и ремонт", type: "expense", color: "#0ea5e9", limit: 0, preset: true },
  { id: "exp_fees", name: "Налоги и комиссии", type: "expense", color: "#64748b", limit: 0, preset: true },
  { id: "exp_marketplace", name: "Маркетплейсы", type: "expense", color: "#db61a2", limit: 0, preset: true },
  { id: "exp_subscription", name: "ЖКХ+Моб + Инет", type: "expense", color: "#8957e5", limit: 0, preset: true },
  { id: "exp_services", name: "Подписки и услуги", type: "expense", color: "#6e7681", limit: 0, preset: true },
  { id: "exp_fun", name: "Развлечения", type: "expense", color: "#d18616", limit: 0, preset: true },
  { id: "exp_games", name: "Игры и внутриигровые товары", type: "expense", color: "#79c0ff", limit: 0, preset: true },
  { id: "exp_transfers", name: "Переводы", type: "expense", color: "#8b949e", limit: 0, preset: true },
  { id: "exp_gifts", name: "Подарки (праздники)", type: "expense", color: "#ff7b72", limit: 0, preset: true },
  { id: "exp_debt", name: "Долги", type: "expense", color: "#ff7b72", limit: 0, preset: true },
  { id: "exp_other", name: "Прочие расходы", type: "expense", color: "#8b949e", limit: 0, preset: true }
];

const SECTION_META = {
    incomes: {
      title: "💵 Доходы",
      type: "income",
      flowKind: "standard",
      defaultCategoryId: "inc_salary",
      emptyText: "Здесь появятся поступления месяца. Можно добавить первое вручную или взять его из шаблона дохода."
    },
  debts: {
    title: "🏦 Долговые обязательства",
    type: "expense",
    flowKind: "debt",
    defaultCategoryId: "exp_debt",
      emptyText: "Добавьте сюда платеж по кредиту, рассрочке или любому другому долговому обязательству."
    },
  recurring: {
    title: "🔁 Регулярные платежи",
    type: "expense",
    flowKind: "recurring",
    defaultCategoryName: "ЖКХ+Моб + Инет",
      emptyText: "Здесь удобно держать регулярные платежи, которые повторяются из месяца в месяц."
    },
  expenses: {
    title: "🛒 Текущие расходы",
    type: "expense",
    flowKind: "standard",
    defaultCategoryId: "exp_food",
      emptyText: "Здесь появятся покупки месяца. Добавьте первую строку или поднимите ее из избранного."
    },
  wishlist: {
    title: "🌟 Цели и хотелки",
      emptyText: "Здесь живут будущие покупки, цели и идеи, к которым хочется вернуться позже."
    }
  };

const TEMPLATE_BUCKET_META = {
  recurring: {
    id: "recurring",
    quickMode: "template-recurring",
    title: "Шаблоны регулярных платежей",
    createText: "Новый шаблон регулярного платежа",
    pickerTitle: "Выберите шаблоны регулярных платежей",
    pickerApplyText: "Добавить в регулярные платежи",
    itemLabel: "Регулярный платеж",
    type: "expense",
    flowKind: "recurring",
    section: "recurring",
    loadButtonLabel: "Из шаблона регулярных платежей",
    addLabel: "Добавить в шаблоны регулярных платежей",
    removeLabel: "Убрать из шаблонов регулярных платежей",
      emptyText: "Сохраните здесь повторяющиеся платежи, чтобы возвращать их в бюджет за пару касаний."
  },
  income: {
    id: "income",
    quickMode: "template-income",
    title: "Шаблоны доходов",
    createText: "Новый шаблон дохода",
    pickerTitle: "Выберите шаблоны доходов",
    pickerApplyText: "Добавить в доходы",
    itemLabel: "Доход",
    type: "income",
    flowKind: "standard",
    section: "incomes",
    loadButtonLabel: "Из шаблона доходов",
    addLabel: "Добавить в шаблоны доходов",
    removeLabel: "Убрать из шаблонов доходов",
      emptyText: "Сохраните здесь типовые поступления, чтобы больше не вводить их вручную каждый месяц."
  },
  debt: {
    id: "debt",
    quickMode: "template-debt",
    title: "Шаблоны долговых обязательств",
    createText: "Новый шаблон долгового обязательства",
    pickerTitle: "Выберите шаблоны долговых обязательств",
    pickerApplyText: "Добавить в долговые обязательства",
    itemLabel: "Долговое обязательство",
    type: "expense",
    flowKind: "debt",
    section: "debts",
    loadButtonLabel: "Из шаблона долговых обязательств",
    addLabel: "Добавить в шаблоны долговых обязательств",
    removeLabel: "Убрать из шаблонов долговых обязательств",
      emptyText: "Сохраните здесь платежи по долгам и рассрочкам, чтобы быстро возвращать их в бюджет."
  }
};

function normalizeTemplateBucket(value, type = "expense", flowKind = "standard") {
  if (value === "income" || value === "debt" || value === "recurring") {
    return value;
  }
  if (type === "income") {
    return "income";
  }
  if (flowKind === "debt") {
    return "debt";
  }
  return "recurring";
}

function getTemplateBucketMeta(bucket, type = "expense", flowKind = "standard") {
  return TEMPLATE_BUCKET_META[normalizeTemplateBucket(bucket, type, flowKind)] || TEMPLATE_BUCKET_META.recurring;
}

function normalizeSettingsQuickMode(mode) {
  if (mode === "favorite") {
    return "favorite";
  }
  if (mode === "template" || mode === "template-recurring") {
    return "template-recurring";
  }
  if (mode === "template-income") {
    return "template-income";
  }
  if (mode === "template-debt") {
    return "template-debt";
  }
  return "template-recurring";
}

function isTemplateQuickMode(mode) {
  return String(mode || "").startsWith("template-");
}

function getQuickTemplateBucket(mode) {
  const normalized = normalizeSettingsQuickMode(mode);
  if (!isTemplateQuickMode(normalized)) {
    return null;
  }
  return normalized.replace("template-", "");
}

const Utils = {
  $: (id) => document.getElementById(id),

  clone(value) {
    // structuredClone работает заметно мягче для больших состояний,
    // а JSON-ветка остается как страховка для старых/необычных окружений.
    try {
      return structuredClone(value);
    } catch (error) {
      return JSON.parse(JSON.stringify(value));
    }
  },

  createElement(tag, classes = "", textContent = "") {
    const element = document.createElement(tag);
    if (Array.isArray(classes)) {
      element.className = classes.filter(Boolean).join(" ");
    } else if (classes) {
      element.className = String(classes);
    }
    if (element.classList.contains("empty-state")) {
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
    }
    if (textContent !== null && textContent !== undefined) {
      element.textContent = String(textContent);
    }
    return element;
  },

  cssVar(name, fallback = "") {
    const source = document.body || document.documentElement;
    const value = window.getComputedStyle(source).getPropertyValue(name).trim();
    return value || fallback;
  },

  cssRgb(name, alpha, fallback = "") {
    const value = this.cssVar(name, "").replace(/\s+/g, " ").trim();
    if (!value) {
      return fallback;
    }
    return `rgb(${value} / ${alpha})`;
  },

  themePalette() {
    const isLight = Store?.data?.profile?.theme === "light";
    return {
      text: this.cssVar("--text", isLight ? "#0e1826" : "#f0f6fc"),
      textSoft: this.cssVar("--text-soft", isLight ? "#4f6479" : "#9aa4af"),
      accent: this.cssVar("--accent", isLight ? "#0969da" : "#58a6ff"),
      success: this.cssVar("--success", isLight ? "#1f883d" : "#2ea043"),
      danger: this.cssVar("--danger", isLight ? "#cf222e" : "#f85149"),
      bgSolid: this.cssVar("--bg-solid", isLight ? "#ffffff" : "#161b22"),
      grid: this.cssRgb("--line-rgb", isLight ? 0.09 : 0.08, isLight ? "rgba(13,23,38,0.09)" : "rgba(255,255,255,0.08)"),
      fillTop: this.cssRgb("--accent-rgb", isLight ? 0.18 : 0.24, isLight ? "rgba(9,105,218,0.18)" : "rgba(88,166,255,0.24)"),
      fillBottom: this.cssRgb("--success-rgb", 0.06, "rgba(46,160,67,0.06)"),
      gain: this.cssRgb("--success-rgb", isLight ? 0.32 : 0.38, isLight ? "rgba(31,136,61,0.32)" : "rgba(46,160,67,0.38)"),
      loss: this.cssRgb("--danger-rgb", isLight ? 0.28 : 0.34, isLight ? "rgba(207,34,46,0.28)" : "rgba(248,81,73,0.34)"),
      marker: this.cssRgb("--text-rgb", isLight ? 0.18 : 0.3, isLight ? "rgba(13,23,38,0.18)" : "rgba(240,246,252,0.3)")
    };
  },

  icon(name) {
    const icons = {
      close: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 7L17 17"></path>
          <path d="M17 7L7 17"></path>
        </svg>
      `,
      star: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4.5L14.3 9.15L19.45 9.9L15.72 13.55L16.6 18.7L12 16.28L7.4 18.7L8.28 13.55L4.55 9.9L9.7 9.15L12 4.5Z"></path>
        </svg>
      `,
      cart: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9" cy="19" r="1.6"></circle>
          <circle cx="17" cy="19" r="1.6"></circle>
          <path d="M4.5 5.5H6.2L8.1 14.2H17.7L19.5 8.1H7.2"></path>
        </svg>
      `,
      calendar: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4.5" y="5.5" width="15" height="14" rx="3"></rect>
          <path d="M8 3.75V7"></path>
          <path d="M16 3.75V7"></path>
          <path d="M4.5 9.5H19.5"></path>
          <path d="M8.25 12.5H8.26"></path>
          <path d="M12 12.5H12.01"></path>
          <path d="M15.75 12.5H15.76"></path>
        </svg>
      `,
      bookmark: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7.5 5.5H16.5C17.0523 5.5 17.5 5.94772 17.5 6.5V19L12 15.4L6.5 19V6.5C6.5 5.94772 6.94772 5.5 7.5 5.5Z"></path>
        </svg>
      `,
      dialpad: `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="1.5"></circle>
          <circle cx="12" cy="7" r="1.5"></circle>
          <circle cx="17" cy="7" r="1.5"></circle>
          <circle cx="7" cy="12" r="1.5"></circle>
          <circle cx="12" cy="12" r="1.5"></circle>
          <circle cx="17" cy="12" r="1.5"></circle>
          <circle cx="7" cy="17" r="1.5"></circle>
          <path d="M10.5 17H13.5"></path>
          <circle cx="17" cy="17" r="1.5"></circle>
        </svg>
      `
    };
    return icons[name] || "";
  },

  uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  },

  todayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  nowISO() {
    return new Date().toISOString();
  },

  isISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
      return false;
    }
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
  },

  monthKey(dateValue) {
    const date = typeof dateValue === "string" ? new Date(`${dateValue}-01T00:00:00`) : dateValue;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  },

  monthLabel(monthKey) {
    const [year, month] = String(monthKey).split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date).replace(/^./, (char) => char.toUpperCase());
  },

  shortMonthLabel(monthKey) {
    const [year, month] = String(monthKey).split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date).replace(".", "");
  },

  formatDate(value) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(`${value}T00:00:00`));
  },

  formatMoney(value) {
    const amount = this.roundMoney(value);
    const hasFraction = Math.abs(amount - Math.trunc(amount)) > 0.001;
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2
    }).format(amount);
  },

  parseAmount(value) {
    const parsed = Number.parseFloat(String(value).replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? this.roundMoney(parsed) : 0;
  },

  safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed) : 0;
  },

  roundMoney(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Number(parsed.toFixed(2));
  },

  formatPercent(value, maximumFractionDigits = 2) {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    return `${new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits
    }).format(safe)}%`;
  },

  normalizeLookupKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/[^a-z\u0430-\u044f0-9]+/gi, "");
  },

  escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  },

  setHelpText(target, text) {
    if (!(target instanceof HTMLElement) || !text) {
      return;
    }
    target.title = text;
    target.setAttribute("aria-label", text);
    const card = target.closest("article");
    if (card instanceof HTMLElement) {
      card.title = text;
      card.setAttribute("aria-label", text);
      card.classList.add("has-help");
    }
  },

  wrapText(value) {
    return String(value ?? "").trim();
  },

  truncateSingleLine(value, limit = 72) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
  },

  truncateSingleLineToFit(value, element, fallbackLimit = 72) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (!(element instanceof HTMLElement)) {
      return this.truncateSingleLine(normalized, fallbackLimit);
    }
    const computed = window.getComputedStyle(element);
    const width = element.clientWidth;
    const paddingLeft = Number.parseFloat(computed.paddingLeft || "0") || 0;
    const paddingRight = Number.parseFloat(computed.paddingRight || "0") || 0;
    const availableWidth = Math.max(0, width - paddingLeft - paddingRight - 6);
    if (!availableWidth) {
      return this.truncateSingleLine(normalized, fallbackLimit);
    }

    const canvas = this._measureCanvas || (this._measureCanvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return this.truncateSingleLine(normalized, fallbackLimit);
    }

    const font = [
      computed.fontStyle,
      computed.fontWeight,
      computed.fontSize,
      computed.fontFamily
    ].filter(Boolean).join(" ");
    ctx.font = font || computed.font;

    if (ctx.measureText(normalized).width <= availableWidth) {
      return normalized;
    }

    const ellipsis = "...";
    if (ctx.measureText(ellipsis).width >= availableWidth) {
      return ellipsis;
    }

    let low = 0;
    let high = normalized.length;
    let best = 0;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = `${normalized.slice(0, middle).trimEnd()}${ellipsis}`;
      if (ctx.measureText(candidate).width <= availableWidth) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const preview = normalized.slice(0, best).trimEnd();
    return preview ? `${preview}${ellipsis}` : ellipsis;
  },

  clampDay(year, monthIndex, dayValue) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Math.max(1, Math.min(daysInMonth, Number(dayValue) || 1));
  },

  timeSince(isoString) {
    if (!isoString) {
      return "только что";
    }
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 60000) {
      return "только что";
    }
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) {
      return `${minutes} мин назад`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} ч назад`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
      return `${days} дн назад`;
    }
    return `${Math.floor(days / 30)} мес назад`;
  },

  normalizeDescription(text) {
    return String(text ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
  }
};

function defaultData() {
  return {
    meta: {
      version: CONFIG.APP_VERSION,
      updatedAt: Utils.nowISO()
    },
    profile: {
      theme: "dark",
      locale: "ru-RU",
      currency: "RUB"
    },
    settings: {
      categories: Utils.clone(DEFAULT_CATEGORIES),
      deletedPresetCategoryIds: [],
      templates: [],
      favorites: [],
      wishlist: [],
      goals: []
    },
    months: {},
    transactions: []
  };
}

function isLocalTestLogin(login) {
  return String(login || "") === LOCAL_TEST_CREDENTIALS.login;
}

function buildLocalTestData() {
  const now = Utils.nowISO();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const demoCategories = Utils.clone(DEFAULT_CATEGORIES).map((category) => ({
    ...category,
    limit: ({
      exp_food: 12000,
      exp_transport: 3500,
      exp_subscription: 3200,
      exp_marketplace: 7500,
      exp_games: 5200,
      exp_debt: 7000
    })[category.id] || category.limit
  }));
  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomAmount = (min, max, step = 10) => {
    const steps = Math.max(1, Math.round((max - min) / step));
    return Utils.roundMoney(min + randomInt(0, steps) * step);
  };
  const pick = (list) => list[randomInt(0, Math.max(0, list.length - 1))];
  const monthStart = (offset = 0) => new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const monthKeyFor = (offset = 0) => Utils.monthKey(monthStart(offset));
  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const makeDate = (date, day) => {
    const safeDay = Math.max(1, Math.min(day, daysInMonth(date)));
    return `${Utils.monthKey(date)}-${String(safeDay).padStart(2, "0")}`;
  };
  const tx = (id, type, flowKind, categoryId, amount, description, date, position = 0) => ({
    id,
    type,
    flowKind,
    categoryId,
    amount,
    description,
    date,
    position,
    createdAt: now,
    updatedAt: now
  });
  const templates = [
    {
      id: "tmpl_demo_subscription",
      desc: "Демо: пакет связи и домашний интернет",
      amount: 1490,
      categoryId: "exp_subscription",
      type: "expense",
      flowKind: "recurring"
    },
    {
      id: "tmpl_demo_debt",
      desc: "Демо: платеж по учебной рассрочке",
      amount: 4800,
      categoryId: "exp_debt",
      type: "expense",
      flowKind: "debt"
    },
    {
      id: "tmpl_demo_backup",
      desc: "Демо: перевод в резервную копилку",
      amount: 3500,
      categoryId: "inc_other",
      type: "income",
      flowKind: "standard"
    }
  ];
  const favorites = [
    {
      id: "fav_demo_coffee",
      desc: "Демо: кофе и перекус по дороге",
      amount: 320,
      categoryId: "exp_food",
      type: "expense",
      flowKind: "standard"
    },
    {
      id: "fav_demo_transport",
      desc: "Демо: метро и автобус",
      amount: 180,
      categoryId: "exp_transport",
      type: "expense",
      flowKind: "standard"
    },
    {
      id: "fav_demo_hobby",
      desc: "Демо: мелкая покупка для хобби",
      amount: 950,
      categoryId: "exp_fun",
      type: "expense",
      flowKind: "standard"
    }
  ];
  const wishlist = [
    { id: "wish_demo_chair", desc: "Демо: кресло цвета лайм", amount: randomAmount(22000, 33000, 100), position: 1, createdAt: now, updatedAt: now },
    { id: "wish_demo_projector", desc: "Демо: мини-проектор для кухни", amount: randomAmount(26000, 36000, 100), position: 2, createdAt: now, updatedAt: now },
    { id: "wish_demo_shelf", desc: "Демо: настенная полка-облако", amount: randomAmount(5500, 9800, 100), position: 3, createdAt: now, updatedAt: now }
  ];
  const goals = [
    { id: "goal_demo_reserve", name: "Демо: резервный фонд", target: randomAmount(80000, 120000, 500), saved: 0, mode: "balance", color: "#d2b356", note: "Показывает прогресс от свободного остатка месяца", position: 1, createdAt: now, updatedAt: now },
    { id: "goal_demo_laptop", name: "Демо: ноутбук для стенда", target: randomAmount(140000, 190000, 500), saved: randomAmount(28000, 65000, 500), mode: "saved", color: "#c239b3", note: "Ручная накопленная сумма для тестов", position: 2, createdAt: now, updatedAt: now }
  ];
  const months = {};
  const transactions = [];
  const salaryDescriptions = [
    "Демо: оклад от студии «Полярный банан»",
    "Демо: оклад от вымышленного продакшена «Северный лимон»",
    "Демо: оклад от тестовой мастерской «Громкий чайник»"
  ];
  const freelanceDescriptions = [
    "Демо: гонорар за редизайн вымышленной панели",
    "Демо: фриланс за набор лендингов для тестовой студии",
    "Демо: оплата за макеты иконок для демо-стенда"
  ];
  const bonusDescriptions = [
    "Демо: бонус за тестовый релиз",
    "Демо: премия за вымышленный спринт",
    "Демо: пополнение резервной копилки"
  ];
  const recurringDescriptions = [
    "Демо: связь, интернет и облачное хранилище",
    "Демо: пакет связи и домашний интернет",
    "Демо: домашний интернет и мобильная связь"
  ];
  const serviceDescriptions = [
    "Демо: подписка на сервис заметок",
    "Демо: подписка на музыкальный сервис",
    "Демо: подписка на облачный таск-трекер"
  ];
  const debtDescriptions = [
    "Демо: платеж по учебной рассрочке",
    "Демо: платеж по тестовой кредитной карте",
    "Демо: обязательный платеж по демонстрационной рассрочке"
  ];
  const expensePool = [
    { key: "food", categoryId: "exp_food", amount: () => randomAmount(380, 6100, 10), descriptions: ["Демо: кофе, булочка и фрукты для стенда", "Демо: продуктовая корзина для кухни", "Демо: заказ еды для длинного тестового дня"] },
    { key: "transport", categoryId: "exp_transport", amount: () => randomAmount(140, 980, 10), descriptions: ["Демо: метро и автобус по тестовому маршруту", "Демо: такси до офиса для проверки сценария", "Демо: проезд по демо-маршруту"] },
    { key: "market", categoryId: "exp_marketplace", amount: () => randomAmount(1100, 4200, 10), descriptions: ["Демо: заказ блокнотов и лампы", "Демо: маркетплейс, коробки и органайзер", "Демо: мелкие покупки для стенда"] },
    { key: "games", categoryId: "exp_games", amount: () => randomAmount(950, 3600, 10), descriptions: ["Демо: сезонный пропуск в вымышленной игре", "Демо: внутриигровая валюта для теста", "Демо: набор цифровых дополнений"] },
    { key: "home", categoryId: "exp_home", amount: () => randomAmount(1900, 7600, 10), descriptions: ["Демо: плед и коробки для хранения", "Демо: бытовые мелочи для квартиры", "Демо: домашний текстиль для тестовой сцены"] },
    { key: "health", categoryId: "exp_health", amount: () => randomAmount(450, 2200, 10), descriptions: ["Демо: аптечка и витамины", "Демо: профилактический набор лекарств", "Демо: базовые покупки для здоровья"] },
    { key: "team", categoryId: "exp_transfers", amount: () => randomAmount(900, 4200, 10), descriptions: ["Демо: общий ужин команды стенда", "Демо: перевод за совместный тестовый заказ", "Демо: вклад в вымышленную встречу команды"] },
    { key: "gifts", categoryId: "exp_gifts", amount: () => randomAmount(700, 3400, 10), descriptions: ["Демо: подарок коллеге из тестовой команды", "Демо: сувенир для вымышленного праздника", "Демо: праздничная мелочь для стенда"] },
    { key: "trip", categoryId: "exp_fun", amount: () => randomAmount(1200, 5200, 10), descriptions: ["Демо: бронирование жилья для поездки", "Демо: билеты на мини-поездку выходного дня", "Демо: кафе и прогулка во время тестовой поездки"] }
  ];

  [-1, 0, 1].forEach((offset, index) => {
    const baseDate = monthStart(offset);
    const monthKey = monthKeyFor(offset);
    const monthDays = daysInMonth(baseDate);
    const dateFor = (day) => makeDate(baseDate, day);
    let position = 1;
    const pushTx = (suffix, type, flowKind, categoryId, amount, description, day) => {
      transactions.push(
        tx(
          `tx_demo_${monthKey.replace("-", "_")}_${suffix}`,
          type,
          flowKind,
          categoryId,
          amount,
          description,
          dateFor(day),
          position
        )
      );
      position += 1;
    };
    const salaryDay = randomInt(3, Math.min(6, monthDays));
    const salaryAmount = randomAmount(38000, 62000, 50);
    const freelanceDay = randomInt(Math.min(8, monthDays), Math.min(17, monthDays));
    const reserveDay = randomInt(Math.min(18, monthDays), Math.min(26, monthDays));
    pushTx("salary", "income", "standard", "inc_salary", salaryAmount, pick(salaryDescriptions), salaryDay);
    pushTx("freelance", "income", "standard", Math.random() > 0.55 ? "inc_bonus" : "inc_freelance", randomAmount(6200, 16800, 50), pick(freelanceDescriptions), freelanceDay);
    if (Math.random() > 0.25) {
      pushTx("reserve", "income", "standard", "inc_other", randomAmount(2800, 9500, 50), pick(bonusDescriptions), reserveDay);
    }

    pushTx("recurring_main", "expense", "recurring", "exp_subscription", randomAmount(1290, 1890, 10), pick(recurringDescriptions), randomInt(2, Math.min(4, monthDays)));
    if (Math.random() > 0.38) {
      pushTx("recurring_extra", "expense", "recurring", "exp_services", randomAmount(290, 990, 10), pick(serviceDescriptions), randomInt(3, Math.min(6, monthDays)));
    }
    pushTx("debt_main", "expense", "debt", "exp_debt", randomAmount(3800, 6200, 10), pick(debtDescriptions), randomInt(3, Math.min(7, monthDays)));
    if (Math.random() > 0.45) {
      pushTx("debt_extra", "expense", "debt", "exp_debt", randomAmount(1200, 3400, 10), pick(debtDescriptions), randomInt(Math.min(11, monthDays), Math.min(20, monthDays)));
    }

    const standardDays = [4, 5, 9, 12, 15, 18, 22, 25, 27].filter((day) => day <= monthDays);
    const selectedExpenses = expensePool.slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, randomInt(6, 8));
    selectedExpenses.forEach((item, itemIndex) => {
      const day = standardDays[itemIndex % standardDays.length] || randomInt(4, monthDays);
      pushTx(
        `${item.key}_${itemIndex + 1}`,
          "expense",
          "standard",
          item.categoryId,
          item.amount(),
          pick(item.descriptions),
          day
        );
      });

    months[monthKey] = {
      start: index === 1 ? randomAmount(1800, 9000, 50) : randomAmount(0, 7000, 50),
      manualStart: index !== 2,
      updatedAt: now
    };
  });
  return normalizeData({
    meta: {
      version: CONFIG.APP_VERSION,
      updatedAt: now
    },
    profile: {
      theme: "dark",
      locale: "ru-RU",
      currency: "RUB"
    },
    settings: {
      categories: demoCategories,
      deletedPresetCategoryIds: [],
      templates,
      favorites,
      wishlist,
      goals
    },
    months,
    transactions
  });
}

function ensureDefaultMonthMeta(months, monthKey) {
  if (!months[monthKey]) {
    months[monthKey] = {
      start: 0,
      manualStart: false,
      updatedAt: Utils.nowISO()
    };
    return;
  }
  months[monthKey].updatedAt = months[monthKey].updatedAt || Utils.nowISO();
}

function normalizeMonthMeta(raw) {
  return {
    start: Math.max(0, Utils.roundMoney(Utils.safeNumber(raw?.start))),
    manualStart: Boolean(raw?.manualStart),
    updatedAt: raw?.updatedAt || Utils.nowISO()
  };
}

function mergeMonthMeta(remoteMeta, localMeta) {
  if (!remoteMeta && !localMeta) {
    return normalizeMonthMeta();
  }
  const remote = normalizeMonthMeta(remoteMeta);
  const local = normalizeMonthMeta(localMeta);
  return recordTimestamp({ updatedAt: local.updatedAt }) >= recordTimestamp({ updatedAt: remote.updatedAt })
    ? local
    : remote;
}

function normalizeCategory(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const name = String(raw.name ?? "").trim().slice(0, 48);
  if (!name) {
    return null;
  }
  return {
    id: String(raw.id ?? Utils.uid("cat")),
    name,
    type: raw.type === "income" ? "income" : "expense",
    color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(raw.color ?? "")) ? raw.color : "#58a6ff",
    limit: Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.limit))),
    preset: Boolean(raw.preset)
  };
}

function normalizeDeletedPresetCategoryIds(source) {
  const defaultIds = new Set(DEFAULT_CATEGORIES.map((category) => category.id));
  return Array.isArray(source)
    ? source.map((id) => String(id)).filter((id, index, list) => defaultIds.has(id) && list.indexOf(id) === index)
    : [];
}

function mergeCategories(...lists) {
  let options = {};
  if (
    lists.length &&
    lists[lists.length - 1] &&
    typeof lists[lists.length - 1] === "object" &&
    !Array.isArray(lists[lists.length - 1]) &&
    lists[lists.length - 1].__mergeOptions
  ) {
    options = lists.pop();
  }

  const deletedPresetCategoryIds = new Set(normalizeDeletedPresetCategoryIds(options.deletedPresetCategoryIds));
  const merged = [];
  const indexById = new Map();

  const push = (candidate, { preservePreset = false, preferExisting = false } = {}) => {
    const category = normalizeCategory(candidate);
    if (!category) {
      return;
    }
    const existingIndex = indexById.get(category.id);
    if (existingIndex !== undefined) {
      const previous = merged[existingIndex];
      merged[existingIndex] = {
        ...(preferExisting ? category : previous),
        ...(preferExisting ? previous : category),
        preset: preservePreset ? previous.preset || category.preset : category.preset
      };
      return;
    }
    merged.push(category);
    indexById.set(category.id, merged.length - 1);
  };

  lists.flat().forEach((candidate) => push(candidate, { preservePreset: true }));
  DEFAULT_CATEGORIES
    .filter((candidate) => !deletedPresetCategoryIds.has(candidate.id))
    .forEach((candidate) => push(candidate, { preservePreset: true, preferExisting: true }));

  return merged;
}

function findCategory(categories, categoryId) {
  return categories.find((category) => category.id === categoryId) || null;
}

function findCategoryIdByName(categories, type, name) {
  if (!name) {
    return null;
  }
  const aliasKeyMap = new Map([
    [Utils.normalizeLookupKey("\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0438 \u0438 \u0443\u0441\u043b\u0443\u0433\u0438"), Utils.normalizeLookupKey("\u0416\u041a\u0425+\u041c\u043e\u0431 + \u0418\u043d\u0435\u0442")],
    [Utils.normalizeLookupKey("\u0414\u043e\u043b\u0433\u0438 \u0438 \u043a\u0440\u0435\u0434\u0438\u0442\u044b"), Utils.normalizeLookupKey("\u0414\u043e\u043b\u0433\u0438")],
    [Utils.normalizeLookupKey("\u0414\u043e\u0441\u0443\u0433"), Utils.normalizeLookupKey("\u0420\u0430\u0437\u0432\u043b\u0435\u0447\u0435\u043d\u0438\u044f")],
    [Utils.normalizeLookupKey("\u0414\u043e\u043c"), Utils.normalizeLookupKey("\u0416\u0438\u043b\u044c\u0435")],
    [Utils.normalizeLookupKey("\u041f\u0440\u043e\u0447\u0435\u0435"), Utils.normalizeLookupKey("\u041f\u0440\u043e\u0447\u0438\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b")]
  ]);
  const rawNormalized = Utils.normalizeLookupKey(name);
  const exactMatch = categories.find((category) => {
    if (category.type !== type) {
      return false;
    }
    return Utils.normalizeLookupKey(category.name) === rawNormalized;
  });
  if (exactMatch) {
    return exactMatch.id;
  }

  const normalized = aliasKeyMap.get(rawNormalized) || rawNormalized;
  const aliasMatch = categories.find((category) => {
    if (category.type !== type) {
      return false;
    }
    const categoryKey = aliasKeyMap.get(Utils.normalizeLookupKey(category.name)) || Utils.normalizeLookupKey(category.name);
    return categoryKey === normalized;
  });
  return aliasMatch ? aliasMatch.id : null;
}

function ensureCategory(categories, type, name, color, limit = 0) {
  const existingId = findCategoryIdByName(categories, type, name);
  if (existingId) {
    return existingId;
  }
  const category = normalizeCategory({
    id: Utils.uid("cat"),
    name,
    type,
    color,
    limit,
    preset: false
  });
  categories.push(category);
  return category.id;
}

function normalizeTemplate(raw, categories) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const type = raw.type === "income" ? "income" : "expense";
  const desc = String(raw.desc ?? raw.description ?? "").trim().slice(0, 180);
  if (!desc) {
    return null;
  }
  let categoryId = String(raw.categoryId ?? "").trim();
  if (!categoryId) {
    categoryId = findCategoryIdByName(categories, type, legacyCategoryName(raw));
  }
  if (!categoryId) {
    categoryId = type === "income" ? "inc_other" : "exp_other";
  }
  return {
    id: String(raw.id ?? Utils.uid("tpl")),
    desc,
    amount: Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.amount))),
    type,
    categoryId,
    flowKind: raw.flowKind === "debt" || raw.flowKind === "recurring" ? raw.flowKind : "standard",
    bucket: normalizeTemplateBucket(raw.bucket, type, raw.flowKind),
    createdAt: raw.createdAt || Utils.nowISO(),
    updatedAt: raw.updatedAt || raw.createdAt || Utils.nowISO()
  };
}

function normalizeWishlistItem(raw, fallbackPosition = null) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const desc = String(raw.desc ?? raw.description ?? "").trim().slice(0, 180);
  const amount = Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.amount)));
  const hasDraftIdentity = raw.id != null || raw.position != null;
  if (!desc && !hasDraftIdentity && amount <= 0) {
    return null;
  }
  return {
    id: String(raw.id ?? Utils.uid("wish")),
    desc,
    amount,
    position: Number.isFinite(Number(raw.position))
      ? Number(raw.position)
      : (Number.isFinite(Number(fallbackPosition)) ? Number(fallbackPosition) : Date.now() + Math.random())
  };
}

function normalizeGoal(raw, fallbackPosition = null) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const name = String(raw.name ?? "").trim().slice(0, 64);
  const target = Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.target)));
  if (!name || !target) {
    return null;
  }
  const mode = ["balance", "saved"].includes(raw.mode) ? raw.mode : "balance";
  return {
    id: String(raw.id ?? Utils.uid("goal")),
    name,
    target,
    mode,
    saved: Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.saved))),
    note: String(raw.note ?? "").trim().slice(0, 180),
    color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(raw.color ?? "")) ? raw.color : "#58a6ff",
    position: Number.isFinite(Number(raw.position))
      ? Number(raw.position)
      : (Number.isFinite(Number(fallbackPosition)) ? Number(fallbackPosition) : Date.now() + Math.random()),
    createdAt: raw.createdAt || Utils.nowISO(),
    updatedAt: raw.updatedAt || Utils.nowISO()
  };
}

function recordTimestamp(value) {
  const stamp = new Date(value?.updatedAt || value?.createdAt || 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function pickPreferredRecord(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const leftStamp = recordTimestamp(left.record);
  const rightStamp = recordTimestamp(right.record);
  if (leftStamp !== rightStamp) {
    return rightStamp >= leftStamp ? right : left;
  }
  return right.index >= left.index ? right : left;
}

function buildTemplateSemanticKey(item, categories) {
  const category = findCategory(categories, item?.categoryId);
  return [
    normalizeTemplateBucket(item?.bucket, item?.type, item?.flowKind),
    item?.type || "",
    item?.flowKind || "standard",
    Utils.roundMoney(item?.amount || 0),
    Utils.normalizeLookupKey(item?.desc),
    Utils.normalizeLookupKey(category?.name || item?.categoryId || "")
  ].join("|");
}

function buildWishlistSemanticKey(item) {
  return [
    Utils.normalizeLookupKey(item?.desc),
    Utils.roundMoney(item?.amount || 0)
  ].join("|");
}

function buildTransactionSemanticKey(item, categories) {
  const category = findCategory(categories, item?.categoryId);
  return [
    item?.type || "",
    item?.flowKind || "standard",
    item?.date || "",
    Utils.roundMoney(item?.amount || 0),
    Utils.normalizeLookupKey(item?.description),
    Utils.normalizeLookupKey(category?.name || item?.categoryId || ""),
    Number.isFinite(Number(item?.position)) ? Number(item.position) : ""
  ].join("|");
}

function buildGoalSemanticKey(item) {
  return [
    Utils.normalizeLookupKey(item?.name),
    Utils.roundMoney(item?.target || 0),
    item?.mode || "balance",
    Utils.roundMoney(item?.saved || 0),
    Utils.normalizeLookupKey(item?.note || "")
  ].join("|");
}

function averageExpenseThreshold(items) {
  const expenses = (Array.isArray(items) ? items : []).filter((item) => item?.type === "expense");
  if (!expenses.length) {
    return 0;
  }
  return Utils.roundMoney(expenses.reduce((sum, item) => sum + Utils.safeNumber(item.amount), 0) / expenses.length);
}

// Когда один и тот же смысловой элемент приезжает из локального кэша и из облака с разными id,
// мы оставляем более свежую версию и не плодим дубли в интерфейсе и бэкапах.
function dedupeSemanticList(items, getSemanticKey) {
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (!item) {
      return;
    }
    const id = String(item.id ?? `__index_${index}`);
    const candidate = { record: item, index };
    byId.set(id, pickPreferredRecord(byId.get(id), candidate));
  });

  const byMeaning = new Map();
  Array.from(byId.values()).forEach((candidate, index) => {
    const semanticKey = getSemanticKey(candidate.record) || `__unique_${index}`;
    byMeaning.set(semanticKey, pickPreferredRecord(byMeaning.get(semanticKey), candidate));
  });

  return Array.from(byMeaning.values())
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.record);
}

function getTopInsertPosition(items, count = 1) {
  const positions = Array.isArray(items)
    ? items.map((item) => Number(item?.position)).filter((value) => Number.isFinite(value))
    : [];
  if (!positions.length) {
    return 1;
  }
  return Math.min(...positions) - Math.max(1, count);
}

function getBottomInsertPosition(items, count = 1) {
  const positions = Array.isArray(items)
    ? items.map((item) => Number(item?.position)).filter((value) => Number.isFinite(value))
    : [];
  if (!positions.length) {
    return 1;
  }
  return Math.max(...positions) + Math.max(1, count);
}

function normalizeTransaction(raw, categories) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const type = raw.type === "income" ? "income" : "expense";
  const amount = Math.max(0, Utils.roundMoney(Utils.safeNumber(raw.amount)));
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  let categoryId = String(raw.categoryId ?? "").trim();
  if (!categoryId) {
    categoryId = findCategoryIdByName(categories, type, legacyCategoryName(raw));
  }
  if (!findCategory(categories, categoryId)) {
    categoryId = type === "income" ? "inc_other" : "exp_other";
  }

  return {
    id: String(raw.id ?? Utils.uid("tx")),
    type,
    flowKind: raw.flowKind === "debt" || raw.flowKind === "recurring" ? raw.flowKind : "standard",
    amount,
    categoryId,
    description: String(raw.description ?? raw.desc ?? "").trim().slice(0, 200),
    date: Utils.isISODate(raw.date) ? raw.date : Utils.todayISO(),
    position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : new Date(raw.createdAt || Utils.nowISO()).getTime() + Math.random(),
    createdAt: raw.createdAt || Utils.nowISO(),
    updatedAt: raw.updatedAt || Utils.nowISO()
  };
}

function legacyCategoryKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function legacyCategoryName(item) {
  return String(item?.category ?? item?.tag ?? "").trim();
}

function collectLegacyCategoryUsage(raw) {
  const usage = {
    income: new Set(),
    expense: new Set()
  };

  Object.entries(raw || {})
    .filter(([key]) => /^\d{4}-\d{2}$/.test(key))
    .forEach(([, monthData]) => {
      ["incomes"].forEach((section) => {
        (monthData?.[section] || []).forEach((item) => {
          const key = legacyCategoryKey(legacyCategoryName(item));
          if (key) {
            usage.income.add(key);
          }
        });
      });

      ["expenses", "debts", "recurring"].forEach((section) => {
        (monthData?.[section] || []).forEach((item) => {
          const key = legacyCategoryKey(legacyCategoryName(item));
          if (key) {
            usage.expense.add(key);
          }
        });
      });
    });

  return usage;
}

function inferLegacyCategoryType(rawCategory, usage) {
  if (rawCategory?.type === "income" || rawCategory?.type === "expense") {
    return rawCategory.type;
  }
  const id = String(rawCategory?.id ?? "").toLowerCase();
  if (id.startsWith("inc_")) {
    return "income";
  }
  if (id.startsWith("exp_")) {
    return "expense";
  }
  const key = legacyCategoryKey(rawCategory?.name);
  if (key && usage.income.has(key) && !usage.expense.has(key)) {
    return "income";
  }
  return "expense";
}

function summarizeNormalizedData(data) {
  return {
    months: Object.keys(data?.months || {}).length,
    transactions: Array.isArray(data?.transactions) ? data.transactions.length : 0,
    categories: Array.isArray(data?.settings?.categories) ? data.settings.categories.length : 0,
    templates: Array.isArray(data?.settings?.templates) ? data.settings.templates.length : 0,
    favorites: Array.isArray(data?.settings?.favorites) ? data.settings.favorites.length : 0,
    wishlist: Array.isArray(data?.settings?.wishlist) ? data.settings.wishlist.length : 0,
    goals: Array.isArray(data?.settings?.goals) ? data.settings.goals.length : 0
  };
}

function summarizeMeaningfulUserData(data) {
  const normalized = normalizeData(data);
  const customCategories = Array.isArray(normalized?.settings?.categories)
    ? normalized.settings.categories.filter((item) => !item.preset).length
    : 0;
  const deletedPresetCategoryIds = Array.isArray(normalized?.settings?.deletedPresetCategoryIds)
    ? normalized.settings.deletedPresetCategoryIds.length
    : 0;
  const manualMonths = Object.values(normalized?.months || {}).filter((item) => {
    const start = Utils.roundMoney(item?.start || 0);
    return Boolean(item?.manualStart) || start !== 0;
  }).length;

  return {
    transactions: Array.isArray(normalized?.transactions) ? normalized.transactions.length : 0,
    customCategories,
    deletedPresetCategoryIds,
    templates: Array.isArray(normalized?.settings?.templates) ? normalized.settings.templates.length : 0,
    favorites: Array.isArray(normalized?.settings?.favorites) ? normalized.settings.favorites.length : 0,
    wishlist: Array.isArray(normalized?.settings?.wishlist) ? normalized.settings.wishlist.length : 0,
    goals: Array.isArray(normalized?.settings?.goals) ? normalized.settings.goals.length : 0,
    manualMonths
  };
}

function summarizeLegacyBackup(raw) {
  const monthKeys = Object.keys(raw || {}).filter((key) => /^\d{4}-\d{2}$/.test(key));
  return {
    months: monthKeys.length,
    categories: Array.isArray(raw?.settings?.categories) ? raw.settings.categories.length : 0,
    templates: Array.isArray(raw?.settings?.templates) ? raw.settings.templates.length : 0,
    favorites: Array.isArray(raw?.settings?.favorites) ? raw.settings.favorites.length : 0,
    wishlist: Array.isArray(raw?.wishlist) ? raw.wishlist.length : 0,
    goals: Array.isArray(raw?.settings?.goals) ? raw.settings.goals.length : 0
  };
}

function diffDataSummaries(currentSummary, nextSummary) {
  return Object.keys(currentSummary).reduce((acc, key) => {
    acc[key] = (nextSummary[key] || 0) - (currentSummary[key] || 0);
    return acc;
  }, {});
}

function findFirstDiffPath(left, right, basePath = "") {
  if (Object.is(left, right)) {
    return null;
  }
  if (typeof left !== typeof right) {
    return basePath || "(root)";
  }
  if (left === null || right === null) {
    return basePath || "(root)";
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return `${basePath || "(root)"}[length]`;
    }
    for (let index = 0; index < left.length; index += 1) {
      const nested = findFirstDiffPath(left[index], right[index], `${basePath}[${index}]`);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  if (typeof left === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!(key in left) || !(key in right)) {
        return basePath ? `${basePath}.${key}` : key;
      }
      const nested = findFirstDiffPath(left[key], right[key], basePath ? `${basePath}.${key}` : key);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  return basePath || "(root)";
}

function hasMeaningfulData(data) {
  // Здесь считаем именно пользовательское наполнение, а не встроенные дефолтные категории.
  // Иначе пустой guest-state выглядел как "не пустой", что ломало сценарий login после локального test-аккаунта.
  const summary = summarizeMeaningfulUserData(data);
  return Object.values(summary).some((value) => Number(value) > 0);
}

function comparableDataSignature(raw) {
  const data = normalizeData(raw);
  const categories = new Map(data.settings.categories.map((item) => [item.id, item]));
  const signature = {
    profile: {
      theme: data.profile.theme
    },
    categories: data.settings.categories
      .map((item) => ({
        name: item.name,
        type: item.type,
        color: item.color,
        limit: Utils.roundMoney(item.limit)
      }))
      .sort((a, b) => a.type.localeCompare(b.type, "ru") || a.name.localeCompare(b.name, "ru")),
    templates: data.settings.templates
      .map((item) => ({
        bucket: normalizeTemplateBucket(item.bucket, item.type, item.flowKind),
        desc: item.desc,
        amount: Utils.roundMoney(item.amount),
        category: categories.get(item.categoryId)?.name || "",
        type: item.type,
        flowKind: item.flowKind
      }))
      .sort((a, b) => a.desc.localeCompare(b.desc, "ru") || a.amount - b.amount),
    favorites: data.settings.favorites
      .map((item) => ({
        desc: item.desc,
        amount: Utils.roundMoney(item.amount),
        category: categories.get(item.categoryId)?.name || "",
        type: item.type,
        flowKind: item.flowKind
      }))
      .sort((a, b) => a.desc.localeCompare(b.desc, "ru") || a.amount - b.amount),
    goals: (data.settings.goals || [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((item) => ({
        name: item.name,
        target: Utils.roundMoney(item.target),
        mode: item.mode,
        saved: Utils.roundMoney(item.saved),
        color: item.color,
        note: item.note || ""
      })),
    wishlist: data.settings.wishlist
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((item) => ({
        desc: item.desc,
        amount: Utils.roundMoney(item.amount)
      })),
    months: {}
  };

  Object.keys(data.months)
    .sort()
    .forEach((monthKey) => {
      const transactions = data.transactions
        .filter((item) => item.date.startsWith(monthKey))
        .slice()
        .sort((a, b) => Number(a.position) - Number(b.position));
      signature.months[monthKey] = {
        start: Utils.roundMoney(data.months[monthKey]?.start || 0),
        manualStart: Boolean(data.months[monthKey]?.manualStart),
        incomes: [],
        debts: [],
        recurring: [],
        expenses: []
      };
      transactions.forEach((item) => {
        const bucket = item.type === "income"
          ? "incomes"
          : (item.flowKind === "debt" ? "debts" : (item.flowKind === "recurring" ? "recurring" : "expenses"));
        signature.months[monthKey][bucket].push({
          day: Number(item.date.slice(-2)),
          amount: Utils.roundMoney(item.amount),
          desc: item.description,
          category: categories.get(item.categoryId)?.name || "",
          position: Number(item.position)
        });
      });
    });

  return JSON.stringify(signature);
}

function isSemanticallySameData(left, right) {
  return comparableDataSignature(left) === comparableDataSignature(right);
}

function validateBackupPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Файл бэкапа должен содержать JSON-объект.");
  }

  const legacy = isLegacyBackupShape(raw);
  const current = Array.isArray(raw.transactions) || raw.profile || raw.settings || raw.months;

  if (!legacy && !current) {
    throw new Error("Не удалось распознать формат бэкапа.");
  }

  const summary = legacy
    ? summarizeLegacyBackup(raw)
    : {
        months: Object.keys(raw?.months || {}).length,
        transactions: Array.isArray(raw?.transactions) ? raw.transactions.length : 0,
        categories: Array.isArray(raw?.settings?.categories) ? raw.settings.categories.length : 0,
        templates: Array.isArray(raw?.settings?.templates) ? raw.settings.templates.length : 0,
        favorites: Array.isArray(raw?.settings?.favorites) ? raw.settings.favorites.length : 0,
        wishlist: Array.isArray(raw?.settings?.wishlist) ? raw.settings.wishlist.length : 0,
        goals: Array.isArray(raw?.settings?.goals) ? raw.settings.goals.length : 0
      };
  const totalItems = Object.values(summary).reduce((sum, value) => sum + value, 0);

  if (totalItems === 0) {
    throw new Error("Бэкап пустой и не содержит данных для импорта.");
  }

  return {
    format: legacy ? "legacy" : "current",
    summary
  };
}

function isLegacyBackupShape(data) {
  return data && typeof data === "object" && !Array.isArray(data.transactions) && Object.keys(data).some((key) => /^\d{4}-\d{2}$/.test(key));
}

function migrateLegacyBackup(raw) {
  const base = defaultData();
  const legacyUsage = collectLegacyCategoryUsage(raw);
  const deletedPresetCategoryIds = normalizeDeletedPresetCategoryIds(raw?.settings?.deletedPresetCategoryIds);
  const categories = mergeCategories(
    Array.isArray(raw?.settings?.categories)
      ? raw.settings.categories.map((item) => ({
          id: item.id || Utils.uid("cat"),
          name: item.name,
          type: inferLegacyCategoryType(item, legacyUsage),
          color: item.color,
          limit: item.limit || 0,
          preset: false
        }))
      : [],
    { __mergeOptions: true, deletedPresetCategoryIds }
  );

  const next = {
    meta: {
      version: CONFIG.APP_VERSION,
      updatedAt: Utils.nowISO()
    },
    profile: {
      theme: raw?.settings?.theme === "light" ? "light" : "dark",
      locale: "ru-RU",
      currency: "RUB"
    },
    settings: {
      categories,
      deletedPresetCategoryIds,
      templates: [],
      favorites: [],
      wishlist: [],
      goals: []
    },
    months: {},
    transactions: []
  };

  next.settings.templates = Array.isArray(raw?.settings?.templates)
    ? raw.settings.templates.map((item) => normalizeTemplate(item, categories)).filter(Boolean)
    : [];
  next.settings.favorites = Array.isArray(raw?.settings?.favorites)
    ? raw.settings.favorites.map((item) => normalizeTemplate(item, categories)).filter(Boolean)
    : [];
  next.settings.wishlist = Array.isArray(raw?.wishlist)
    ? raw.wishlist.map((item, index) => normalizeWishlistItem(item, index + 1)).filter(Boolean)
    : [];
  next.settings.goals = Array.isArray(raw?.settings?.goals)
    ? raw.settings.goals.map((item, index) => normalizeGoal(item, index + 1)).filter(Boolean)
    : [];

  const pushLegacyItems = (monthKey, items, type, flowKind, fallbackCategory) => {
    if (!Array.isArray(items)) {
      return;
    }
    const [yearString, monthString] = monthKey.split("-");
    const year = Number(yearString);
    const monthIndex = Number(monthString) - 1;
    items.forEach((item, index) => {
      const day = Utils.clampDay(year, monthIndex, item.day);
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      const categoryName = String(legacyCategoryName(item) || fallbackCategory).trim() || fallbackCategory;
      const categoryId = ensureCategory(categories, type, categoryName, undefined, 0);
      const transaction = normalizeTransaction(
        {
          id: item.id || Utils.uid("legacy"),
          type,
          flowKind,
          amount: item.amount,
          categoryId,
          description: item.desc || "",
          date,
          position: Number.isFinite(Number(item.position)) ? Number(item.position) : index + 1,
          createdAt: item.createdAt || new Date(`${date}T12:00:00`).toISOString(),
          updatedAt: item.updatedAt || Utils.nowISO()
        },
        categories
      );
      if (transaction) {
        next.transactions.push(transaction);
      }
    });
  };

  Object.entries(raw || {})
    .filter(([key]) => /^\d{4}-\d{2}$/.test(key))
    .forEach(([monthKey, monthData]) => {
      next.months[monthKey] = normalizeMonthMeta(monthData);
      pushLegacyItems(monthKey, monthData?.incomes, "income", "standard", "Зарплата");
      pushLegacyItems(monthKey, monthData?.expenses, "expense", "standard", "Прочие расходы");
      pushLegacyItems(monthKey, monthData?.debts, "expense", "debt", "Долги");
      pushLegacyItems(monthKey, monthData?.recurring, "expense", "recurring", "ЖКХ+Моб + Инет");
    });

  next.transactions.sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));
  return next;
}

function normalizeData(raw) {
  if (isLegacyBackupShape(raw)) {
    return migrateLegacyBackup(raw);
  }

  const base = defaultData();
  const profile = raw?.profile && typeof raw.profile === "object" ? raw.profile : {};
  const deletedPresetCategoryIds = normalizeDeletedPresetCategoryIds(raw?.settings?.deletedPresetCategoryIds);
  const categories = mergeCategories(raw?.settings?.categories, { __mergeOptions: true, deletedPresetCategoryIds });
  const months = {};
  Object.entries(raw?.months || {}).forEach(([monthKey, monthMeta]) => {
    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      months[monthKey] = normalizeMonthMeta(monthMeta);
    }
  });

  const rawTransactions = Array.isArray(raw?.transactions)
    ? raw.transactions.map((item) => normalizeTransaction(item, categories)).filter(Boolean)
    : [];
  const transactions = dedupeSemanticList(rawTransactions, (item) => buildTransactionSemanticKey(item, categories));

  transactions.forEach((transaction) => ensureDefaultMonthMeta(months, transaction.date.slice(0, 7)));

  const templates = dedupeSemanticList(
    Array.isArray(raw?.settings?.templates)
      ? raw.settings.templates.map((item) => normalizeTemplate(item, categories)).filter(Boolean)
      : [],
    (item) => buildTemplateSemanticKey(item, categories)
  );
  const favorites = dedupeSemanticList(
    Array.isArray(raw?.settings?.favorites)
      ? raw.settings.favorites.map((item) => normalizeTemplate(item, categories)).filter(Boolean)
      : [],
    (item) => buildTemplateSemanticKey(item, categories)
  );
  const wishlist = dedupeSemanticList(
    Array.isArray(raw?.settings?.wishlist)
      ? raw.settings.wishlist.map((item, index) => normalizeWishlistItem(item, index + 1)).filter(Boolean)
      : [],
    (item) => buildWishlistSemanticKey(item)
  );
  const goals = dedupeSemanticList(
    Array.isArray(raw?.settings?.goals)
      ? raw.settings.goals.map((item, index) => normalizeGoal(item, index + 1)).filter(Boolean)
      : [],
    (item) => buildGoalSemanticKey(item)
  );

  return {
    meta: {
      version: CONFIG.APP_VERSION,
      updatedAt: raw?.meta?.updatedAt || base.meta.updatedAt
    },
    profile: {
      theme: profile.theme === "light" ? "light" : "dark",
      locale: "ru-RU",
      currency: "RUB"
    },
    settings: {
      categories,
      deletedPresetCategoryIds,
      templates,
      favorites,
      wishlist,
      goals
    },
    months,
    transactions: transactions.sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`))
  };
}

function mergeData(remoteRaw, localRaw) {
  const remote = normalizeData(remoteRaw);
  const local = normalizeData(localRaw);
  const deletedPresetCategoryIds = normalizeDeletedPresetCategoryIds([
    ...(remote.settings.deletedPresetCategoryIds || []),
    ...(local.settings.deletedPresetCategoryIds || [])
  ]);
  const categories = mergeCategories(
    remote.settings.categories,
    local.settings.categories,
    { __mergeOptions: true, deletedPresetCategoryIds }
  );
  const transactions = dedupeSemanticList(
    [...remote.transactions, ...local.transactions].map((tx) => normalizeTransaction(tx, categories)).filter(Boolean),
    (item) => buildTransactionSemanticKey(item, categories)
  );

  // Для offline-first логики месячные метаданные тоже объединяем по свежести,
  // чтобы ручной старт месяца не затирался более старой версией из другого источника.
  const months = {};
  const monthKeys = new Set([...Object.keys(remote.months || {}), ...Object.keys(local.months || {})]);
  monthKeys.forEach((monthKey) => {
    months[monthKey] = mergeMonthMeta(remote.months?.[monthKey], local.months?.[monthKey]);
  });
  transactions.forEach((tx) => ensureDefaultMonthMeta(months, tx.date.slice(0, 7)));

  return normalizeData({
    meta: {
      version: CONFIG.APP_VERSION,
      updatedAt: new Date(Math.max(new Date(remote.meta.updatedAt).getTime(), new Date(local.meta.updatedAt).getTime(), Date.now())).toISOString()
    },
    profile: {
      theme: new Date(local.meta.updatedAt).getTime() >= new Date(remote.meta.updatedAt).getTime() ? local.profile.theme : remote.profile.theme
    },
    settings: {
      categories,
      deletedPresetCategoryIds,
      templates: dedupeSemanticList(
        [...remote.settings.templates, ...local.settings.templates],
        (item) => buildTemplateSemanticKey(item, categories)
      ),
      favorites: dedupeSemanticList(
        [...remote.settings.favorites, ...local.settings.favorites],
        (item) => buildTemplateSemanticKey(item, categories)
      ),
      wishlist: dedupeSemanticList(
        [...remote.settings.wishlist, ...local.settings.wishlist],
        (item) => buildWishlistSemanticKey(item)
      ),
      goals: dedupeSemanticList(
        [...(remote.settings.goals || []), ...(local.settings.goals || [])],
        (item) => buildGoalSemanticKey(item)
      )
    },
    months,
    transactions
  });
}

