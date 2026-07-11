CREATE TABLE IF NOT EXISTS users (
  login TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  password_iterations INTEGER NOT NULL DEFAULT 30000,
  password_algo TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  session_token_hash TEXT NOT NULL DEFAULT '',
  session_expires_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  last_login_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
