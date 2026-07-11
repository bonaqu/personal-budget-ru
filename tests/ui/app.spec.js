const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

async function loginDemo(page) {
  await page.goto("/");
  await page.locator("#startupLogin").fill("test1234");
  await page.locator("#startupPassword").fill("test1234");
  await page.locator("#startupLoginBtn").click();
  await expect(page.locator("#appShell")).toBeVisible();
}

test("auth and recovery dialogs have usable semantics", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#authScreen")).toBeVisible();
  await page.locator("#startupRecoverBtn").click();
  const dialog = page.locator("#passwordRecoveryModal .modal__dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-labelledby", "passwordRecoveryTitle");
  await expect(page.locator("#authScreen")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("demo clearly resets and layouts do not overflow", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginDemo(page);
  await page.locator("#accountBtn").click();
  await expect(page.locator("#accountMenuState")).toContainText("автоматически сбрасываются");
  await expect(page.locator("#demoResetBtn")).toBeVisible();
  await page.locator("#accountMenuModal .modal__backdrop").click({ position: { x: 4, y: 4 } });

  for (const width of [320, 360, 390, 430, 768, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 430 ? 780 : 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    if (width <= 430) {
      const undersizedActions = await page.locator("button, a").evaluateAll((elements) => elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visible = typeof element.checkVisibility === "function"
            ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            : style.display !== "none" && style.visibility !== "hidden";
          return visible && style.pointerEvents !== "none" && rect.width > 0 && rect.height > 0
            && (rect.width < 44 || rect.height < 44);
        })
        .map((element) => ({
          id: element.id,
          className: String(element.className),
          text: element.textContent.trim().slice(0, 30),
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height)
        })));
      expect(undersizedActions, `undersized actions at ${width}px`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test("stored user IDs cannot become HTML attributes or script", async ({ page }) => {
  await loginDemo(page);
  const result = await page.evaluate(() => {
    window.__xssTriggered = false;
    window.alert = () => { window.__xssTriggered = true; };
    const raw = defaultData();
    raw.settings.categories.push({
      id: 'bad" onmouseover="alert(1)',
      name: '<img src=x onerror=alert(1)>',
      type: "expense",
      color: "#123456"
    });
    const normalized = normalizeData(raw);
    Store.setData(normalized, { save: false });
    UI.renderCategories();
    const custom = normalized.settings.categories.find((item) => item.name.includes("img"));
    return {
      safeId: custom.id,
      xss: window.__xssTriggered,
      injectedHandlers: document.querySelectorAll("[onmouseover], [onerror]").length,
      visibleText: document.querySelector("#categoriesEditor")?.textContent || ""
    };
  });
  expect(result.safeId).toMatch(/^cat_legacy_[a-z0-9]+$/);
  expect(result.xss).toBe(false);
  expect(result.injectedHandlers).toBe(0);
  expect(result.visibleText).toContain("<img src=x onerror=alert(1)>");
});

test("large journals render progressively", async ({ page }) => {
  await loginDemo(page);
  const state = await page.evaluate(() => {
    const raw = defaultData();
    raw.transactions = Array.from({ length: 1000 }, (_, index) => ({
      id: `perf-${index}`,
      type: "expense",
      flowKind: "standard",
      amount: index + 1,
      categoryId: "exp_food",
      description: `Операция ${index}`,
      date: "2026-07-10",
      position: index,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z"
    }));
    Store.viewMonth = "2026-07";
    Store.setData(raw, { save: false });
    UI.journalVisibleCounts.clear();
    UI.renderJournal();
    return document.querySelectorAll("#expensesList .entry-row").length;
  });
  expect(state).toBe(200);
  await page.locator('#expensesList [data-journal-action="load-more"]').click();
  await expect(page.locator("#expensesList .entry-row")).toHaveCount(400);
});

test("keyboard focus stays inside open modal", async ({ page }) => {
  await loginDemo(page);
  await page.locator("#accountBtn").click();
  const modal = page.locator("#accountMenuModal");
  await expect(modal).toBeVisible();
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#accountMenuModal")))).toBe(true);
});

test("backup import is atomic and exports the same financial record", async ({ page }) => {
  await loginDemo(page);
  const backup = await page.evaluate(() => {
    const data = defaultData();
    data.transactions = [{
      id: "backup-roundtrip",
      type: "expense",
      flowKind: "standard",
      amount: 123.45,
      categoryId: "exp_food",
      description: "Проверка backup",
      date: "2024-02-29",
      position: 1,
      createdAt: "2024-02-29T10:00:00.000Z",
      updatedAt: "2024-02-29T10:00:00.000Z"
    }];
    return { format: "personal-budget-tracker", schemaVersion: CONFIG.APP_VERSION, data };
  });
  const [preImportDownload] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.locator("#importFileInput").setInputFiles({
        name: "roundtrip.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup), "utf8")
      });
      await expect(page.locator("#confirmationModal")).toBeVisible();
      await page.locator("#confirmationAcceptBtn").click();
    })()
  ]);
  expect(preImportDownload.suggestedFilename()).toContain("before_import");
  await expect.poll(() => page.evaluate(() => Store.data.transactions.some((item) => item.id === "backup-roundtrip"))).toBe(true);

  const [exportDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => App.exportBackup())
  ]);
  const exported = JSON.parse(await fs.readFile(await exportDownload.path(), "utf8"));
  expect(exported.format).toBe("personal-budget-tracker");
  expect(exported.data.transactions.find((item) => item.id === "backup-roundtrip")).toMatchObject({
    amount: 123.45,
    date: "2024-02-29",
    description: "Проверка backup"
  });
});

test("navigation and charts expose useful screen-reader semantics", async ({ page }) => {
  await loginDemo(page);
  await expect(page.locator(".skip-link")).toHaveAttribute("href", "#mainContent");
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator('[data-tab-target="overviewTab"][aria-current="page"]')).toHaveCount(2);

  await page.locator('.sidebar-nav [data-tab-target="analyticsTab"]').click();
  await expect(page.locator("#routeAnnouncer")).toHaveText("Открыт раздел: Аналитика");
  await expect(page.locator('[data-tab-target="analyticsTab"][aria-current="page"]')).toHaveCount(2);
  await expect(page.locator('#cashFlowChart[role="img"]')).toHaveAttribute("aria-describedby", "cashFlowChartSummary");
  await expect(page.locator('#categoryChart[role="img"]')).toHaveAttribute("aria-describedby", "categoryChartSummary");
});

test("long labels and large amounts fit narrow and 200 percent equivalent layouts", async ({ page }) => {
  await loginDemo(page);
  await page.evaluate(() => {
    const raw = defaultData();
    raw.settings.categories.push({
      id: "cat_long_layout",
      name: "Очень длинная категория для проверки переноса",
      type: "expense",
      color: "#58a6ff"
    });
    raw.transactions = [{
      id: "large-layout-value",
      type: "expense",
      flowKind: "standard",
      amount: 999999999999.99,
      categoryId: "cat_long_layout",
      description: "Длинное описание операции без риска горизонтальной прокрутки",
      date: "2026-07-10",
      position: 0,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z"
    }];
    Store.viewMonth = "2026-07";
    Store.setData(normalizeData(raw), { save: false });
    UI.renderApp();
  });

  for (const width of [320, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px viewport must fit; 640px represents a 1280px screen at 200% zoom`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByText("Очень длинная категория для проверки переноса").first()).toBeVisible();
});

test("API console diagnostics include request id but never credentials", async ({ page }) => {
  const consoleLines = [];
  page.on("console", (message) => consoleLines.push(message.text()));
  await page.route("https://personal-budget-api.bonaqu.workers.dev/login", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "x-request-id",
        "x-request-id": "req-console-test"
      },
      body: JSON.stringify({ ok: false, error: "Внутренняя ошибка сервиса", code: "INTERNAL_ERROR" })
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    try {
      await Api.request("/login", "POST", { login: "console_probe", password: "DoNotLog-Secret-42" });
    } catch {}
  });
  const output = consoleLines.join("\n");
  expect(output).toContain("[Budget API] request failed: HTTP_500");
  expect(output).toContain("req-console-test");
  expect(output).not.toContain("DoNotLog-Secret-42");
  expect(output).not.toContain("console_probe");
});
