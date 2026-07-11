import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(root, "api/wrangler.test.jsonc") },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, "api/migrations"))
        }
      }
    }))
  ],
  test: {
    include: ["tests/worker/**/*.spec.js"],
    setupFiles: ["./tests/worker/apply-migrations.js"],
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
});
