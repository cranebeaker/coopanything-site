-- Community suggestions: a member links a co-op mod for a game, or reports that something on a card is wrong.
-- Nothing shows publicly until a person approves it (the private review queue in Discord, or the review tool).
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,            -- 'w:<igdb id>' for a Wanted game, else a listing id
  game TEXT NOT NULL,
  kind TEXT NOT NULL,              -- mod | correction
  url TEXT,
  note TEXT,
  by_user TEXT NOT NULL,           -- Discord user id
  by_name TEXT,
  created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS suggestions_status ON suggestions (status, created);
CREATE INDEX IF NOT EXISTS suggestions_user ON suggestions (by_user, created);
-- The same link can never be suggested twice for a game, even after a rejection (stops resubmitting spam).
CREATE UNIQUE INDEX IF NOT EXISTS suggestions_target_url ON suggestions (target, url) WHERE url IS NOT NULL;
-- The home page reads only the approved ones.
CREATE INDEX IF NOT EXISTS suggestions_approved ON suggestions (target) WHERE status = 'approved' AND kind = 'mod';
