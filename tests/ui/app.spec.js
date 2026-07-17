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

test("favicon keeps a transparent outer canvas", async ({ page }) => {
  await page.goto("/");
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute("href", "icons/app-icon.svg?v=2");

  const cornerAlpha = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="icon"]')?.href;
    const image = new Image();
    image.src = href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, 64, 64);
    return context.getImageData(0, 0, 1, 1).data[3];
  });

  expect(cornerAlpha).toBe(0);
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

test("light theme keeps text readable and avoids overbright compositing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginDemo(page);

  if (await page.evaluate(() => document.body.dataset.theme !== "light")) {
    await page.locator("#themeToggleBtn").click();
  }
  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(300);

  const themeState = await page.evaluate(() => {
    const parseRgb = (value) => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const luminance = (rgb) => rgb
      .map((channel) => channel / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (left, right) => {
      const values = [luminance(parseRgb(left)), luminance(parseRgb(right))].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const bodyStyle = getComputedStyle(document.body);
    const accountStyle = getComputedStyle(document.querySelector("#accountBtn"));
    const disabledStyle = getComputedStyle(document.querySelector("#undoBtn"));
    const visibleSurfaces = Array.from(document.querySelectorAll(".glass-card, .panel"))
      .filter((element) => element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true)
      .map((element) => getComputedStyle(element));
    return {
      accountColor: accountStyle.color,
      bodyText: bodyStyle.getPropertyValue("--text-main").trim(),
      disabledOpacity: Number(disabledStyle.opacity),
      dimContrast: contrast(bodyStyle.getPropertyValue("--text-dim").trim(), "rgb(255, 255, 255)"),
      blurredSurfaces: visibleSurfaces.filter((style) => style.backdropFilter !== "none").length,
      radialSurfaces: visibleSurfaces.filter((style) => style.backgroundImage.includes("radial-gradient")).length
    };
  });

  expect(themeState.accountColor).toBe("rgb(14, 24, 38)");
  expect(themeState.bodyText).toBe("#0e1826");
  expect(themeState.disabledOpacity).toBeGreaterThanOrEqual(0.88);
  expect(themeState.dimContrast).toBeGreaterThanOrEqual(4.5);
  expect(themeState.blurredSurfaces).toBe(0);
  expect(themeState.radialSurfaces).toBe(0);

  await page.locator("#accountBtn").hover();
  expect(await page.locator("#accountBtn").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(14, 24, 38)");
  await page.locator("#themeToggleBtn").focus();
  const focusState = await page.locator("#themeToggleBtn").evaluate((element) => ({
    active: document.activeElement === element,
    outline: getComputedStyle(element).outlineStyle,
    shadow: getComputedStyle(element).boxShadow
  }));
  expect(focusState.active).toBe(true);
  expect(focusState.outline !== "none" || focusState.shadow !== "none").toBe(true);

  for (const target of ["analyticsTab", "monthsTab", "settingsTab", "overviewTab"]) {
    await page.locator(`.sidebar-nav [data-tab-target="${target}"]`).click();
    await expect(page.locator(`#${target}`)).toHaveClass(/is-active/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }

  for (const expectedTheme of ["dark", "light", "dark", "light"]) {
    await page.locator("#themeToggleBtn").click();
    await expect(page.locator("body")).toHaveAttribute("data-theme", expectedTheme);
  }
  expect(errors).toEqual([]);
});

test("sidebar uses Russian history labels, explicit theme state and accessible collapsed tooltips", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginDemo(page);

  await expect(page.locator("#undoBtn .sidebar__utility-label")).toHaveText("Отменить");
  await expect(page.locator("#redoBtn .sidebar__utility-label")).toHaveText("Вернуть");
  await expect(page.locator('.sidebar-nav [data-tab-target="overviewTab"]')).toHaveAttribute("aria-label", "Бюджет");
  await expect(page.locator('.sidebar-nav [data-tab-target="analyticsTab"]')).toHaveAttribute("aria-label", "Аналитика");
  await expect(page.locator('.sidebar-nav [data-tab-target="monthsTab"]')).toHaveAttribute("aria-label", "Месяцы");
  await expect(page.locator('.sidebar-nav [data-tab-target="settingsTab"]')).toHaveAttribute("aria-label", "Настройки");

  const assertThemeControl = async (theme) => {
    const isLight = theme === "light";
    await expect(page.locator("body")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("#themeToggleLabel")).toHaveText(isLight ? "Светлая тема" : "Тёмная тема");
    await expect(page.locator("#themeToggleBtn")).toHaveAttribute(
      "aria-label",
      isLight ? "Включить тёмную тему" : "Включить светлую тему"
    );
    await expect(page.locator("#themeToggleBtn")).toHaveAttribute(
      "data-sidebar-tooltip",
      isLight ? "Светлая тема" : "Тёмная тема"
    );
  };

  const initialTheme = await page.evaluate(() => document.body.dataset.theme);
  await assertThemeControl(initialTheme);
  await page.locator("#themeToggleBtn").click();
  await assertThemeControl(initialTheme === "light" ? "dark" : "light");

  const shell = page.locator("#appShell");
  if (!(await shell.evaluate((element) => element.classList.contains("is-sidebar-collapsed")))) {
    await page.locator("#sidebarToggleBtn").click();
  }
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator("#sidebarToggleBtn")).toHaveAttribute("data-sidebar-tooltip", "Открыть боковую панель");

  const monthsButton = page.locator('.sidebar-nav [data-tab-target="monthsTab"]');
  await monthsButton.hover();
  await page.waitForTimeout(180);
  const hoverTooltip = await monthsButton.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { content: style.content, opacity: style.opacity, visibility: style.visibility };
  });
  expect(hoverTooltip).toEqual({ content: '"Месяцы"', opacity: "1", visibility: "visible" });

  await page.mouse.move(900, 700);
  const analyticsButton = page.locator('.sidebar-nav [data-tab-target="analyticsTab"]');
  await analyticsButton.focus();
  await analyticsButton.press("Tab");
  await page.waitForTimeout(180);
  const focusTooltip = await monthsButton.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { focused: document.activeElement === element, opacity: style.opacity, visibility: style.visibility };
  });
  expect(focusTooltip).toEqual({ focused: true, opacity: "1", visibility: "visible" });

  await page.locator("#sidebarToggleBtn").click();
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  expect(await monthsButton.evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await monthsButton.evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
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

test("goal cards stay compact, wrap after four and use restrained premium motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  expect(await page.locator(".auth-shell-card").evaluate((element) => (
    getComputedStyle(element, "::before").animationIterationCount
  ))).toBe("1");

  await page.locator("#startupLogin").fill("test1234");
  await page.locator("#startupPassword").fill("test1234");
  await page.locator("#startupLoginBtn").click();
  await expect(page.locator("#appShell")).toBeVisible();
  await page.locator('.sidebar-nav [data-tab-target="analyticsTab"]').click();

  const layout = await page.locator("#goalList").evaluate((list) => {
    const cards = Array.from(list.querySelectorAll(".goal-card"));
    const widths = cards.map((card) => Math.round(card.getBoundingClientRect().width));
    return {
      cardCount: cards.length,
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      widths,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      progressRole: list.querySelector(".goal-progress")?.getAttribute("role")
    };
  });
  expect(layout.cardCount).toBe(3);
  expect(layout.columns).toBe(4);
  expect(Math.min(...layout.widths)).toBeGreaterThan(280);
  expect(Math.max(...layout.widths)).toBeLessThan(330);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.progressRole).toBe("progressbar");
  await expect(page.locator(".goal-card--adder strong")).toHaveText("Добавить цель");
  await expect(page.locator(".goal-card__add-icon")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".goal-card__actions .chip-btn--danger")).toHaveCount(2);

  const wrappedRows = await page.evaluate(() => {
    const data = Utils.clone(Store.data);
    const now = Utils.nowISO();
    data.settings.goals.push(...Array.from({ length: 3 }, (_, index) => ({
      id: `goal_grid_${index}`,
      name: `Дополнительная цель ${index + 1}`,
      target: 100000 + index * 10000,
      saved: 10000 + index * 1000,
      mode: "saved",
      color: "#58a6ff",
      note: "Проверка переноса карточек на следующую строку",
      position: index + 3,
      createdAt: now,
      updatedAt: now
    })));
    Store.setData(data, { save: false });
    UI.renderGoals();
    const list = document.querySelector("#goalList");
    return {
      tops: Array.from(list.querySelectorAll(".goal-card"))
        .map((card) => Math.round(card.getBoundingClientRect().top)),
      overflowY: getComputedStyle(list).overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight
    };
  });
  expect(wrappedRows.tops).toHaveLength(6);
  expect(new Set(wrappedRows.tops.slice(0, 4)).size).toBe(1);
  expect(wrappedRows.tops[4]).toBeGreaterThan(wrappedRows.tops[0]);
  expect(wrappedRows.overflowY).toBe("visible");
  expect(wrappedRows.scrollHeight).toBe(wrappedRows.clientHeight);

  const goalCard = page.locator(".goal-card:not(.goal-card--adder)").first();
  const goalBox = await goalCard.boundingBox();
  await page.mouse.move(goalBox.x + goalBox.width * 0.2, goalBox.y + goalBox.height * 0.25);
  await page.mouse.move(goalBox.x + goalBox.width * 0.8, goalBox.y + goalBox.height * 0.65);
  await page.waitForTimeout(180);
  const glowState = await goalCard.evaluate((element) => ({
    x: element.style.getPropertyValue("--goal-glow-x"),
    y: element.style.getPropertyValue("--goal-glow-y"),
    highlight: getComputedStyle(element, "::before").backgroundImage
  }));
  expect(glowState.x).toBe("");
  expect(glowState.y).toBe("");
  expect(glowState.highlight).not.toContain("radial-gradient");
  expect(await goalCard.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");

  await page.locator("#themeToggleBtn").click();
  expect(await goalCard.evaluate((element) => ({
    theme: document.body.dataset.theme,
    sheen: getComputedStyle(element, "::after").content,
    border: getComputedStyle(element).borderColor
  }))).toEqual(expect.objectContaining({ theme: "light", sheen: "none" }));

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await goalCard.evaluate((element) => ({
    transform: getComputedStyle(element).transform,
    transition: getComputedStyle(element).transitionDuration
  }));
  expect(reducedMotion.transform).toBe("none");
  expect(parseFloat(reducedMotion.transition)).toBeLessThanOrEqual(0.01);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator("#goalList").evaluate((list) => ({
    columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
    maxHeight: getComputedStyle(list).maxHeight,
    overflowY: getComputedStyle(list).overflowY,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(mobile.columns).toBe(1);
  expect(mobile.maxHeight).toBe("none");
  expect(mobile.overflowY).toBe("visible");
  expect(mobile.overflow).toBeLessThanOrEqual(1);
});

test("months archive fills each card and focus operations stay readable", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 900 });
  await loginDemo(page);
  await page.locator('.sidebar-nav [data-tab-target="monthsTab"]').click();

  const inspectArchive = () => page.locator("#monthsTable").evaluate((table) => ({
    sidebarCollapsed: document.querySelector("#appShell").classList.contains("is-sidebar-collapsed"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: Array.from(table.querySelectorAll(".month-table__row")).slice(0, 4).map((row) => {
      const rowBox = row.getBoundingClientRect();
      return [".month-table__headline", ".month-table__totals", ".month-table__focus"].map((selector) => {
        const box = row.querySelector(selector).getBoundingClientRect();
        return Math.round(rowBox.right - box.right);
      });
    })
  }));

  const sidebarStates = new Set();
  for (let index = 0; index < 2; index += 1) {
    const archive = await inspectArchive();
    sidebarStates.add(archive.sidebarCollapsed);
    expect(archive.overflow).toBeLessThanOrEqual(1);
    archive.rows.flat().forEach((rightGap) => expect(rightGap).toBeLessThanOrEqual(16));
    await page.locator("#sidebarToggleBtn").click();
  }
  expect(sidebarStates.size).toBe(2);

  await page.locator("#themeToggleBtn").click();
  const lightArchive = await inspectArchive();
  lightArchive.rows.flat().forEach((rightGap) => expect(rightGap).toBeLessThanOrEqual(16));

  const focus = await page.locator("#monthDetail").evaluate((root) => ({
    operationRows: Array.from(root.querySelectorAll(".month-detail__metric--operation")).map((row) => ({
      columns: getComputedStyle(row).gridTemplateColumns.split(" ").length,
      textAlign: getComputedStyle(row.querySelector("strong")).textAlign
    })),
    heroCards: root.querySelectorAll(".month-detail__hero-card").length
  }));
  expect(focus.heroCards).toBe(6);
  expect(focus.operationRows).toHaveLength(2);
  focus.operationRows.forEach((row) => {
    expect(row.columns).toBe(1);
    expect(row.textAlign).toBe("left");
  });
});

test("advanced statistics use a compact 3 by 2 grid with useful context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginDemo(page);
  await page.locator('.sidebar-nav [data-tab-target="analyticsTab"]').click();
  const desktop = await page.locator("#deepStats").evaluate((root) => {
    const cards = Array.from(root.querySelectorAll(".deep-stat"));
    return {
      columns: getComputedStyle(root).gridTemplateColumns.split(" ").length,
      widths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
      rows: cards.map((card) => Math.round(card.getBoundingClientRect().top)),
      contexts: cards.map((card) => card.querySelector(".deep-stat__context")?.textContent?.trim() || ""),
      panelHeight: Math.round(root.closest(".analytics-panel--advanced").getBoundingClientRect().height),
      activeView: root.closest(".analytics-panel--advanced").dataset.activeView
    };
  });
  expect(desktop.columns).toBe(3);
  expect(Math.min(...desktop.widths)).toBeGreaterThan(380);
  expect(Math.max(...desktop.widths)).toBeLessThan(460);
  expect(new Set(desktop.rows.slice(0, 3)).size).toBe(1);
  expect(desktop.rows[3]).toBeGreaterThan(desktop.rows[0]);
  expect(desktop.contexts).toHaveLength(6);
  expect(desktop.contexts.every(Boolean)).toBe(true);
  expect(desktop.panelHeight).toBeLessThan(430);
  expect(desktop.activeView).toBe("deep");

  await page.locator("#analyticsViewForecastBtn").click();
  await expect(page.locator("#analyticsViewForecastBtn")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#analyticsPaneForecast")).toBeVisible();
  const forecastHeight = Math.round((await page.locator(".analytics-panel--advanced").boundingBox()).height);
  await page.locator("#analyticsViewRecurringBtn").click();
  await expect(page.locator("#analyticsPaneRecurring")).toBeVisible();
  const recurringHeight = Math.round((await page.locator(".analytics-panel--advanced").boundingBox()).height);
  await page.locator("#recurringList").evaluate((root) => {
    const source = root.querySelector(".recurring-card") || document.createElement("article");
    source.classList.add("recurring-card");
    while (root.children.length < 24) root.appendChild(source.cloneNode(true));
  });
  const longRecurring = await page.locator("#recurringList").evaluate((root) => ({
    panelHeight: Math.round(root.closest(".analytics-panel--advanced").getBoundingClientRect().height),
    clientHeight: root.clientHeight,
    scrollHeight: root.scrollHeight,
    overflowY: getComputedStyle(root).overflowY
  }));
  await page.locator("#analyticsViewDeepBtn").click();
  await expect(page.locator("#analyticsViewDeepBtn")).toHaveAttribute("aria-selected", "true");
  const deepHeight = Math.round((await page.locator(".analytics-panel--advanced").boundingBox()).height);
  expect(new Set([deepHeight, forecastHeight, recurringHeight, longRecurring.panelHeight]).size).toBe(1);
  expect(longRecurring.scrollHeight).toBeGreaterThan(longRecurring.clientHeight);
  expect(longRecurring.overflowY).toBe("auto");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator("#deepStats").evaluate((root) => (
    getComputedStyle(root).gridTemplateColumns.split(" ").length
  ))).toBe(1);
  const mobileHeights = [];
  for (const selector of ["#analyticsViewDeepBtn", "#analyticsViewForecastBtn", "#analyticsViewRecurringBtn"]) {
    await page.locator(selector).click();
    mobileHeights.push(Math.round((await page.locator(".analytics-panel--advanced").boundingBox()).height));
  }
  expect(new Set(mobileHeights).size).toBe(1);
});

test("PWA manifest and install prompt are available without losing browser fallback", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");
  const cdp = await context.newCDPSession(page);
  const appManifest = await cdp.send("Page.getAppManifest");
  expect(appManifest.errors).toEqual([]);
  expect(appManifest.data).toContain('"display": "standalone"');
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body.display).toBe("standalone");
  expect(body.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));

  await page.evaluate(() => {
    window.__pwaPromptCalls = 0;
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: { value: async () => { window.__pwaPromptCalls += 1; } },
      userChoice: { value: Promise.resolve({ outcome: "dismissed", platform: "web" }) }
    });
    window.dispatchEvent(event);
  });
  await page.locator("#startupLogin").fill("test1234");
  await page.locator("#startupPassword").fill("test1234");
  await page.locator("#startupLoginBtn").click();
  await page.locator('.sidebar-nav [data-tab-target="settingsTab"]').click();
  await expect(page.locator("#pwaInstallCard")).toHaveAttribute("data-state", "available");
  await expect(page.locator("#pwaInstallBtn")).toBeVisible();
  await page.locator("#pwaInstallBtn").click();
  expect(await page.evaluate(() => window.__pwaPromptCalls)).toBe(1);
});

test("backup copy is concise and keeps the safety explanation", async ({ page }) => {
  await loginDemo(page);
  await page.locator('.sidebar-nav [data-tab-target="settingsTab"]').click();
  const note = await page.locator("#backupNote").innerText();
  expect(note).toContain("восстановления");
  expect(note).not.toContain("спокойного");
  await expect(page.locator("#exportBtn")).toHaveAttribute(
    "aria-label",
    "Сохраняет резервную копию бюджета для переноса на другое устройство или восстановления."
  );
});

test("settings quick cards remain readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginDemo(page);
  await page.locator('.mobile-bottom-nav [data-tab-target="settingsTab"]').click();
  const quickBody = page.locator(".settings-panel--quick .quick-card__body").first();
  await expect(quickBody).toBeVisible();
  expect(await quickBody.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(240);
});

test("backup reminder stays quiet until due and resets after a successful export", async ({ page }) => {
  await loginDemo(page);
  await page.locator('.sidebar-nav [data-tab-target="settingsTab"]').click();
  await expect(page.locator("#backupReminder")).toHaveAttribute("data-state", "new");
  await expect(page.locator("#backupReminderText")).toContainText("ещё не создавалась");

  await page.evaluate(() => {
    const overdue = new Date(Date.now() - 31 * 86400000).toISOString();
    Storage.saveBackupMeta(Auth.getLogin(), { firstSeenAt: overdue, lastExportedAt: null });
    UI.renderBackupReminder();
  });
  await expect(page.locator("#backupReminder")).toHaveAttribute("data-state", "due");
  await expect(page.locator("#backupReminderText")).toContainText("31 день");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  await downloadPromise;
  await expect(page.locator("#backupReminder")).toHaveAttribute("data-state", "recent");
  await expect(page.locator("#backupReminderText")).toContainText("сегодня");
});
