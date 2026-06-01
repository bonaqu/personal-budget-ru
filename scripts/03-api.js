const Api = {
  capabilities: {
    supportsBearerAuth: false
  },

  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    return Object.assign(error, details);
  },

  getMessage(error, fallback = "Не удалось связаться с сервером") {
    if (error instanceof Error && error.message?.trim()) {
      return error.message.trim();
    }
    return fallback;
  },

  getFriendlyMessage(error, fallback = "Не удалось связаться с сервером") {
    const code = String(error?.code || "");
    const status = Number(error?.status || 0);
    const serverCode = String(error?.payload?.code || "");

    if (code === "OFFLINE") {
      return "Похоже, интернет сейчас недоступен. Проверьте подключение и попробуйте снова.";
    }
    if (code === "TIMEOUT") {
      return "Сервис входа отвечает слишком долго. Попробуйте еще раз через несколько секунд.";
    }
    if (code === "NETWORK_UNAVAILABLE") {
      return "Не получилось подключиться к сервису входа. Обновите страницу или попробуйте позже.";
    }
    if (code === "HTTP_401" || serverCode === "INVALID_CREDENTIALS") {
      return "Неверный логин или пароль.";
    }
    if (code === "HTTP_403") {
      return "Нет доступа к данным аккаунта. Войдите заново или проверьте аккаунт.";
    }
    if (code === "HTTP_404") {
      return "Сервис входа временно недоступен. Попробуйте позже.";
    }
    if (code === "HTTP_429") {
      return "Слишком много попыток. Подождите немного и попробуйте снова.";
    }
    if (status >= 500 || ["HTTP_500", "HTTP_502", "HTTP_503", "HTTP_504"].includes(code)) {
      return "Сервис временно недоступен. Данные на устройстве сохранены, попробуйте позже.";
    }
    return this.getMessage(error, fallback);
  },

  redactEndpoint(endpoint = "") {
    return String(endpoint || "")
      .replace(/([?&](?:login|password|token)=)[^&]*/gi, "$1[hidden]")
      .replace(/([?&](?!(?:login|password|token)=)[^=]+)=([^&]+)/gi, "$1=[value]");
  },

  logTechnicalIssue(label, details = {}, level = "warning") {
    if (typeof console === "undefined") {
      return;
    }
    const method = typeof console[level] === "function" ? level : "warn";
    const parts = [
      `code=${details.code || "UNKNOWN"}`,
      `method=${details.method || "GET"}`,
      `endpoint=${this.redactEndpoint(details.endpoint || "")}`,
      `apiBase=${CONFIG.API_BASE}`,
      `online=${typeof navigator !== "undefined" ? navigator.onLine : "unknown"}`
    ];
    if (details.status) {
      parts.push(`status=${details.status}`);
    }
    if (details.serverCode) {
      parts.push(`serverCode=${details.serverCode}`);
    }
    if (details.message) {
      parts.push(`message=${details.message}`);
    }
    console[method](`[Budget API] ${label} | ${parts.join(" | ")}`);
  },

  messageForStatus(status, serverMessage = "") {
    if (serverMessage) {
      return serverMessage;
    }
    const fallback = {
      400: "Сервис получил некорректный запрос",
      401: "Неверный логин или пароль",
      403: "Нет доступа к данным аккаунта",
      404: "Сервис не найден",
      408: "Сервер не ответил вовремя",
      409: "Конфликт данных. Попробуйте повторить действие",
      429: "Слишком много попыток. Попробуйте позже",
      500: "Внутренняя ошибка сервера",
      502: "Сервис временно вернул ошибку",
      503: "Сервис временно недоступен",
      504: "Сервер не ответил вовремя"
    };
    return fallback[status] || `Ошибка сервиса (${status})`;
  },

  async request(endpoint, method = "GET", body = null, { timeout = 10000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestHeaders = { ...headers };
    const normalizedMethod = String(method || "GET").toUpperCase();
    const hasBody = body !== null && body !== undefined;

    if (hasBody && !requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: normalizedMethod,
      headers: requestHeaders,
      signal: controller.signal,
      body: hasBody ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let payload = null;
      let serverMessage = "";
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        payload = await response.json().catch(() => null);
        if (typeof payload?.error === "string") {
          serverMessage = payload.error.trim();
        }
      } else {
        serverMessage = await response.text().then((text) => text.trim()).catch(() => "");
      }

      const error = this.createError(
        `HTTP_${response.status}`,
        this.messageForStatus(response.status, serverMessage),
        {
          endpoint,
          method: normalizedMethod,
          status: response.status,
          payload,
          serverMessage
        }
      );
      const serverCode = String(payload?.code || payload?.errorCode || "");

      this.logTechnicalIssue("request failed", {
        endpoint,
        method: normalizedMethod,
        status: response.status,
        serverCode,
        code: error.code,
        message: error.message
      }, response.status >= 500 ? "error" : "warning");

      Diagnostics.report("api-request:failed", {
        endpoint: this.redactEndpoint(endpoint),
        method: normalizedMethod,
        status: response.status,
        code: error.code,
        message: error.message
      }, response.status >= 500 ? "error" : "warning");

      throw error;
    }

    return response;
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    const normalized = error?.name === "AbortError"
      ? this.createError("TIMEOUT", "Сервис входа отвечает слишком долго. Попробуйте еще раз через несколько секунд.", { endpoint, method })
      : error instanceof TypeError
        ? (typeof navigator !== "undefined" && navigator.onLine === false
          ? this.createError("OFFLINE", "Похоже, интернет сейчас недоступен. Проверьте подключение и попробуйте снова.", { endpoint, method })
          : this.createError("NETWORK_UNAVAILABLE", "Не получилось подключиться к сервису входа. Обновите страницу или попробуйте позже.", { endpoint, method }))
        : this.createError("REQUEST_FAILED", this.getMessage(error), {
          endpoint,
          method,
          originalError: error instanceof Error ? error.stack : String(error)
        });

    this.logTechnicalIssue("request failed", {
      endpoint,
      method,
      code: normalized.code,
      message: normalized.message
    }, normalized.code === "REQUEST_FAILED" ? "error" : "warning");

    Diagnostics.report("api-request:failed", {
      endpoint: this.redactEndpoint(endpoint),
      method,
      code: normalized.code,
      message: normalized.message
    }, normalized.code === "REQUEST_FAILED" ? "error" : "warning");

    throw normalized;
  } finally {
    clearTimeout(timeoutId);
  }
},

  async probeConnection() {
    let lastError = null;
    try {
      const response = await this.request("/health", "GET", null, { timeout: 3000 });
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload === "object" && payload.ok === true) {
        this.capabilities.supportsBearerAuth = true;
        return { ok: true, mode: "modern" };
      }
      this.capabilities.supportsBearerAuth = false;
      return { ok: true, mode: "legacy" };
    } catch (error) {
      lastError = error;
    }

    for (const probe of [
      { endpoint: "/health", method: "HEAD" },
      { endpoint: "/", method: "HEAD" }
    ]) {
      try {
        await this.request(probe.endpoint, probe.method, null, { timeout: 3000 });
        this.capabilities.supportsBearerAuth = false;
        return { ok: true, mode: "legacy" };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      ok: false,
      code: lastError?.code || "NETWORK_UNAVAILABLE",
      message: this.getFriendlyMessage(lastError, "Сервис авторизации недоступен")
    };
  },

  async login(login, password) {
    const delays = [0, 500, 1400];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        const response = await this.request("/login", "POST", { login, password });
        const payload = await response.json().catch(() => ({}));
        const token = payload.token || payload.data?.token || password;
        this.capabilities.supportsBearerAuth = Boolean(payload.token || payload.data?.token);
        return { ok: true, token };
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length - 1) {
          throw error;
        }
      }
    }
    throw lastError || this.createError("REQUEST_FAILED", "Не удалось выполнить вход");
  },

  async register(login, password) {
    const delays = [0, 650, 1600];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        const response = await this.request("/register", "POST", { login, password });
        const payload = await response.json().catch(() => ({}));
        const token = payload.token || payload.data?.token || password;
        this.capabilities.supportsBearerAuth = Boolean(payload.token || payload.data?.token);
        return { ok: true, token };
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length - 1) {
          throw error;
        }
      }
    }
    throw lastError || this.createError("REQUEST_FAILED", "Не удалось создать аккаунт");
  },

  isRetryable(error) {
    const code = error?.code || "";
    const serverCode = String(error?.payload?.code || "");
    return code === "TIMEOUT" ||
      code === "OFFLINE" ||
      code === "NETWORK_UNAVAILABLE" ||
      code === "REQUEST_FAILED" ||
      code === "HTTP_408" ||
      serverCode === "STORAGE_CONFLICT" ||
      code === "HTTP_429" ||
      code === "HTTP_500" ||
      code === "HTTP_502" ||
      code === "HTTP_503" ||
      code === "HTTP_504";
  },

  isAuthSessionError(error) {
    const code = String(error?.code || "");
    const serverCode = String(error?.payload?.code || "");
    return code === "HTTP_401" ||
      code === "HTTP_403" ||
      serverCode === "INVALID_SESSION" ||
      serverCode === "TOKEN_REQUIRED" ||
      serverCode === "USER_NOT_FOUND";
  },

  async load(login, token = null) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await this.request(`/load?login=${encodeURIComponent(login)}`, "GET", null, { headers });
    const payload = await response.json();
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      return payload.data || {};
    }
    return payload;
  },

  async confirmSession(login, token) {
    if (!login || !token) {
      return false;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const delays = [0, 350, 900];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        await this.request(`/load?login=${encodeURIComponent(login)}`, "GET", null, {
          headers,
          timeout: 7000
        });
        return true;
      } catch (error) {
        lastError = error;
        if (!this.isAuthSessionError(error) && !this.isRetryable(error)) {
          throw error;
        }
      }
    }
    if (lastError && !this.isAuthSessionError(lastError)) {
      throw lastError;
    }
    return false;
  },

  async save(login, token, data) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const payload = {
      login,
      password: token,
      data
    };
    const delays = [0, 600, 1600];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        await this.request("/save", "POST", payload, { headers });
        return;
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length - 1) {
          throw error;
        }
      }
    }
    throw lastError || this.createError("REQUEST_FAILED", "Не удалось сохранить изменения");
  },

  async logout(login, token) {
    if (!login || !token) {
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const delays = [0, 450, 1200];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        await this.request("/logout", "POST", { login, password: token }, { timeout: 5000, headers });
        return;
      } catch (error) {
        lastError = error;
        const serverCode = String(error?.payload?.code || "");
        if (
          error?.code === "HTTP_404" ||
          error?.code === "HTTP_405" ||
          serverCode === "INVALID_SESSION" ||
          serverCode === "TOKEN_REQUIRED" ||
          serverCode === "USER_NOT_FOUND"
        ) {
          return;
        }
        const isConflict = error?.code === "HTTP_409" || serverCode === "STORAGE_CONFLICT";
        if ((isConflict || this.isRetryable(error)) && attempt < delays.length - 1) {
          continue;
        }
        throw error;
      }
    }
    throw lastError || this.createError("REQUEST_FAILED", "Не удалось завершить сессию");
  }
};
