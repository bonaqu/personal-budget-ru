import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = spawnSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  shell: false
});

if (git.status !== 0) {
  throw new Error(String(git.stderr || "Не удалось получить список отслеживаемых файлов."));
}

const tracked = git.stdout.split("\0").filter(Boolean);
const findings = [];
let scannedFiles = 0;
const localOnlyPaths = new Set([
  "api/wrangler.recovery-drill.jsonc",
  "docs/d1-recovery.md",
  "tools/d1-recovery-drill.mjs",
  "tools/Invoke-D1RecoveryDrill.ps1"
]);
const forbiddenPathRules = [
  ["локальная среда", /(^|\/)(\.codex-local|\.wrangler|node_modules|dist|output)(\/|$)/i],
  ["файл окружения", /(^|\/)(\.env|\.dev\.vars)(\.|$)/i],
  ["приватный экспорт", /(^|\/)[^/]*(backup|dump)[^/]*\.(json|sql|zip)$/i],
  ["чувствительный формат", /\.(pem|key|p12|pfx|sqlite|sqlite3|db|dump|log|bak)$/i],
  ["production Wrangler config", /(^|\/)wrangler\.jsonc$/i]
];
const secretRules = [
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["OpenAI-style token", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{20,}/g],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["локальный абсолютный путь", /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\s"']+/g]
];

for (const relativePath of tracked) {
  const normalized = relativePath.replaceAll("\\", "/");
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  scannedFiles += 1;
  if (localOnlyPaths.has(normalized)) {
    findings.push({ rule: "локальный operational-файл", file: normalized });
  }
  for (const [rule, pattern] of forbiddenPathRules) {
    if (pattern.test(normalized)) findings.push({ rule, file: normalized });
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  for (const [rule, pattern] of secretRules) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ rule, file: normalized });
  }

  if (/wrangler.*\.jsonc$/i.test(normalized)) {
    const resourceIds = content.matchAll(/"(?:database_id|account_id)"\s*:\s*"([^"]+)"/g);
    for (const match of resourceIds) {
      const value = match[1];
      const isPlaceholder = value.startsWith("YOUR_") || /^00000000-0000-0000-0000-00000000000\d$/.test(value);
      if (!isPlaceholder) findings.push({ rule: "реальный Cloudflare resource ID", file: normalized });
    }
  }
}

const authorEmail = spawnSync("git", ["log", "-1", "--format=%ae"], {
  cwd: root,
  encoding: "utf8",
  shell: false
}).stdout.trim();
const safeAuthorEmail = authorEmail.endsWith("@users.noreply.github.com") || authorEmail === "noreply@github.com";
if (authorEmail && !safeAuthorEmail) {
  findings.push({ rule: "публичный email автора коммита", file: "HEAD metadata" });
}

if (findings.length) {
  const unique = [...new Map(findings.map((item) => [`${item.rule}:${item.file}`, item])).values()];
  console.error("Публичная проверка отклонена:");
  unique.forEach((item) => console.error(`- ${item.rule}: ${item.file}`));
  process.exitCode = 1;
} else {
  console.log(`Публичная проверка пройдена: ${scannedFiles} отслеживаемых файлов.`);
}
