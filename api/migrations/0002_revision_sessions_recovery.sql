ALTER TABLE users ADD COLUMN data_version TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN data_chunk_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN data_size_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN recovery_code_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN recovery_created_at TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_login TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_active
  ON sessions(user_login, revoked_at, expires_at, last_seen_at DESC);

CREATE TABLE user_data_chunks (
  user_login TEXT NOT NULL,
  save_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_login, save_id, chunk_index),
  FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
);

CREATE INDEX idx_user_data_chunks_current
  ON user_data_chunks(user_login, save_id, chunk_index);
