-- Personal API tokens: a dev lets their AI edit their own listings. Only a hash is stored, never the token.
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  label TEXT,
  hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,        -- the first characters, so a person can tell tokens apart
  roles TEXT NOT NULL,         -- Discord roles when it was made (a token never has owner powers)
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  last_used INTEGER
);
CREATE INDEX IF NOT EXISTS api_tokens_user ON api_tokens (user_id);
