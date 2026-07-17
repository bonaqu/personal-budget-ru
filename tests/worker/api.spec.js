import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "http://app.test";

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function api(path, { method = "GET", token = "", body } = {}) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await exports.default.fetch(`http://api.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, json: await response.json() };
}

describe("Personal Budget Worker", () => {
  it("reports D1 readiness and exposes safe diagnostics", async () => {
    const result = await api("/health");
    expect(result.response.status).toBe(200);
    expect(result.json).toMatchObject({
      ok: true,
      service: "personal-budget-worker",
      status: "ok",
      storage: { type: "cloudflare-d1", status: "ready" },
      apiVersion: 2
    });
    expect(result.response.headers.get("x-api-version")).toBe("2");
    expect(result.response.headers.get("server-timing")).toMatch(/^app;dur=\d+$/);
    expect(result.response.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
  });

  it("logs in with a legacy SHA-256 password and upgrades it to the production PBKDF2 limit", async () => {
    const login = `legacy_${crypto.randomUUID().slice(0, 8)}`;
    const password = "legacy password that remains valid";
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO users (login, password_hash, password_algo, data_json, created_at, updated_at, revision) VALUES (?, ?, '', '{}', ?, ?, 0)"
    ).bind(login, await sha256Hex(password), now, now).run();

    const result = await api("/login", { method: "POST", body: { login, password, deviceName: "Legacy test" } });
    expect(result.response.status).toBe(200);
    const upgraded = await env.DB.prepare(
      "SELECT password_algo, password_iterations, length(password_salt) AS salt_length FROM users WHERE login = ?"
    ).bind(login).first();
    expect(upgraded).toMatchObject({ password_algo: "pbkdf2-sha256", password_iterations: 100000, salt_length: 32 });
  });

  it("registers, saves with CAS and rejects a stale revision", async () => {
    const login = `cas_${crypto.randomUUID().slice(0, 8)}`;
    const registered = await api("/register", {
      method: "POST",
      body: { login, password: "correct horse battery staple", deviceName: "Тестовый ПК" }
    });
    expect(registered.response.status).toBe(201);
    expect(registered.json.token).toMatch(/^[a-f0-9]{64}$/);
    expect(registered.json.recoveryCode).toMatch(/^[A-F0-9-]+$/);

    const firstSave = await api("/save", {
      method: "POST",
      token: registered.json.token,
      body: { login, baseRevision: 0, data: { transactions: [{ id: "tx-1", amount: 10 }] } }
    });
    expect(firstSave.response.status).toBe(200);
    expect(firstSave.json.revision).toBe(1);

    const staleSave = await api("/save", {
      method: "POST",
      token: registered.json.token,
      body: { login, baseRevision: 0, data: { transactions: [] } }
    });
    expect(staleSave.response.status).toBe(409);
    expect(staleSave.json.code).toBe("REVISION_CONFLICT");
    expect(staleSave.json.serverRevision).toBe(1);
    const chunks = await env.DB.prepare("SELECT COUNT(DISTINCT save_id) AS saves FROM user_data_chunks WHERE user_login = ?")
      .bind(login).first();
    expect(Number(chunks.saves)).toBe(1);

    const loaded = await api(`/load?login=${encodeURIComponent(login)}`, { token: registered.json.token });
    expect(loaded.response.status).toBe(200);
    expect(loaded.json.revision).toBe(1);
    expect(loaded.json.data.transactions[0].id).toBe("tx-1");
  });

  it("keeps at most three active sessions and logs out only the current device", async () => {
    const login = `sessions_${crypto.randomUUID().slice(0, 8)}`;
    const password = "long enough password";
    const registration = await api("/register", { method: "POST", body: { login, password, deviceName: "Первое" } });
    const tokens = [registration.json.token];
    for (const deviceName of ["Второе", "Третье", "Четвертое"]) {
      const result = await api("/login", { method: "POST", body: { login, password, deviceName } });
      expect(result.response.status).toBe(200);
      tokens.push(result.json.token);
    }

    const sessions = await api(`/sessions?login=${encodeURIComponent(login)}`, { token: tokens[3] });
    expect(sessions.response.status).toBe(200);
    expect(sessions.json.sessions).toHaveLength(3);
    expect(sessions.json.sessions.filter((item) => item.current)).toHaveLength(1);

    const touched = await api("/session/touch", { method: "POST", token: tokens[3], body: { login } });
    expect(touched.response.status).toBe(200);
    expect(touched.json.sessionId).toBe(sessions.json.sessions.find((item) => item.current).id);

    const oldSession = await api(`/load?login=${encodeURIComponent(login)}`, { token: tokens[0] });
    expect(oldSession.response.status).toBe(403);

    const logout = await api("/logout", { method: "POST", token: tokens[3], body: { login } });
    expect(logout.response.status).toBe(200);
    const otherSession = await api(`/load?login=${encodeURIComponent(login)}`, { token: tokens[2] });
    expect(otherSession.response.status).toBe(200);
  });

  it("expires an idle session after twelve hours", async () => {
    const login = `idle_${crypto.randomUUID().slice(0, 8)}`;
    const registered = await api("/register", {
      method: "POST",
      body: { login, password: "another strong password" }
    });
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE user_login = ?")
      .bind(Date.now() - 12 * 60 * 60 * 1000 - 1, login).run();
    const loaded = await api(`/load?login=${encodeURIComponent(login)}`, { token: registered.json.token });
    expect(loaded.response.status).toBe(403);
    expect(loaded.json.code).toBe("INVALID_SESSION");
  });

  it("recovers a password once and rotates the recovery code", async () => {
    const login = `recover_${crypto.randomUUID().slice(0, 8)}`;
    const registered = await api("/register", {
      method: "POST",
      body: { login, password: "initial strong password" }
    });
    const recovered = await api("/password/recover", {
      method: "POST",
      body: { login, recoveryCode: registered.json.recoveryCode, newPassword: "replacement strong password" }
    });
    expect(recovered.response.status).toBe(200);
    expect(recovered.json.recoveryCode).not.toBe(registered.json.recoveryCode);

    const reused = await api("/password/recover", {
      method: "POST",
      body: { login, recoveryCode: registered.json.recoveryCode, newPassword: "third strong password" }
    });
    expect(reused.response.status).toBe(401);

    const loginResult = await api("/login", {
      method: "POST",
      body: { login, password: "replacement strong password" }
    });
    expect(loginResult.response.status).toBe(200);
  });

  it("keeps structured logs useful without writing account identifiers or credentials", async () => {
    const login = `private_${crypto.randomUUID().slice(0, 8)}`;
    const password = "private password for log test";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const registered = await api("/register", {
        method: "POST",
        body: { login, password, deviceName: "Private device" }
      });
      expect(registered.response.status).toBe(201);
      const renderedLogs = logSpy.mock.calls.map((args) => args.join(" "));
      expect(renderedLogs.some((line) => line.includes('"tag":"register.success"'))).toBe(true);
      const combined = renderedLogs.join("\n");
      expect(combined).not.toContain(login);
      expect(combined).not.toContain(password);
      expect(combined).not.toContain(registered.json.token);
      expect(combined).not.toContain(registered.json.recoveryCode);
    } finally {
      logSpy.mockRestore();
    }
  });
});
