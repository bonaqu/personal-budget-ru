import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.resolve(
  repoRoot,
  process.env.D1_RECOVERY_DRILL_CONFIG || "api/wrangler.recovery-drill.jsonc"
);
const expectedDatabaseName = "personal-budget-recovery-drill";
const expectedDatabaseId = "a129dc75-92eb-48b8-b30e-02f54c2e5bc2";
const blockedDatabaseNames = new Set(["personal-budget-ru-db", "personal-budget-api"]);
const bindingName = "RECOVERY_DRILL_DB";
const wranglerEntrypoint = path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");

function runWrangler(args, { json = false } = {}) {
  const result = spawnSync(process.execPath, [wranglerEntrypoint, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    shell: false,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || result.stdout || "Wrangler завершился с ошибкой.").trim();
    throw new Error(detail);
  }
  const output = String(result.stdout || "").trim();
  if (!json) return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Wrangler вернул некорректный JSON: ${output.slice(0, 300)}`);
  }
}

function getFirstResult(payload) {
  if (Array.isArray(payload)) return payload[0] || {};
  return payload?.result || payload || {};
}

function getRows(payload) {
  const result = getFirstResult(payload);
  return Array.isArray(result.results) ? result.results : [];
}

function executeSql(sql) {
  return runWrangler([
    "d1", "execute", bindingName,
    "--remote",
    "--yes",
    "--json",
    "--config", configPath,
    "--command", sql
  ], { json: true });
}

function readMarker(runId) {
  const rows = getRows(executeSql(
    `SELECT marker FROM recovery_drill_checks WHERE run_id = '${runId}' LIMIT 1;`
  ));
  return rows[0]?.marker || "";
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === bindingName);
if (
  config.vars?.RECOVERY_DRILL_ONLY !== "true" ||
  database?.database_name !== expectedDatabaseName ||
  database?.database_id !== expectedDatabaseId ||
  blockedDatabaseNames.has(database?.database_name) ||
  !/^[0-9a-f-]{36}$/i.test(database?.database_id || "")
) {
  throw new Error("Защитная проверка остановила запуск: разрешена только выделенная recovery-drill D1.");
}

const startedAt = new Date().toISOString();
const runId = randomUUID();
const beforeMarker = `before-${runId}`;
const afterMarker = `after-${runId}`;

console.log(`[recovery-drill] База подтверждена: ${expectedDatabaseName}`);
runWrangler([
  "d1", "migrations", "apply", bindingName,
  "--remote",
  "--config", configPath
]);

executeSql(`
  CREATE TABLE IF NOT EXISTS recovery_drill_checks (
    run_id TEXT PRIMARY KEY,
    marker TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  DELETE FROM recovery_drill_checks;
  INSERT INTO recovery_drill_checks (run_id, marker, created_at)
  VALUES ('${runId}', '${beforeMarker}', '${startedAt}');
`);

const info = runWrangler([
  "d1", "time-travel", "info", bindingName,
  "--json",
  "--config", configPath
], { json: true });
const bookmark = getFirstResult(info).bookmark;
if (!bookmark || typeof bookmark !== "string") {
  throw new Error("D1 не вернула контрольную Time Travel bookmark.");
}

executeSql(`UPDATE recovery_drill_checks SET marker = '${afterMarker}' WHERE run_id = '${runId}';`);
if (readMarker(runId) !== afterMarker) {
  throw new Error("Контрольная мутация D1 не подтверждена; восстановление не запускалось.");
}

console.log("[recovery-drill] Контрольная мутация подтверждена, запускается Time Travel restore.");
let restored = null;
let restoreError = null;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    restored = runWrangler([
      "d1", "time-travel", "restore", bindingName,
      "--bookmark", bookmark,
      "--json",
      "--config", configPath
    ], { json: true });
    break;
  } catch (error) {
    restoreError = error;
    // Cloudflare can finish a restore after Wrangler's client-side timeout.
    // A read verifies the authoritative state before a safe retry of the same bookmark.
    try {
      if (readMarker(runId) === beforeMarker) break;
    } catch {
      // The D1 control plane may be briefly unavailable while restore is settling.
    }
    if (attempt < 3) {
      console.warn(`[recovery-drill] Restore не подтверждён, безопасный повтор ${attempt + 1}/3.`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

let restoredMarker = "";
let verificationAttempts = 0;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  verificationAttempts = attempt;
  try {
    restoredMarker = readMarker(runId);
    if (restoredMarker === beforeMarker) break;
  } catch (error) {
    if (attempt === 12) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (restoredMarker !== beforeMarker) {
  throw new Error(restoreError?.message || "Time Travel завершилась, но контрольная запись не вернулась к исходному состоянию.");
}

const restoreResult = restored ? getFirstResult(restored) : {};
const report = {
  ok: true,
  database: expectedDatabaseName,
  startedAt,
  completedAt: new Date().toISOString(),
  runId,
  verificationAttempts,
  bookmark,
  previousBookmark: restoreResult.previous_bookmark || null
};
const reportDir = path.join(repoRoot, ".codex-local", "recovery-drill");
await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("[recovery-drill] Успешно: исходное состояние контрольной записи восстановлено.");
