const { test, expect } = require("@playwright/test");

test("versioned app shell starts after the network disappears", async ({ page, context }) => {
  await page.goto("/?sw-test=1");
  const cachedPaths = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
    }
    const shellCache = (await caches.keys()).find((name) => name.startsWith("personal-budget-shell-"));
    if (!shellCache) throw new Error("Versioned app-shell cache was not created");
    const cache = await caches.open(shellCache);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      const path = new URL(request.url).pathname;
      const contentType = response?.headers.get("content-type") || "";
      if (path.endsWith(".js") && !/javascript/.test(contentType)) {
        throw new Error(`Invalid cached JavaScript response: ${path} (${contentType})`);
      }
      if (path.endsWith(".css") && !/text\/css/.test(contentType)) {
        throw new Error(`Invalid cached stylesheet response: ${path} (${contentType})`);
      }
    }
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toEqual(expect.arrayContaining([
    expect.stringMatching(/manifest\.webmanifest$/),
    expect.stringMatching(/icons\/icon-192\.png$/),
    expect.stringMatching(/icons\/icon-512\.png$/)
  ]));

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#authScreen")).toBeVisible();
  await expect(page.locator("#startupAuthForm")).toBeVisible();
  await context.setOffline(false);
});
