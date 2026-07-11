const { test, expect } = require("@playwright/test");

test("versioned app shell starts after the network disappears", async ({ page, context }) => {
  await page.goto("/?sw-test=1");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
    }
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#authScreen")).toBeVisible();
  await expect(page.locator("#startupAuthForm")).toBeVisible();
  await context.setOffline(false);
});
