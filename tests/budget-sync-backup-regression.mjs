import fs from "node:fs";
import vm from "node:vm";

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function loadAppContext() {
  const consoleLines = [];
  const diagnostics = [];
  const storage = new Map();
  const context = {
    console: {
      log: (...args) => consoleLines.push(["log", ...args]),
      info: (...args) => consoleLines.push(["info", ...args]),
      warn: (...args) => consoleLines.push(["warn", ...args]),
      error: (...args) => consoleLines.push(["error", ...args]),
      groupCollapsed: (...args) => consoleLines.push(["group", ...args]),
      groupEnd: () => consoleLines.push(["groupEnd"])
    },
    window: {},
    document: {},
    navigator: { onLine: true },
    localStorage: {
      getItem: () => null
    },
    CONFIG: {
      API_BASE: "https://personal-budget-api.bonaqu.workers.dev",
      APP_VERSION: 3,
      CACHE_PREFIX: "budget_flow_ru_cache_",
      LAST_SYNC_PREFIX: "budget_flow_ru_last_sync_"
    },
    Diagnostics: {
      report(label, payload, level = "info") {
        diagnostics.push({ label, payload, level });
      }
    },
    setTimeout,
    clearTimeout,
    AbortController,
    structuredClone,
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    JSON,
    RegExp,
    Error,
    TypeError,
    SyntaxError
  };

  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync("scripts/01-core.js", "utf8")}
this.Utils = Utils;
this.normalizeData = normalizeData;
this.mergeData = mergeData;
this.defaultData = defaultData;
this.comparableDataSignature = comparableDataSignature;
this.validateBackupPayload = validateBackupPayload;
this.summarizeNormalizedData = summarizeNormalizedData;
this.normalizeTemplateBucket = normalizeTemplateBucket;`, context, { filename: "01-core.js" });

  context.Storage = {
    saveCache(login, data) {
      storage.set(`cache:${login || "guest"}`, context.normalizeData(data));
    },
    loadCache(login) {
      return context.normalizeData(storage.get(`cache:${login || "guest"}`) || context.defaultData());
    },
    saveLastSync(login, value) {
      storage.set(`last:${login}`, value);
    },
    loadLastSync(login) {
      return storage.get(`last:${login}`) || null;
    },
    savePending(value) {
      storage.set("pending", value);
    },
    loadPending() {
      return storage.get("pending") || null;
    },
    clearPending() {
      storage.delete("pending");
    }
  };
  context.Auth = {
    login: "qa",
    authenticated: false,
    isAuthenticated() {
      return this.authenticated;
    },
    getLogin() {
      return this.login;
    }
  };
  context.Sync = {
    queueCalls: 0,
    queueSync() {
      this.queueCalls += 1;
    }
  };
  context.UI = {
    renderDataState() {},
    renderApp() {}
  };

  vm.runInContext(`${fs.readFileSync("scripts/03-api.js", "utf8")}
this.Api = Api;`, context, { filename: "03-api.js" });
  vm.runInContext(`${fs.readFileSync("scripts/04-store.js", "utf8")}
this.Store = Store;`, context, { filename: "04-store.js" });

  return { context, consoleLines, diagnostics, storage };
}

function loadSyncContext() {
  const storage = new Map();
  const timers = [];
  const saves = [];
  const context = {
    console,
    window: {
      addEventListener() {}
    },
    navigator: { onLine: true },
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout() {},
    Storage: {
      savePending(value) {
        storage.set("pending", value);
      },
      loadPending() {
        return storage.get("pending") || null;
      },
      clearPending() {
        storage.delete("pending");
      },
      saveLastSync(login, value) {
        storage.set(`last:${login}`, value);
      },
      loadLastSync(login) {
        return storage.get(`last:${login}`) || null;
      }
    },
    Auth: {
      login: "qa",
      token: "token",
      authenticated: true,
      isAuthenticated() {
        return this.authenticated;
      },
      isLocalOnly() {
        return false;
      },
      getLogin() {
        return this.login;
      },
      getToken() {
        return this.token;
      },
      touchSession() {}
    },
    UI: {
      renders: 0,
      renderSyncState() {
        this.renders += 1;
      }
    },
    Api: {
      async save(login, token, data) {
        saves.push({ login, token, data });
      },
      async probeConnection() {
        return { ok: true };
      },
      createError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
      },
      getFriendlyMessage(error, fallback) {
        return error?.message || fallback;
      },
      isAuthSessionError() {
        return false;
      },
      isRetryable() {
        return false;
      }
    },
    Diagnostics: {
      report() {}
    },
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON
  };

  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync("scripts/01-core.js", "utf8")}
this.Utils = Utils;
this.normalizeData = normalizeData;
this.defaultData = defaultData;`, context, { filename: "01-core.js" });
  context.Store = { data: context.defaultData() };
  vm.runInContext(`${fs.readFileSync("scripts/05-sync.js", "utf8")}
this.Sync = Sync;`, context, { filename: "05-sync.js" });

  return { context, storage, timers, saves };
}

function buildBudgetData(ctx) {
  return ctx.normalizeData({
    profile: { theme: "dark" },
    settings: {
      categories: [
        { id: "custom_tools", name: "Инструменты", type: "expense", color: "#0ea5e9", limit: 1200 }
      ],
      templates: [
        {
          id: "tpl_wrong_debt",
          bucket: "recurring",
          desc: "Платеж из старого шаблона",
          amount: 100,
          type: "income",
          flowKind: "standard",
          categoryId: "inc_salary"
        }
      ],
      favorites: [
        {
          id: "fav_food",
          desc: "Покупка из избранного",
          amount: 250,
          type: "expense",
          flowKind: "standard",
          categoryId: "exp_food"
        }
      ],
      wishlist: [{ id: "wish_1", desc: "Монитор", amount: 12000, position: 1 }],
      goals: [{ id: "goal_1", name: "Резерв", target: 50000, mode: "balance", saved: 0, color: "#58a6ff" }]
    },
    months: {
      "2026-01": { start: 1000, manualStart: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      "2026-02": { start: 0, manualStart: false, updatedAt: "2026-02-01T00:00:00.000Z" },
      "2026-03": { start: -250, manualStart: true, updatedAt: "2026-03-01T00:00:00.000Z" }
    },
    transactions: [
      { id: "jan_income", type: "income", flowKind: "standard", amount: 500, categoryId: "inc_salary", description: "Доход январь", date: "2026-01-05", position: 1 },
      { id: "jan_food", type: "expense", flowKind: "standard", amount: 200, categoryId: "exp_food", description: "Еда январь", date: "2026-01-08", position: 2 },
      { id: "feb_income", type: "income", flowKind: "standard", amount: 400, categoryId: "inc_salary", description: "Доход февраль", date: "2026-02-05", position: 1 },
      { id: "feb_debt", type: "expense", flowKind: "debt", amount: 300, categoryId: "exp_debt", description: "Долг февраль", date: "2026-02-10", position: 2 },
      { id: "mar_income", type: "income", flowKind: "standard", amount: 100, categoryId: "inc_salary", description: "Доход март", date: "2026-03-03", position: 1 },
      { id: "mar_recurring", type: "expense", flowKind: "recurring", amount: 50, categoryId: "exp_subscription", description: "Связь март", date: "2026-03-04", position: 2 }
    ]
  });
}

async function testFriendlyMessagesAndTechnicalLogs(ctx, consoleLines) {
  const messages = [
    ctx.Api.getFriendlyMessage(ctx.Api.createError("NETWORK_UNAVAILABLE", "raw")),
    ctx.Api.getFriendlyMessage(ctx.Api.createError("TIMEOUT", "raw")),
    ctx.Api.getFriendlyMessage(ctx.Api.createError("HTTP_404", "raw", { status: 404 })),
    ctx.Api.getFriendlyMessage(ctx.Api.createError("HTTP_503", "raw", { status: 503 }))
  ];
  messages.forEach((message) => {
    assert(!/API|Workers|CORS|NETWORK|HTTP|endpoint/i.test(message), "User-facing error message must stay non-technical", {
      message
    });
  });

  ctx.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await ctx.Api.request("/load?login=secret-user", "GET").catch(() => {});
  const line = consoleLines.find((entry) => String(entry[1] || "").includes("[Budget API] request failed"));
  assert(line, "Technical API failure must be logged to console as a single line", { consoleLines });
  const text = String(line[1]);
  assert(text.includes("code=NETWORK_UNAVAILABLE"), "Technical log must include machine-readable code", { text });
  assert(text.includes("endpoint=/load?login=[hidden]"), "Technical log must redact login in endpoint", { text });
  assert(!text.includes("secret-user"), "Technical log must not expose login value", { text });
}

function testBudgetMathSyncAndBackup(ctx) {
  const data = buildBudgetData(ctx);
  ctx.Store.viewMonth = "2026-02";
  ctx.Store.setData(data, { save: false });

  const jan = ctx.Store.statsForMonth("2026-01");
  const feb = ctx.Store.statsForMonth("2026-02");
  const mar = ctx.Store.statsForMonth("2026-03");
  assert(money(jan.startBalance) === 1000 && money(jan.finalBalance) === 1300, "January budget totals must be correct", jan);
  assert(money(feb.startBalance) === 1300 && money(feb.finalBalance) === 1400, "Auto month start must carry previous final balance", feb);
  assert(money(mar.startBalance) === -250 && money(mar.finalBalance) === -200, "Manual negative start must be preserved", mar);

  const remote = ctx.normalizeData({
    months: {
      "2026-02": { start: 777, manualStart: true, updatedAt: "2026-02-01T00:00:00.000Z" }
    },
    transactions: data.transactions.filter((item) => item.date.startsWith("2026-02"))
  });
  const local = ctx.normalizeData({
    transactions: data.transactions.filter((item) => item.date.startsWith("2026-02"))
  });
  const merged = ctx.mergeData(remote, local);
  assert(merged.months["2026-02"].manualStart === true && money(merged.months["2026-02"].start) === 777, "Cloud manual month start must survive sync merge", merged.months["2026-02"]);

  const backup = ctx.Store.exportLegacyBackup();
  assert(backup["2026-03"].manualStart === true && money(backup["2026-03"].start) === -250, "Backup must include manual negative month start", backup["2026-03"]);
  const restored = ctx.normalizeData(backup);
  assert(ctx.comparableDataSignature(restored) === ctx.comparableDataSignature(ctx.Store.data), "Backup roundtrip must preserve comparable budget data");

  ctx.Auth.authenticated = true;
  ctx.Sync.queueCalls = 0;
  ctx.Store.importBackup(backup);
  assert(ctx.Sync.queueCalls > 0, "Importing backup while authenticated must queue cloud sync");

  ctx.Store.viewMonth = "2026-04";
  ctx.Store.setData(data, { save: false });
  ctx.Store.applyTemplateSelection(["tpl_wrong_debt"], "debt");
  const addedDebt = ctx.Store.getSectionTransactions("debts", "2026-04")[0];
  assert(addedDebt?.type === "expense" && addedDebt?.flowKind === "debt" && addedDebt?.categoryId === "exp_debt", "Template selection must add operation to the clicked budget group", addedDebt);
}

async function testSyncKeepsPendingFollowUpQueued() {
  const { context, timers, saves } = loadSyncContext();
  const firstPending = {
    login: "qa",
    token: "token",
    updatedAt: "2026-06-01T10:00:00.000Z",
    data: context.normalizeData({ profile: { theme: "dark" } })
  };
  const followUpPending = {
    login: "qa",
    token: "token",
    updatedAt: "2026-06-01T10:00:01.000Z",
    data: context.normalizeData({ profile: { theme: "light" } })
  };

  context.Storage.savePending(firstPending);
  context.Api.save = async (login, token, data) => {
    saves.push({ login, token, data });
    context.Storage.savePending(followUpPending);
  };

  await context.Sync.processQueue();

  assert(saves.length === 1, "Sync must save the first queued change", saves);
  assert(context.Storage.loadPending()?.updatedAt === followUpPending.updatedAt, "Newer queued change must remain pending", context.Storage.loadPending());
  assert(context.Sync.status === "syncing", "Sync status must not turn green while a newer change is still queued", {
    status: context.Sync.status
  });
  assert(timers.some((timer) => timer.delay === 120), "Sync must schedule a follow-up send for newer pending data", timers);
}

async function main() {
  const { context, consoleLines } = loadAppContext();
  await testFriendlyMessagesAndTechnicalLogs(context, consoleLines);
  testBudgetMathSyncAndBackup(context);
  await testSyncKeepsPendingFollowUpQueued();
  console.log(JSON.stringify({
    ok: true,
    checks: [
      "friendly-error-messages",
      "technical-console-log",
      "sync-merge-manual-month-start",
      "backup-roundtrip",
      "budget-month-carryover",
      "template-target-bucket",
      "sync-follow-up-pending"
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    details: error.details || null
  }, null, 2));
  process.exitCode = 1;
});
