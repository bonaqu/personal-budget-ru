const { defineConfig } = require("vite");
const { transformSync } = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const chartSource = path.resolve(__dirname, "node_modules/chart.js/dist/chart.umd.min.js");
const appSources = [
  "scripts/01-core.js",
  "scripts/02-auth-storage.js",
  "scripts/03-api.js",
  "scripts/04-store.js",
  "scripts/05-sync.js",
  "scripts/06-ui-core.js",
  "scripts/07-ui-shell.js",
  "scripts/08-ui-budget-settings.js",
  "scripts/09-ui-analytics.js",
  "scripts/10-ui-months.js",
  "scripts/11-ui-rendering.js",
  "scripts/12-app-bootstrap.js"
];

function buildClassicBundle() {
  return appSources.map((file) => `\n/* ${file} */\n${fs.readFileSync(path.resolve(__dirname, file), "utf8")}`).join("\n");
}

function chartVendorPlugin() {
  return {
    name: "local-chart-vendor",
    configureServer(server) {
      server.middlewares.use("/vendor/chart.umd.min.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        fs.createReadStream(chartSource).pipe(response);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "vendor/chart.umd.min.js",
        source: fs.readFileSync(chartSource)
      });
    }
  };
}

function classicBundlePlugin() {
  return {
    name: "personal-budget-classic-bundle",
    configureServer(server) {
      server.middlewares.use("/app.bundle.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(buildClassicBundle());
      });
    },
    generateBundle(_options, bundle) {
      const productionBundle = transformSync(buildClassicBundle(), {
        minify: true,
        target: "es2020",
        legalComments: "none"
      }).code;
      this.emitFile({ type: "asset", fileName: "app.bundle.js", source: productionBundle });
      const buildAssets = Array.from(new Set([
        "./",
        "./index.html",
        "./app.bundle.js",
        "./vendor/chart.umd.min.js",
        ...Object.keys(bundle).filter((file) => file !== "service-worker.js").map((file) => `./${file}`)
      ]));
      const manifest = buildAssets.map((file) => JSON.stringify(file)).join(",\n  ");
      const workerSource = fs.readFileSync(path.resolve(__dirname, "service-worker.js"), "utf8")
        .replace('"__VITE_BUILD_ASSETS__"', manifest);
      this.emitFile({ type: "asset", fileName: "service-worker.js", source: workerSource });
    }
  };
}

module.exports = defineConfig({
  base: "./",
  plugins: [classicBundlePlugin(), chartVendorPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
  },
  build: {
    emptyOutDir: true
  }
});
