const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/offline",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4318",
    serviceWorkers: "allow",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4318",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: false,
    timeout: 90_000
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
