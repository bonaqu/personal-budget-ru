"use strict";

const LOGIN_RE = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
// Cloudflare's production WebCrypto rejects PBKDF2 values above 100,000.
// Keep the configured value pinned to the strongest platform-supported setting.
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 100_000;
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 3;
const DEFAULT_MAX_DATA_BYTES = 8_000_000;
const MAX_AUTH_BODY_BYTES = 8_192;
const DATA_CHUNK_CHARS = 200_000;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const meta = createRequestMeta(request);

    if (!isOriginAllowed(request, env)) {
      return jsonError(meta, request, env, "Источник запроса не разрешен", 403, "ORIGIN_NOT_ALLOWED");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(meta, request, env) });
    }

    const url = new URL(request.url);
    if (request.method === "HEAD" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response(null, { status: 200, headers: responseHeaders(meta, request, env) });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonOk(meta, request, env, {
        service: "personal-budget-worker",
        storage: "cloudflare-d1",
        apiVersion: 2,
        timestamp: new Date().toISOString()
      });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return textResponse(meta, request, env, "OK");
    }

    try {
      ensureEnv(env);
      const route = `${request.method} ${url.pathname}`;
      switch (route) {
        case "POST /register": return await register(request, env, meta);
        case "POST /login": return await login(request, env, meta);
        case "GET /load": return await loadData(request, env, meta);
        case "POST /save": return await saveData(request, env, meta);
        case "POST /logout": return await logout(request, env, meta);
        case "POST /session/touch": return await touchSession(request, env, meta);
        case "GET /sessions": return await listSessions(request, env, meta);
        case "POST /sessions/revoke": return await revokeSession(request, env, meta);
        case "POST /password/change": return await changePassword(request, env, meta);
        case "POST /password/recover": return await recoverPassword(request, env, meta);
        case "POST /recovery/regenerate": return await regenerateRecoveryCode(request, env, meta);
        default: throw httpError(404, "Маршрут API не найден", "NOT_FOUND");
      }
    } catch (error) {
      const status = Number(error?.status) || 500;
      const code = typeof error?.code === "string" && error.code ? error.code : "INTERNAL_ERROR";
      logEvent(status >= 500 ? "error" : "warn", "api.request.failed", {
        requestId: meta.requestId,
        endpoint: meta.endpoint,
        code,
        status
      });
      if (status >= 500) {
        console.error(JSON.stringify({
          level: "error",
          tag: "api.request.fatal",
          requestId: meta.requestId,
          endpoint: meta.endpoint,
          code,
          message: error instanceof Error ? error.message : "Unknown error"
        }));
      }
      return jsonError(
        meta,
        request,
        env,
        status >= 500 ? "Внутренняя ошибка сервиса" : error.message,
        status,
        code,
        error?.publicDetails || {}
      );
    }
  }
};

function createRequestMeta(request) {
  const url = new URL(request.url);
  return {
    requestId: crypto.randomUUID(),
    endpoint: `${request.method} ${url.pathname}`
  };
}

function ensureEnv(env) {
  if (!env.DB) throw httpError(500, "Не настроена база данных Cloudflare D1", "ENV_D1_MISSING");
}

function getAllowedOrigins(env) {
  return String(env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isOriginAllowed(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  const allowed = getAllowedOrigins(env);
  return !origin || !allowed.length || allowed.includes(origin);
}

function responseHeaders(meta, request, env, extra = {}) {
  const origin = String(request.headers.get("Origin") || "").trim();
  const allowed = getAllowedOrigins(env);
  const allowOrigin = !allowed.length ? "*" : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Request-Id": meta.requestId,
    Vary: "Origin",
    ...extra
  };
}

function jsonOk(meta, request, env, data = {}, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: responseHeaders(meta, request, env, { "Content-Type": "application/json; charset=utf-8" })
  });
}

function jsonError(meta, request, env, message, status, code, extra = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, code, ...extra }), {
    status,
    headers: responseHeaders(meta, request, env, { "Content-Type": "application/json; charset=utf-8" })
  });
}

function textResponse(meta, request, env, value) {
  return new Response(value, {
    headers: responseHeaders(meta, request, env, { "Content-Type": "text/plain; charset=utf-8" })
  });
}

function httpError(status, message, code = "API_ERROR", publicDetails = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.publicDetails = publicDetails;
  return error;
}

function logEvent(level, tag, context = {}) {
  const logger = level === "error" ? console.error : (level === "warn" ? console.warn : console.log);
  logger(JSON.stringify({ level, tag, ts: new Date().toISOString(), ...context }));
}

async function readJsonBody(request, maxBytes) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, "Слишком большой размер запроса", "BODY_TOO_LARGE");
  }
  const raw = await request.text();
  if (encoder.encode(raw).length > maxBytes) {
    throw httpError(413, "Слишком большой размер запроса", "BODY_TOO_LARGE");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, "Тело запроса должно быть валидным JSON", "INVALID_JSON");
  }
}

function normalizeLogin(value) {
  const login = String(value || "").trim();
  if (!LOGIN_RE.test(login)) {
    throw httpError(400, "Логин должен содержать 3–32 латинских символа, цифры, точку, дефис или подчеркивание", "LOGIN_INVALID");
  }
  return login;
}

function normalizePassword(value, { enforceStrength = false } = {}) {
  const password = typeof value === "string" ? value : "";
  const minimum = enforceStrength ? PASSWORD_MIN_LENGTH : 1;
  if (password.length < minimum || password.length > PASSWORD_MAX_LENGTH) {
    throw httpError(
      400,
      enforceStrength ? "Пароль должен содержать от 8 до 128 символов" : "Пароль обязателен",
      "PASSWORD_LENGTH"
    );
  }
  return password;
}

function normalizeDeviceName(value, request) {
  const explicit = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  if (explicit) return explicit;
  const ua = String(request.headers.get("User-Agent") || "");
  if (/mobile|android|iphone/i.test(ua)) return "Телефон";
  if (/ipad|tablet/i.test(ua)) return "Планшет";
  return "Компьютер";
}

function getPbkdf2Iterations(env) {
  const configured = Math.floor(Number(env.PBKDF2_ITERATIONS));
  if (!Number.isFinite(configured)) return DEFAULT_PBKDF2_ITERATIONS;
  return Math.min(MAX_PBKDF2_ITERATIONS, Math.max(MIN_PBKDF2_ITERATIONS, configured));
}

function getMaxDataBytes(env) {
  const configured = Math.floor(Number(env.MAX_DATA_BYTES));
  return Number.isFinite(configured) && configured > 0 ? Math.min(20_000_000, configured) : DEFAULT_MAX_DATA_BYTES;
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from((saltHex.match(/.{2}/g) || []).map((part) => Number.parseInt(part, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256
  );
  return toHex(new Uint8Array(bits));
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function createPasswordRecord(password, env) {
  const salt = randomHex(16);
  const iterations = getPbkdf2Iterations(env);
  return {
    hash: await pbkdf2Hex(password, salt, iterations),
    salt,
    iterations,
    algo: "pbkdf2-sha256"
  };
}

async function verifyPassword(user, password, env) {
  if (user.password_algo === "pbkdf2-sha256" && user.password_salt) {
    const iterations = Number(user.password_iterations) || DEFAULT_PBKDF2_ITERATIONS;
    const derived = await pbkdf2Hex(password, user.password_salt, iterations);
    return {
      ok: timingSafeEqual(derived, user.password_hash || ""),
      needsUpgrade: iterations < getPbkdf2Iterations(env)
    };
  }
  const legacy = await sha256Hex(password);
  return { ok: timingSafeEqual(legacy, user.password_hash || ""), needsUpgrade: true };
}

function formatRecoveryCode(rawHex = randomHex(20)) {
  return rawHex.toUpperCase().match(/.{1,5}/g).join("-");
}

function normalizeRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-F0-9]/g, "");
}

async function recoveryHash(code) {
  return sha256Hex(`recovery:v1:${normalizeRecoveryCode(code)}`);
}

async function applyAuthRateLimits(env, request, login) {
  const clientAddress = String(request.headers.get("CF-Connecting-IP") || "unknown");
  const clientKey = await sha256Hex(`client:${clientAddress}`);
  const checks = [];
  if (env.AUTH_RATE_LIMITER?.limit) checks.push(env.AUTH_RATE_LIMITER.limit({ key: clientKey }));
  if (env.LOGIN_RATE_LIMITER?.limit) checks.push(env.LOGIN_RATE_LIMITER.limit({ key: `login:${login.toLowerCase()}` }));
  if (!checks.length) return;
  const results = await Promise.all(checks);
  if (results.some((result) => !result.success)) {
    throw httpError(429, "Слишком много попыток. Повторите через минуту.", "RATE_LIMITED", { retryAfter: 60 });
  }
}

async function getUser(env, login) {
  return env.DB.prepare("SELECT * FROM users WHERE login = ?").bind(login).first();
}

function extractBearerToken(request) {
  const authorization = String(request.headers.get("Authorization") || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function createSession(env, login, request, deviceName) {
  const now = Date.now();
  const id = crypto.randomUUID();
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = now + SESSION_ABSOLUTE_MS;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at > 0").bind(now),
    env.DB.prepare("INSERT INTO sessions (id, user_login, token_hash, device_name, created_at, last_seen_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
      .bind(id, login, tokenHash, normalizeDeviceName(deviceName, request), now, now, expiresAt)
  ]);
  await env.DB.prepare(
    "UPDATE sessions SET revoked_at = ? WHERE user_login = ? AND revoked_at = 0 AND id NOT IN (SELECT id FROM sessions WHERE user_login = ? AND revoked_at = 0 AND expires_at > ? ORDER BY last_seen_at DESC, created_at DESC LIMIT ?)"
  ).bind(now, login, login, now, MAX_ACTIVE_SESSIONS).run();
  return { token, id, expiresAt, idleTimeoutMs: SESSION_IDLE_MS };
}

async function requireSession(request, env, expectedLogin = "") {
  const token = extractBearerToken(request);
  if (!token) throw httpError(403, "Сессия недействительна. Войдите снова.", "TOKEN_REQUIRED");
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT s.id AS session_id, s.user_login, s.device_name, s.created_at AS session_created_at, s.last_seen_at, s.expires_at, u.* FROM sessions s JOIN users u ON u.login = s.user_login WHERE s.token_hash = ? AND s.revoked_at = 0 LIMIT 1"
  ).bind(tokenHash).first();
  const now = Date.now();
  if (!row || Number(row.expires_at) <= now || Number(row.last_seen_at) + SESSION_IDLE_MS <= now) {
    if (row?.session_id) {
      await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(now, row.session_id).run();
    }
    throw httpError(403, "Сессия завершена после 12 часов бездействия. Войдите снова.", "INVALID_SESSION");
  }
  if (expectedLogin && expectedLogin !== row.user_login) {
    throw httpError(403, "Сессия не относится к указанному аккаунту", "SESSION_ACCOUNT_MISMATCH");
  }
  if (now - Number(row.last_seen_at) >= SESSION_TOUCH_INTERVAL_MS) {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ? AND revoked_at = 0").bind(now, row.session_id).run();
    row.last_seen_at = now;
  }
  return { user: row, login: row.user_login, sessionId: row.session_id };
}

function validateData(data, env) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw httpError(400, "Данные бюджета должны быть JSON-объектом", "DATA_INVALID");
  }
  const serialized = JSON.stringify(data);
  const size = encoder.encode(serialized).length;
  if (size > getMaxDataBytes(env)) {
    throw httpError(413, "Объем данных превышает допустимый размер", "DATA_TOO_LARGE", {
      maxBytes: getMaxDataBytes(env),
      actualBytes: size
    });
  }
  return { serialized, size };
}

function splitData(serialized) {
  const chunks = [];
  let offset = 0;
  while (offset < serialized.length) {
    let end = Math.min(serialized.length, offset + DATA_CHUNK_CHARS);
    if (end < serialized.length) {
      const previousCode = serialized.charCodeAt(end - 1);
      if (previousCode >= 0xd800 && previousCode <= 0xdbff) end -= 1;
    }
    chunks.push(serialized.slice(offset, end));
    offset = end;
  }
  return chunks.length ? chunks : ["{}"];
}

async function readUserData(env, user) {
  if (!user.data_version) {
    try {
      const parsed = JSON.parse(String(user.data_json || "{}"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      throw httpError(500, "Облачные данные аккаунта повреждены", "D1_DATA_CORRUPTED");
    }
  }
  const result = await env.DB.prepare(
    "SELECT chunk_index, chunk_text FROM user_data_chunks WHERE user_login = ? AND save_id = ? ORDER BY chunk_index"
  ).bind(user.login, user.data_version).all();
  const rows = result.results || [];
  if (rows.length !== Number(user.data_chunk_count)) {
    throw httpError(503, "Облачное состояние временно недоступно", "D1_CHUNKS_INCOMPLETE");
  }
  try {
    return JSON.parse(rows.map((row) => row.chunk_text).join(""));
  } catch {
    throw httpError(500, "Облачные данные аккаунта повреждены", "D1_DATA_CORRUPTED");
  }
}

async function register(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const password = normalizePassword(body.password, { enforceStrength: true });
  await applyAuthRateLimits(env, request, login);
  if (await getUser(env, login)) throw httpError(409, "Такой логин уже существует", "LOGIN_EXISTS");

  const now = new Date().toISOString();
  const passwordRecord = await createPasswordRecord(password, env);
  const recoveryCode = formatRecoveryCode();
  try {
    await env.DB.prepare(
      "INSERT INTO users (login, password_hash, password_salt, password_iterations, password_algo, data_json, created_at, updated_at, last_login_at, revision, recovery_code_hash, recovery_created_at, password_changed_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, 0, ?, ?, ?)"
    ).bind(
      login,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      passwordRecord.algo,
      now,
      now,
      now,
      await recoveryHash(recoveryCode),
      now,
      now
    ).run();
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint")) {
      throw httpError(409, "Такой логин уже существует", "LOGIN_EXISTS");
    }
    throw error;
  }
  const session = await createSession(env, login, request, body.deviceName);
  logEvent("info", "register.success", { requestId: meta.requestId, login });
  return jsonOk(meta, request, env, { ...session, recoveryCode, revision: 0 }, 201);
}

async function login(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const password = normalizePassword(body.password);
  await applyAuthRateLimits(env, request, login);
  const user = await getUser(env, login);
  if (!user) {
    await delay(350);
    throw httpError(401, "Неверный логин или пароль", "INVALID_CREDENTIALS");
  }
  const verification = await verifyPassword(user, password, env);
  if (!verification.ok) {
    await delay(350);
    throw httpError(401, "Неверный логин или пароль", "INVALID_CREDENTIALS");
  }
  const now = new Date().toISOString();
  if (verification.needsUpgrade) {
    const upgraded = await createPasswordRecord(password, env);
    await env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, password_algo = ?, password_changed_at = ?, last_login_at = ? WHERE login = ?"
    ).bind(upgraded.hash, upgraded.salt, upgraded.iterations, upgraded.algo, now, now, login).run();
  } else {
    await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE login = ?").bind(now, login).run();
  }
  const session = await createSession(env, login, request, body.deviceName);
  logEvent("info", "login.success", { requestId: meta.requestId, login, upgraded: verification.needsUpgrade });
  return jsonOk(meta, request, env, { ...session, revision: Number(user.revision) || 0 });
}

async function loadData(request, env, meta) {
  const expectedLogin = normalizeLogin(new URL(request.url).searchParams.get("login"));
  const { user, login } = await requireSession(request, env, expectedLogin);
  const data = await readUserData(env, user);
  logEvent("info", "load.success", { requestId: meta.requestId, login, revision: Number(user.revision) || 0 });
  return jsonOk(meta, request, env, {
    data,
    revision: Number(user.revision) || 0,
    updatedAt: user.updated_at || null,
    maxDataBytes: getMaxDataBytes(env)
  });
}

async function saveData(request, env, meta) {
  const body = await readJsonBody(request, getMaxDataBytes(env) + 65_536);
  const login = normalizeLogin(body.login);
  const baseRevision = Number(body.baseRevision);
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw httpError(400, "Для сохранения нужна корректная базовая ревизия", "REVISION_REQUIRED");
  }
  await requireSession(request, env, login);
  const { serialized, size } = validateData(body.data, env);
  const saveId = crypto.randomUUID();
  const chunks = splitData(serialized);
  const nowMs = Date.now();
  const updatedAt = new Date(nowMs).toISOString();
  const statements = chunks.map((chunk, index) => env.DB.prepare(
    "INSERT INTO user_data_chunks (user_login, save_id, chunk_index, chunk_text, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(login, saveId, index, chunk, nowMs));
  statements.push(env.DB.prepare(
    "UPDATE users SET data_version = ?, data_chunk_count = ?, data_size_bytes = ?, data_json = '{}', updated_at = ?, revision = revision + 1 WHERE login = ? AND revision = ?"
  ).bind(saveId, chunks.length, size, updatedAt, login, baseRevision));
  const results = await env.DB.batch(statements);
  const updateResult = results[results.length - 1];
  if (Number(updateResult?.meta?.changes) !== 1) {
    await env.DB.prepare(
      "DELETE FROM user_data_chunks WHERE user_login = ? AND save_id = ?"
    ).bind(login, saveId).run();
    const current = await getUser(env, login);
    throw httpError(409, "Облачные данные изменились на другом устройстве", "REVISION_CONFLICT", {
      serverRevision: Number(current?.revision) || 0,
      serverUpdatedAt: current?.updated_at || null
    });
  }
  await env.DB.prepare(
    "DELETE FROM user_data_chunks WHERE user_login = ? AND save_id <> (SELECT data_version FROM users WHERE login = ?)"
  ).bind(login, login).run();
  const revision = baseRevision + 1;
  logEvent("info", "save.success", { requestId: meta.requestId, login, revision, size, chunks: chunks.length });
  return jsonOk(meta, request, env, { revision, updatedAt, size });
}

async function touchSession(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const { sessionId } = await requireSession(request, env, login);
  return jsonOk(meta, request, env, { sessionId, touchedAt: new Date().toISOString() });
}

async function logout(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const { sessionId } = await requireSession(request, env, login);
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(Date.now(), sessionId).run();
  logEvent("info", "logout.success", { requestId: meta.requestId, login, sessionId });
  return jsonOk(meta, request, env);
}

async function listSessions(request, env, meta) {
  const expectedLogin = normalizeLogin(new URL(request.url).searchParams.get("login"));
  const { login, sessionId } = await requireSession(request, env, expectedLogin);
  const now = Date.now();
  const result = await env.DB.prepare(
    "SELECT id, device_name, created_at, last_seen_at, expires_at FROM sessions WHERE user_login = ? AND revoked_at = 0 AND expires_at > ? AND last_seen_at > ? ORDER BY last_seen_at DESC"
  ).bind(login, now, now - SESSION_IDLE_MS).all();
  const sessions = (result.results || []).map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
    expiresAt: Number(row.expires_at),
    current: row.id === sessionId
  }));
  return jsonOk(meta, request, env, { sessions, maxSessions: MAX_ACTIVE_SESSIONS });
}

async function revokeSession(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const { sessionId } = await requireSession(request, env, login);
  const now = Date.now();
  if (body.allOther === true) {
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_login = ? AND id <> ? AND revoked_at = 0")
      .bind(now, login, sessionId).run();
  } else {
    const targetId = String(body.sessionId || "");
    if (!/^(?:[0-9a-f]{32}|[0-9a-f-]{36})$/i.test(targetId)) throw httpError(400, "Некорректный идентификатор сессии", "SESSION_ID_INVALID");
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_login = ? AND revoked_at = 0")
      .bind(now, targetId, login).run();
  }
  logEvent("info", "session.revoked", { requestId: meta.requestId, login });
  return jsonOk(meta, request, env);
}

async function changePassword(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const currentPassword = normalizePassword(body.currentPassword);
  const newPassword = normalizePassword(body.newPassword, { enforceStrength: true });
  const { user, sessionId } = await requireSession(request, env, login);
  const verification = await verifyPassword(user, currentPassword, env);
  if (!verification.ok) throw httpError(401, "Текущий пароль указан неверно", "INVALID_CREDENTIALS");
  const record = await createPasswordRecord(newPassword, env);
  const nowIso = new Date().toISOString();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, password_algo = ?, password_changed_at = ? WHERE login = ?")
      .bind(record.hash, record.salt, record.iterations, record.algo, nowIso, login),
    env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_login = ? AND id <> ? AND revoked_at = 0")
      .bind(now, login, sessionId)
  ]);
  logEvent("info", "password.changed", { requestId: meta.requestId, login });
  return jsonOk(meta, request, env);
}

async function recoverPassword(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  const newPassword = normalizePassword(body.newPassword, { enforceStrength: true });
  const code = normalizeRecoveryCode(body.recoveryCode);
  await applyAuthRateLimits(env, request, login);
  const user = await getUser(env, login);
  const suppliedHash = await recoveryHash(code);
  if (!user || !code || !timingSafeEqual(suppliedHash, user.recovery_code_hash || "")) {
    await delay(350);
    throw httpError(401, "Логин или код восстановления указан неверно", "RECOVERY_INVALID");
  }
  const record = await createPasswordRecord(newPassword, env);
  const nextRecoveryCode = formatRecoveryCode();
  const nowIso = new Date().toISOString();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, password_algo = ?, recovery_code_hash = ?, recovery_created_at = ?, password_changed_at = ? WHERE login = ?")
      .bind(record.hash, record.salt, record.iterations, record.algo, await recoveryHash(nextRecoveryCode), nowIso, nowIso, login),
    env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_login = ? AND revoked_at = 0").bind(now, login)
  ]);
  logEvent("info", "password.recovered", { requestId: meta.requestId, login });
  return jsonOk(meta, request, env, { recoveryCode: nextRecoveryCode });
}

async function regenerateRecoveryCode(request, env, meta) {
  const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  const login = normalizeLogin(body.login);
  await requireSession(request, env, login);
  const recoveryCode = formatRecoveryCode();
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET recovery_code_hash = ?, recovery_created_at = ? WHERE login = ?")
    .bind(await recoveryHash(recoveryCode), now, login).run();
  logEvent("info", "recovery.regenerated", { requestId: meta.requestId, login });
  return jsonOk(meta, request, env, { recoveryCode });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
