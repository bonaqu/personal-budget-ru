INSERT OR IGNORE INTO sessions (
  id,
  user_login,
  token_hash,
  device_name,
  created_at,
  last_seen_at,
  expires_at,
  revoked_at
)
SELECT
  lower(hex(randomblob(16))),
  login,
  session_token_hash,
  'Ранее авторизованное устройство',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  session_expires_at,
  0
FROM users
WHERE session_token_hash IS NOT NULL
  AND session_token_hash <> ''
  AND session_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000;
